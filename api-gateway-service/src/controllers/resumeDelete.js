'use strict';

const { Storage } = require('@google-cloud/storage');
const { Firestore } = require('@google-cloud/firestore');
const { logRequest } = require('../lib/gatewayLogger');

const storage = new Storage();
const firestore = new Firestore();

const BUCKET_NAME = process.env.GCS_BUCKET_NAME;

const deleteResume = async (req, res) => {
  const userId = req.user.user_id;
  const start = Date.now();

  try {
    console.log(`[deleteResume] START userId=${userId}`);

    const doc = await firestore.collection('uploadedResumes').doc(userId).get();

    if (!doc.exists) {
      logRequest({ userId, route: '/resume/delete', method: 'DELETE', statusCode: 404, durationMs: Date.now() - start, ip: req.ip });
      return res.status(404).json({ error: 'No resume found' });
    }

    const { gcsPath } = doc.data();

    if (gcsPath) {
      console.log(`[deleteResume] Deleting GCS object gs://${BUCKET_NAME}/${gcsPath}`);
      await storage.bucket(BUCKET_NAME).file(gcsPath).delete({ ignoreNotFound: true });
      console.log(`[deleteResume] GCS delete complete`);
    }

    // Parsed resume is always at resume/{userId}.json
    const parsedPath = `resume/${userId}.json`;
    console.log(`[deleteResume] Deleting parsed resume gs://${BUCKET_NAME}/${parsedPath}`);
    await storage.bucket(BUCKET_NAME).file(parsedPath).delete({ ignoreNotFound: true });
    console.log(`[deleteResume] Parsed resume delete complete`);

    await firestore.collection('uploadedResumes').doc(userId).delete();
    console.log(`[deleteResume] Firestore doc deleted`);

    logRequest({ userId, route: '/resume/delete', method: 'DELETE', statusCode: 200, durationMs: Date.now() - start, ip: req.ip });
    return res.status(200).json({ ack: true });
  } catch (err) {
    console.error(`[deleteResume] FAILED — ${err.message}`, err);
    logRequest({ userId, route: '/resume/delete', method: 'DELETE', statusCode: 500, durationMs: Date.now() - start, ip: req.ip });
    return res.status(500).json({ error: 'Failed to delete resume' });
  }
};

module.exports = { deleteResume };
