'use strict';

const { Firestore } = require('@google-cloud/firestore');
const { CloudTasksClient } = require('@google-cloud/tasks');
const { v4: uuidv4 } = require('uuid');
const { logRequest } = require('../lib/gatewayLogger');

const firestore = new Firestore();
const tasksClient = new CloudTasksClient();

const GCP_PROJECT_ID       = process.env.GCP_PROJECT_ID;
const GENAI_SERVICE_URL    = process.env.GENAI_SERVICE_URL;
const CLOUD_TASKS_QUEUE    = process.env.CLOUD_TASKS_QUEUE;
const CLOUD_TASKS_LOCATION = process.env.CLOUD_TASKS_LOCATION;

const FREE_DAILY_JD_LIMIT      = 3;
const PROMO_DAILY_JD_LIMIT     = 10;
const DEFAULT_TWEAKS_PER_DRAFT = 5;

const tailorResume = async (req, res) => {
  const userId = req.user.user_id;
  const { jd_text, user_instructions: prompt = '', draft_id: existingDraftId, one_page: onePage = false } = req.body;
  const start = Date.now();

  // New JD requires jd_text; tweak requires draft_id
  if (!existingDraftId && !jd_text) {
    return res.status(400).json({ error: 'jd_text is required for a new tailor' });
  }

  console.log(`[tailorResume] START userId=${userId} existingDraftId=${existingDraftId ?? 'new'}`);

  try {
    // ── Check resume exists ──────────────────────────────────────────────────
    const resumeSnapshot = await firestore
      .collection('uploadedResumes')
      .where('userId', '==', userId)
      .limit(1)
      .get();
    if (resumeSnapshot.empty) {
      return res.status(400).json({ error: 'No resume found. Please upload your resume first.' });
    }

    // ── Fetch user doc (needed for both JD limit and tweak limit) ────────────
    const userDoc = await firestore.collection('users').doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const plan = userData.plan ?? 'free';
    const maxTweaksPerDraft = plan === 'beta'
      ? (userData.promo_tweaks_per_jd ?? DEFAULT_TWEAKS_PER_DRAFT)
      : DEFAULT_TWEAKS_PER_DRAFT;

    // ── Resolve draft ────────────────────────────────────────────────────────
    let draftId;
    let jd;

    if (existingDraftId) {
      // ── TWEAK path ─────────────────────────────────────────────────────────
      const draftDoc = await firestore.collection('drafts').doc(existingDraftId).get();
      if (!draftDoc.exists || draftDoc.data().userId !== userId) {
        return res.status(404).json({ error: 'Draft not found' });
      }

      // Enforce per-draft tweak limit at the gateway before enqueuing
      const existingInstructions = draftDoc.data().instructions ?? [];
      if (existingInstructions.length >= maxTweaksPerDraft) {
        return res.status(429).json({
          error: `You've used all ${maxTweaksPerDraft} tweaks for this brew. Please start a new brew.`,
          limit_reached: true,
        });
      }

      draftId = existingDraftId;
      jd = draftDoc.data().jd;

      if (prompt) {
        await firestore.collection('drafts').doc(draftId).set({
          status: 'processing',
          instructions: Firestore.FieldValue.arrayUnion(prompt),
        }, { merge: true });
      }

    } else {
      // ── NEW JD path — enforce daily limit ──────────────────────────────────
      if (plan !== 'pro') {
        // Determine daily limit based on plan
        let dailyLimit = FREE_DAILY_JD_LIMIT;
        if (plan === 'beta') {
          // Auto-expire beta plan if promo has passed its expiry
          const expiry = userData.promo_expiry
            ? (userData.promo_expiry.toDate ? userData.promo_expiry.toDate() : new Date(userData.promo_expiry))
            : null;
          if (expiry && expiry < new Date()) {
            // Expired — drop back to free
            await firestore.collection('users').doc(userId).set(
              { plan: 'free', promo_expiry: null, promo_daily_limit: null },
              { merge: true }
            );
          } else {
            dailyLimit = userData.promo_daily_limit ?? PROMO_DAILY_JD_LIMIT;
          }
        }

        const today = new Date().toISOString().slice(0, 10);
        const storedDate = userData.daily_tailor_date ?? '';
        const dailyCount = storedDate === today ? (userData.daily_tailor_count ?? 0) : 0;

        if (dailyCount >= dailyLimit) {
          console.log(`[tailorResume] RATE LIMITED userId=${userId} count=${dailyCount}/${dailyLimit}`);
          return res.status(429).json({
            error: `You've used all ${dailyLimit} brews for today. Come back tomorrow${plan === 'free' ? ' or redeem a promo code for more' : ''}.`,
            daily_limit: dailyLimit,
            daily_count: dailyCount,
            limit_reached: true,
          });
        }

        // Increment daily counter atomically
        await firestore.collection('users').doc(userId).set(
          { daily_tailor_date: today, daily_tailor_count: dailyCount + 1 },
          { merge: true }
        );
        console.log(`[tailorResume] usage: ${dailyCount + 1}/${dailyLimit} today for userId=${userId}`);
      }

      // Create draft record
      draftId = uuidv4();
      jd = jd_text;
      await firestore.collection('drafts').doc(draftId).set({
        userId,
        jd,
        status: 'processing',
        createdAt: Firestore.Timestamp.now(),
      });
      console.log(`[tailorResume] New draft created draftId=${draftId}`);
    }

    const jobId = uuidv4();

    // ── Enqueue Cloud Tasks ──────────────────────────────────────────────────
    const queuePath = tasksClient.queuePath(GCP_PROJECT_ID, CLOUD_TASKS_LOCATION, CLOUD_TASKS_QUEUE);
    const taskPayload = { job_id: jobId, draft_id: draftId, user_id: userId, jd, prompt, max_tweaks: maxTweaksPerDraft, one_page: !!onePage };

    const task = {
      httpRequest: {
        httpMethod: 'POST',
        url: `${GENAI_SERVICE_URL}/tasks/generate`,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify(taskPayload)).toString('base64'),
        oidcToken: {
          serviceAccountEmail: `api-gateway-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com`,
          audience: GENAI_SERVICE_URL,
        },
      },
    };

    await tasksClient.createTask({ parent: queuePath, task });
    console.log(`[tailorResume] Cloud Tasks enqueued jobId=${jobId}`);

    // ── Increment lifetime jd_count (non-critical) ───────────────────────────
    firestore.collection('users').doc(userId).set(
      { jd_count: Firestore.FieldValue.increment(1) },
      { merge: true }
    ).catch((e) => console.warn('[tailorResume] jd_count increment failed:', e));

    logRequest({ userId, route: '/resume/tailor', method: 'POST', statusCode: 202, durationMs: Date.now() - start, ip: req.ip });
    return res.status(202).json({ draft_id: draftId, company: 'Company', role: 'Role' });

  } catch (err) {
    console.error(`[tailorResume] FAILED — ${err.message}`, err);
    logRequest({ userId, route: '/resume/tailor', method: 'POST', statusCode: 500, durationMs: Date.now() - start, ip: req.ip });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { tailorResume };
