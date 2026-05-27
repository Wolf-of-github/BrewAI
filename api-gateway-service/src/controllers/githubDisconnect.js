'use strict';

const { Firestore, FieldValue } = require('@google-cloud/firestore');
const { Storage } = require('@google-cloud/storage');
const { logRequest } = require('../lib/gatewayLogger');

const firestore = new Firestore();
const storage = new Storage();
const BUCKET = process.env.GCS_BUCKET_NAME;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

const disconnectGithub = async (req, res) => {
  const userId = req.user.user_id;
  const start = Date.now();

  try {
    // Revoke GitHub OAuth token so next connect forces account selection
    const userDoc = await firestore.collection('users').doc(userId).get();
    const accessToken = userDoc.exists ? userDoc.data().github_access_token : null;
    if (accessToken && GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) {
      await fetch(`https://api.github.com/applications/${GITHUB_CLIENT_ID}/token`, {
        method: 'DELETE',
        headers: {
          Authorization: `Basic ${Buffer.from(`${GITHUB_CLIENT_ID}:${GITHUB_CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github+json',
        },
        body: JSON.stringify({ access_token: accessToken }),
      }).catch((err) => console.warn(`[disconnectGithub] token revocation failed — ${err.message}`));
    }

    // Remove github fields from users doc
    await firestore.collection('users').doc(userId).update(
      { github_id: FieldValue.delete(), github_access_token: FieldValue.delete() }
    );

    // Delete githubReadmes doc
    await firestore.collection('githubReadmes').doc(userId).delete();

    // Delete GCS file if it exists
    if (BUCKET) {
      const file = storage.bucket(BUCKET).file(`github_projects/${userId}.json`);
      const [exists] = await file.exists();
      if (exists) await file.delete();
    }

    console.log(`[disconnectGithub] userId=${userId} disconnected`);
    logRequest({ userId, route: '/github/disconnect', method: 'DELETE', statusCode: 200, durationMs: Date.now() - start, ip: req.ip });
    return res.status(200).json({ ack: true });
  } catch (err) {
    console.error(`[disconnectGithub] FAILED — ${err.message}`);
    logRequest({ userId, route: '/github/disconnect', method: 'DELETE', statusCode: 500, durationMs: Date.now() - start, ip: req.ip });
    return res.status(500).json({ error: 'Internal error' });
  }
};

module.exports = { disconnectGithub };
