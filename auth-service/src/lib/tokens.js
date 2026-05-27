'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('./secrets');

// Refresh token TTL: 7 days in seconds
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Sign a JWT with the secret fetched from Secret Manager.
 * Expires in 24 hours.
 * @param {{ userId: string, email: string }} payload
 * @returns {Promise<string>} signed JWT
 */
async function signJwt(payload) {
  const secret = await getJwtSecret();
  return jwt.sign(
    { user_id: payload.userId, email: payload.email },
    secret,
    { expiresIn: '24h' }
  );
}

/**
 * Generate a cryptographically random refresh token.
 * Returns both the raw token (to set in cookie) and its SHA-256 hash
 * (to store in Firestore — never store raw tokens).
 * @returns {{ raw: string, hash: string }}
 */
function generateRefreshToken() {
  const raw = crypto.randomBytes(64).toString('hex');
  const hash = hashToken(raw);
  return { raw, hash };
}

/**
 * SHA-256 hash a token string. Used for both storage and lookup.
 * @param {string} token
 * @returns {string} hex-encoded hash
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Expiry timestamp (JS Date) for a new refresh token.
 */
function refreshTokenExpiry() {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
}

module.exports = { signJwt, generateRefreshToken, hashToken, refreshTokenExpiry, REFRESH_TOKEN_TTL_SECONDS };
