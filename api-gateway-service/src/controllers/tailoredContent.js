'use strict';

const { Storage } = require('@google-cloud/storage');

const storage = new Storage();
const ARTIFACTS_BUCKET = process.env.ARTIFACTS_BUCKET_NAME;

const getTailoredContent = async (req, res) => {
  const userId = req.user.user_id;
  const { job_id: draftId } = req.params;

  if (!draftId) {
    return res.status(400).json({ error: 'Invalid draft_id' });
  }

  const gcsPath = `rendered_resume/${userId}/${draftId}.pdf`;
  console.log(`[getTailoredContent] userId=${userId} path=${gcsPath}`);

  try {
    const file = storage.bucket(ARTIFACTS_BUCKET).file(gcsPath);
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: 'Not found' });
    }

    const [contents] = await file.download();
    return res.status(200).set('Content-Type', 'application/pdf').send(contents);
  } catch (err) {
    console.error(`[getTailoredContent] FAILED — ${err.message}`);
    return res.status(500).json({ error: 'Internal error' });
  }
};

const getTailoredTex = async (req, res) => {
  const userId = req.user.user_id;
  const { job_id: draftId } = req.params;

  if (!draftId) {
    return res.status(400).json({ error: 'Invalid draft_id' });
  }

  const gcsPath = `rendered_resume/${userId}/${draftId}.tex`;
  console.log(`[getTailoredTex] userId=${userId} path=${gcsPath}`);

  try {
    const file = storage.bucket(ARTIFACTS_BUCKET).file(gcsPath);
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: 'Not found' });
    }

    const [contents] = await file.download();
    return res.status(200).set('Content-Type', 'text/plain').send(contents);
  } catch (err) {
    console.error(`[getTailoredTex] FAILED — ${err.message}`);
    return res.status(500).json({ error: 'Internal error' });
  }
};

module.exports = { getTailoredContent, getTailoredTex };
