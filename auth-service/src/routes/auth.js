'use strict';

// Authentication routes.
//
// POST /auth/google          — verify Google ID token → issue JWT + set refresh cookie
// POST /auth/refresh         — rotate refresh token → issue new JWT + set new refresh cookie
// POST /auth/firebase-token  — exchange brew JWT → Firebase custom token (for Firestore SDK)

const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { admin, db } = require('../lib/firestore');
const { signJwt, generateRefreshToken, hashToken, refreshTokenExpiry } = require('../lib/tokens');
const { getJwtSecret } = require('../lib/secrets');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set the httpOnly refresh-token cookie on the response.
 * SameSite=None + Secure required for cross-site requests from Firebase Hosting
 * to a Cloud Run backend on a different origin.
 */
function setRefreshCookie(res, rawToken) {
  res.cookie('brew_token', rawToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  });
}

/**
 * Clear the refresh cookie (used on reuse detection and forced re-login).
 */
function clearRefreshCookie(res) {
  res.clearCookie('brew_token', { httpOnly: true, secure: true, sameSite: 'None' });
}

// ---------------------------------------------------------------------------
// POST /auth/google
// ---------------------------------------------------------------------------
router.post('/google', async (req, res) => {
  const ip = req.ip;
  const userAgent = req.headers['user-agent'] || '';
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: 'idToken is required' });
  }

  // ── Step 3: Verify Google ID token ─────────────────────────────────────
  let googlePayload;
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    googlePayload = {
      sub: decodedToken.uid,
      email: decodedToken.email,
    };
  } catch (err) {
    const reason = err.message || String(err);
    console.error(JSON.stringify({
      event: 'login_attempt',
      status: 'token_verification_failed',
      ip,
      userAgent,
      reason,
      timestamp: new Date().toISOString(),
    }));

    if (
      reason.includes('Token used too late') ||
      reason.includes('token is expired')
    ) {
      return res.status(401).json({ error: 'Sign in failed. Please try again.' });
    }
    if (reason.includes('audience') || reason.includes('aud')) {
      return res.status(401).json({ error: 'Sign in failed. Please try again.' });
    }
    if (
      reason.includes('ECONNREFUSED') ||
      reason.includes('ETIMEDOUT') ||
      reason.includes('ENOTFOUND') ||
      reason.includes('fetch') ||
      reason.includes('network')
    ) {
      return res.status(503).json({ error: 'Sign in is temporarily unavailable. Try again in a moment.' });
    }
    return res.status(400).json({ error: 'Sign in failed. Please try again.' });
  }

  const userId = googlePayload.sub;
  const email = googlePayload.email;

  console.log(JSON.stringify({
    event: 'login_attempt',
    userId,
    ip,
    userAgent,
    timestamp: new Date().toISOString(),
  }));

  // ── Step 4: Read user from Firestore ────────────────────────────────────
  let userSnap;
  try {
    userSnap = await db.collection('users').doc(userId).get();
  } catch (err) {
    const reason = err.message || String(err);
    console.error(JSON.stringify({
      event: 'user_read_failed',
      userId,
      reason,
      timestamp: new Date().toISOString(),
    }));
    if (reason.includes('UNAVAILABLE') || reason.includes('503')) {
      return res.status(503).json({ error: 'Service temporarily unavailable. Try again in a moment.' });
    }
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }

  if (!userSnap.exists) {
    // First sign-in — create user record
    try {
      await db.collection('users').doc(userId).set({
        email,
        google_id: userId,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        blocked: false,
      });
    } catch (err) {
      console.error(JSON.stringify({
        event: 'user_create_failed',
        userId,
        reason: err.message || String(err),
        timestamp: new Date().toISOString(),
      }));
      return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
    }
  } else {
    const userData = userSnap.data();
    if (userData.blocked === true) {
      console.log(JSON.stringify({
        event: 'blocked_login_attempt',
        userId,
        ip,
        timestamp: new Date().toISOString(),
      }));
      return res.status(401).json({ error: 'Your account has been suspended. Contact support.' });
    }
  }

  // ── Step 5: Sign JWT ────────────────────────────────────────────────────
  let jwtToken;
  try {
    jwtToken = await signJwt({ userId, email });
  } catch (err) {
    console.error(JSON.stringify({
      event: 'jwt_sign_failed',
      reason: err.message || String(err),
      timestamp: new Date().toISOString(),
    }));
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }

  // ── Step 6: Write refresh token (atomic — do NOT return JWT if this fails)
  const { raw: rawRefresh, hash: refreshHash } = generateRefreshToken();
  const family = refreshHash; // first token in a family is its own family ID
  const expiresAt = refreshTokenExpiry();

  try {
    await db.collection('refreshTokens').doc(refreshHash).set({
      userId,
      tokenHash: refreshHash,
      family,
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(JSON.stringify({
      event: 'refresh_token_write_failed',
      userId,
      reason: err.message || String(err),
      timestamp: new Date().toISOString(),
    }));
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }

  // ── Step 7: Update lastLoginAt (non-critical, fire-and-forget) ──────────
  db.collection('users').doc(userId).update({
    lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
  }).catch(() => {
    console.warn(JSON.stringify({
      event: 'last_login_update_failed',
      userId,
      timestamp: new Date().toISOString(),
    }));
  });

  // ── Step 8: Return JWT + set httpOnly cookie ─────────────────────────────
  setRefreshCookie(res, rawRefresh);
  return res.status(200).json({ token: jwtToken });
});

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------
router.post('/refresh', async (req, res) => {
  const ip = req.ip;
  const userAgent = req.headers['user-agent'] || '';

  // ── Read httpOnly cookie ─────────────────────────────────────────────────
  const rawToken = req.cookies && req.cookies.brew_token;

  if (!rawToken) {
    console.log(JSON.stringify({
      event: 'missing_refresh_attempt',
      reason: 'missing_cookie',
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
    }));
    return res.status(400).json({ error: 'Your session has expired. Please sign in again.' });
  }

  if (typeof rawToken !== 'string' || rawToken.length < 32) {
    console.log(JSON.stringify({
      event: 'missing_refresh_attempt',
      reason: 'malformed_cookie',
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
    }));
    return res.status(400).json({ error: 'Your session has expired. Please sign in again.' });
  }

  // ── Validate refresh token via Firestore hash lookup ─────────────────────
  const tokenHash = hashToken(rawToken);
  let tokenSnap;
  try {
    tokenSnap = await db.collection('refreshTokens').doc(tokenHash).get();
  } catch (err) {
    const reason = err.message || String(err);
    console.error(JSON.stringify({
      event: 'token_refresh_failed',
      reason,
      ip,
      timestamp: new Date().toISOString(),
    }));
    if (reason.includes('UNAVAILABLE') || reason.includes('503')) {
      return res.status(503).json({ error: 'Service temporarily unavailable. Try again in a moment.' });
    }
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }

  if (!tokenSnap.exists) {
    console.log(JSON.stringify({
      event: 'token_refresh_failed',
      reason: 'token_not_found',
      ip,
      timestamp: new Date().toISOString(),
    }));
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }

  const tokenData = tokenSnap.data();
  const { userId, family, expiresAt } = tokenData;

  // Check expiry
  if (expiresAt.toDate() < new Date()) {
    console.log(JSON.stringify({
      event: 'token_refresh_failed',
      reason: 'token_expired',
      userId,
      ip,
      timestamp: new Date().toISOString(),
    }));
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }

  // ── Reuse detection ───────────────────────────────────────────────────────
  // On rotation we mark the old token with usedAt. If it's presented again,
  // a stolen token is being replayed — revoke the entire family.
  if (tokenData.usedAt) {
    console.error(JSON.stringify({
      event: 'token_reuse_detected',
      userId,
      family,
      ip,
      timestamp: new Date().toISOString(),
    }));

    try {
      const familySnap = await db.collection('refreshTokens')
        .where('userId', '==', userId)
        .where('family', '==', family)
        .get();
      const batch = db.batch();
      familySnap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    } catch (err) {
      console.error(JSON.stringify({
        event: 'family_revocation_failed',
        userId,
        family,
        reason: err.message || String(err),
        timestamp: new Date().toISOString(),
      }));
    }

    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Suspicious activity detected. Please sign in again.' });
  }

  // ── Check blocked (piggybacks on the user read below) ────────────────────
  let userSnap;
  try {
    userSnap = await db.collection('users').doc(userId).get();
  } catch (err) {
    console.error(JSON.stringify({
      event: 'user_read_failed',
      userId,
      reason: err.message || String(err),
      timestamp: new Date().toISOString(),
    }));
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }

  if (userSnap.exists && userSnap.data().blocked === true) {
    console.log(JSON.stringify({
      event: 'blocked_refresh',
      userId,
      timestamp: new Date().toISOString(),
    }));
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Your account has been suspended. Contact support.' });
  }

  const email = userSnap.exists ? userSnap.data().email : '';

  // ── Atomic rotation: mark old as used + write new ─────────────────────────
  const { raw: newRawToken, hash: newHash } = generateRefreshToken();
  const newExpiry = refreshTokenExpiry();

  try {
    const batch = db.batch();
    batch.update(db.collection('refreshTokens').doc(tokenHash), {
      usedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(db.collection('refreshTokens').doc(newHash), {
      userId,
      tokenHash: newHash,
      family,
      expiresAt: admin.firestore.Timestamp.fromDate(newExpiry),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    console.error(JSON.stringify({
      event: 'rotation_failed',
      userId,
      reason: err.message || String(err),
      timestamp: new Date().toISOString(),
    }));
    clearRefreshCookie(res);
    return res.status(500).json({ error: 'Your session has expired. Please sign in again.' });
  }

  // ── Sign new JWT ──────────────────────────────────────────────────────────
  let jwtToken;
  try {
    jwtToken = await signJwt({ userId, email });
  } catch (err) {
    console.error(JSON.stringify({
      event: 'jwt_sign_failed',
      userId,
      reason: err.message || String(err),
      timestamp: new Date().toISOString(),
    }));
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }

  // ── Log refresh (sampled 10%) ─────────────────────────────────────────────
  if (Math.random() < 0.1) {
    console.log(JSON.stringify({
      event: 'token_refreshed',
      userId,
      timestamp: new Date().toISOString(),
    }));
  }

  setRefreshCookie(res, newRawToken);
  return res.status(200).json({ token: jwtToken });
});

// ---------------------------------------------------------------------------
// POST /auth/firebase-token
// ---------------------------------------------------------------------------
// Exchanges a valid brew JWT for a Firebase custom token so the frontend
// can call signInWithCustomToken() and use the Firestore SDK directly
// (e.g. onSnapshot for real-time draft status updates).
// ---------------------------------------------------------------------------
router.post('/firebase-token', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed authorization header' });
  }

  const rawJwt = authHeader.split(' ')[1];

  let decoded;
  try {
    const secret = await getJwtSecret();
    decoded = jwt.verify(rawJwt, secret);
  } catch (err) {
    const reason = err.name === 'TokenExpiredError' ? 'token_expired' : 'invalid_token';
    console.log(JSON.stringify({
      event: 'firebase_token_request_failed',
      reason,
      timestamp: new Date().toISOString(),
    }));
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const userId = decoded.user_id;
  if (!userId) {
    return res.status(401).json({ error: 'Invalid token payload' });
  }

  let firebaseCustomToken;
  try {
    firebaseCustomToken = await admin.auth().createCustomToken(userId);
  } catch (err) {
    console.error(JSON.stringify({
      event: 'firebase_custom_token_failed',
      userId,
      reason: err.message || String(err),
      timestamp: new Date().toISOString(),
    }));
    return res.status(500).json({ error: 'Failed to create Firebase token' });
  }

  return res.status(200).json({ token: firebaseCustomToken });
});

module.exports = router;
