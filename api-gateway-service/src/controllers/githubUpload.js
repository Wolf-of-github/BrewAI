'use strict';

const { Firestore } = require('@google-cloud/firestore');
const { runGithubPipeline } = require('../lib/githubPipeline');
const { logRequest } = require('../lib/gatewayLogger');

const firestore = new Firestore();

const uploadGithubId = async (req, res) => {
  const { github_id } = req.body;
  const start = Date.now();

  if (!github_id) {
    return res.status(400).json({ error: 'github_id is required' });
  }

  const userId = req.user.user_id;
  const email = req.user.email;
  console.log(`[uploadGithubId] userId=${userId} github_id=${github_id}`);

  try {
    await firestore.collection('users').doc(userId).set(
      { github_id },
      { merge: true }
    );
    console.log(`[uploadGithubId] Firestore updated userId=${userId} github_id=${github_id}`);
  } catch (err) {
    console.error(`[uploadGithubId] Firestore write failed — ${err.message}`);
    logRequest({ userId, route: '/github-id/upload', method: 'POST', statusCode: 500, durationMs: Date.now() - start, ip: req.ip });
    return res.status(500).json({ error: 'Failed to save github_id' });
  }

  runGithubPipeline({ githubId: github_id, userId, email });

  logRequest({ userId, route: '/github-id/upload', method: 'POST', statusCode: 200, durationMs: Date.now() - start, ip: req.ip });
  return res.status(200).json({ ack: true, github_id });
};

module.exports = { uploadGithubId };
