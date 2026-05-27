'use strict';

const { Storage } = require('@google-cloud/storage');
const { Firestore } = require('@google-cloud/firestore');
const { CloudTasksClient } = require('@google-cloud/tasks');
const { v4: uuidv4 } = require('uuid');
const { logRequest } = require('../lib/gatewayLogger');

const storage = new Storage();
const firestore = new Firestore();
const tasksClient = new CloudTasksClient();

const BUCKET_NAME               = process.env.GCS_BUCKET_NAME;
const RESUME_PARSER_URL         = process.env.RESUME_PARSER_URL;
const RESUME_PARSER_TASKS_QUEUE = process.env.RESUME_PARSER_TASKS_QUEUE;
const GCP_PROJECT_ID            = process.env.GCP_PROJECT_ID;
const CLOUD_TASKS_LOCATION      = process.env.CLOUD_TASKS_LOCATION;

// Rate limit: max 5 uploads per user per hour
const _uploadRateMap = new Map();
const UPLOAD_RATE_MAX = 5;
const UPLOAD_RATE_WINDOW_MS = 60 * 60 * 1000;

function isUploadRateLimited(userId) {
  const now = Date.now();
  const entry = _uploadRateMap.get(userId);
  if (!entry || now > entry.resetAt) {
    _uploadRateMap.set(userId, { count: 1, resetAt: now + UPLOAD_RATE_WINDOW_MS });
    return false;
  }
  if (entry.count >= UPLOAD_RATE_MAX) return true;
  entry.count++;
  return false;
}

const uploadResume = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const userId = req.user.user_id;

  if (isUploadRateLimited(userId)) {
    return res.status(429).json({ error: 'Too many uploads. Please wait before uploading again.' });
  }
  const fileId = uuidv4();
  const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  const gcsPath = `raw_resumes/${userId}/${fileId}-${safeName}`;
  const start = Date.now();

  console.log(`[uploadResume] START userId=${userId} fileId=${fileId} file=${req.file.originalname} size=${req.file.size}`);

  try {
    const bucket = storage.bucket(BUCKET_NAME);
    const blob = bucket.file(gcsPath);

    console.log(`[uploadResume] Uploading to GCS bucket=${BUCKET_NAME} path=${gcsPath}`);
    await blob.save(req.file.buffer, {
      contentType: req.file.mimetype,
      resumable: false,
    });
    console.log(`[uploadResume] GCS upload complete`);

    const gcsUrl = `gs://${BUCKET_NAME}/${gcsPath}`;

    console.log(`[uploadResume] Writing Firestore doc userId=${userId}`);
    await firestore.collection('uploadedResumes').doc(userId).set({
      fileId,
      userId,
      originalName: req.file.originalname,
      gcsPath,
      gcsUrl,
      uploadedAt: Firestore.Timestamp.now(),
    });
    console.log(`[uploadResume] Firestore write complete`);

    // Enqueue parse job via Cloud Tasks
    const queuePath = tasksClient.queuePath(GCP_PROJECT_ID, CLOUD_TASKS_LOCATION, RESUME_PARSER_TASKS_QUEUE);
    const taskPayload = { fileId, userId, gcsPath, gcsUrl };

    await tasksClient.createTask({
      parent: queuePath,
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: `${RESUME_PARSER_URL}/parse`,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify(taskPayload)).toString('base64'),
          oidcToken: {
            serviceAccountEmail: `api-gateway-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com`,
            audience: RESUME_PARSER_URL,
          },
        },
      },
    });
    console.log(`[uploadResume] Cloud Tasks enqueued fileId=${fileId}`);

    logRequest({ userId, route: '/resume/upload', method: 'POST', statusCode: 201, durationMs: Date.now() - start, ip: req.ip });
    return res.status(201).json({ fileId, gcsUrl });
  } catch (err) {
    console.error(`[uploadResume] FAILED — ${err.message}`, err);
    logRequest({ userId, route: '/resume/upload', method: 'POST', statusCode: 500, durationMs: Date.now() - start, ip: req.ip });
    return res.status(500).json({ error: 'Upload failed' });
  }
};

module.exports = { uploadResume };
