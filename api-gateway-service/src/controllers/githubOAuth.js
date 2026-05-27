'use strict';

const { Firestore } = require('@google-cloud/firestore');
const { randomUUID } = require('crypto');
const { runGithubPipeline } = require('../lib/githubPipeline');
const { logRequest } = require('../lib/gatewayLogger');

const firestore = new Firestore();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

const getGithubOAuthUrl = (req, res) => {
  const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=read:user`;
  return res.json({ url });
};

const handleGithubOAuthCallback = async (req, res) => {
  const { code } = req.body;
  const start = Date.now();

  if (!code) {
    return res.status(400).json({ error: 'code is required' });
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error(`[handleGithubOAuthCallback] token exchange error: ${tokenData.error_description}`);
      return res.status(400).json({ error: tokenData.error_description ?? 'Token exchange failed' });
    }

    const accessToken = tokenData.access_token;

    const userResponse = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'BrewAI' },
    });

    if (!userResponse.ok) {
      const text = await userResponse.text();
      console.error(`[handleGithubOAuthCallback] GitHub user fetch failed status=${userResponse.status} body=${text}`);
      return res.status(500).json({ error: 'Failed to fetch GitHub user' });
    }

    const userData = await userResponse.json();
    const login = userData.login;
    const userId = req.user.user_id;
    const email = req.user.email;

    await firestore.collection('users').doc(userId).set(
      { github_id: login, github_access_token: accessToken },
      { merge: true }
    );
    console.log(`[handleGithubOAuthCallback] Firestore updated userId=${userId} github_id=${login}`);

    // Mark processing BEFORE responding so the frontend snapshot sees
    // status=processing by the time it subscribes — prevents stale completed state
    const runId = randomUUID();
    await firestore.collection('githubReadmes').doc(userId).set({
      userId,
      githubId: login,
      status: 'processing',
      runId,
      updatedAt: Firestore.Timestamp.now(),
    });
    console.log(`[handleGithubOAuthCallback] githubReadmes marked processing userId=${userId} runId=${runId}`);

    runGithubPipeline({ githubId: login, userId, email });

    logRequest({ userId, route: '/github/oauth/callback', method: 'POST', statusCode: 200, durationMs: Date.now() - start, ip: req.ip });
    return res.status(200).json({ ack: true, github_id: login, run_id: runId });
  } catch (err) {
    console.error(`[handleGithubOAuthCallback] error — ${err.message}`);
    const userId = req.user?.user_id ?? 'unknown';
    logRequest({ userId, route: '/github/oauth/callback', method: 'POST', statusCode: 500, durationMs: Date.now() - start, ip: req.ip });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getGithubOAuthUrl, handleGithubOAuthCallback };
