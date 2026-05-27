const { Firestore } = require("@google-cloud/firestore");
const Stripe = require("stripe");

const firestore = new Firestore();

const STRIPE_SECRET_KEY     = process.env.STRIPE_SECRET_KEY     || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const STRIPE_PRICE_ID       = process.env.STRIPE_PRICE_ID       || "";
const FRONTEND_URL          = process.env.FRONTEND_URL          || "https://brewai.us";

const stripe = Stripe(STRIPE_SECRET_KEY);

// ── helpers ───────────────────────────────────────────────────────────────────

function nextMonthDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// GET /billing/status
const getBillingStatus = async (req, res) => {
  const userId  = req.user.user_id;
  const userDoc = await firestore.collection("users").doc(userId).get();

  if (!userDoc.exists) {
    return res.json({
      plan:               "free",
      daily_tailor_count: 0,
      daily_tailor_limit: 3,
      jd_count:           0,
      download_count:     0,
      next_billing_date:  null,
    });
  }

  const data  = userDoc.data();
  const today = new Date().toISOString().slice(0, 10);
  const count = data.daily_tailor_date === today ? (data.daily_tailor_count ?? 0) : 0;

  // Auto-expire beta plan if promo has passed its expiry
  let plan = data.plan ?? "free";
  if (plan === "beta" && data.promo_expiry) {
    const expiry = data.promo_expiry.toDate ? data.promo_expiry.toDate() : new Date(data.promo_expiry);
    if (expiry < new Date()) {
      plan = "free";
      await firestore.collection("users").doc(userId).set(
        { plan: "free", promo_expiry: null, promo_daily_limit: null, promo_tweaks_per_jd: null, promo_code: null },
        { merge: true }
      );
    }
  }

  const dailyLimit  = plan === "pro" ? Infinity
    : plan === "beta" ? (data.promo_daily_limit ?? 10)
    : 3;
  const tweaksPerJd = plan === "beta" ? (data.promo_tweaks_per_jd ?? 5) : 5;

  return res.json({
    plan,
    daily_tailor_count: count,
    daily_tailor_limit: dailyLimit === Infinity ? null : dailyLimit,
    tweaks_per_jd:      tweaksPerJd,
    promo_code:         plan === "beta" ? (data.promo_code ?? null) : null,
    promo_expiry:       plan === "beta" && data.promo_expiry
      ? (data.promo_expiry.toDate ? data.promo_expiry.toDate() : new Date(data.promo_expiry)).toISOString()
      : null,
    jd_count:           data.jd_count          ?? 0,
    download_count:     data.download_count    ?? 0,
    next_billing_date:  data.next_billing_date ?? null,
  });
};

// POST /billing/record-download  — increment download_count
const recordDownload = async (req, res) => {
  const userId = req.user.user_id;
  await firestore.collection("users").doc(userId).set(
    { download_count: Firestore.FieldValue.increment(1) },
    { merge: true }
  );
  return res.json({ ack: true });
};

// POST /billing/record-jd  — increment jd_count (called after tailor job is queued)
const recordJD = async (req, res) => {
  const userId = req.user.user_id;
  await firestore.collection("users").doc(userId).set(
    { jd_count: Firestore.FieldValue.increment(1) },
    { merge: true }
  );
  return res.json({ ack: true });
};

// POST /billing/simulate-upgrade  — for testing without Stripe (non-production only)
const simulateUpgrade = async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  const userId = req.user.user_id;
  await firestore.collection("users").doc(userId).set(
    { plan: "pro", next_billing_date: nextMonthDate() },
    { merge: true }
  );
  console.log(`[billing/simulate-upgrade] userId=${userId} → pro`);
  return res.json({ ack: true, plan: "pro", next_billing_date: nextMonthDate() });
};

// POST /billing/simulate-downgrade  — for testing without Stripe (non-production only)
const simulateDowngrade = async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  const userId = req.user.user_id;
  await firestore.collection("users").doc(userId).set(
    { plan: "free", next_billing_date: null },
    { merge: true }
  );
  console.log(`[billing/simulate-downgrade] userId=${userId} → free`);
  return res.json({ ack: true, plan: "free" });
};

// POST /billing/checkout  →  returns { url }
const createCheckoutSession = async (req, res) => {
  const userId = req.user.user_id;
  const email  = req.user.email ?? "";

  const userDoc = await firestore.collection("users").doc(userId).get();
  let customerId = userDoc.exists ? userDoc.data().stripe_customer_id : null;

  if (!customerId) {
    const customer = await stripe.customers.create({ email, metadata: { user_id: userId } });
    customerId = customer.id;
    await firestore.collection("users").doc(userId).set({ stripe_customer_id: customerId }, { merge: true });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
    mode: "subscription",
    success_url: `${FRONTEND_URL}/dashboard?billing=success`,
    cancel_url:  `${FRONTEND_URL}/dashboard?billing=cancelled`,
  });

  return res.json({ url: session.url });
};

// POST /billing/portal  →  returns { url }
const createPortalSession = async (req, res) => {
  const userId  = req.user.user_id;
  const userDoc = await firestore.collection("users").doc(userId).get();

  if (!userDoc.exists || !userDoc.data().stripe_customer_id) {
    return res.status(400).json({ error: "No billing account found." });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer:   userDoc.data().stripe_customer_id,
    return_url: `${FRONTEND_URL}/dashboard`,
  });

  return res.json({ url: session.url });
};

// POST /billing/webhook
const handleWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[billing/webhook] signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session    = event.data.object;
    const customerId = session.customer;
    const subId      = session.subscription;

    const snap = await firestore
      .collection("users")
      .where("stripe_customer_id", "==", customerId)
      .limit(1)
      .get();

    if (!snap.empty) {
      await snap.docs[0].ref.set(
        { plan: "pro", stripe_subscription_id: subId, next_billing_date: nextMonthDate() },
        { merge: true }
      );
      console.log(`[billing/webhook] activated pro plan for customerId=${customerId}`);
    }
  }

  if (
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.paused"
  ) {
    const sub        = event.data.object;
    const customerId = sub.customer;

    const snap = await firestore
      .collection("users")
      .where("stripe_customer_id", "==", customerId)
      .limit(1)
      .get();

    if (!snap.empty) {
      await snap.docs[0].ref.set(
        { plan: "free", next_billing_date: null },
        { merge: true }
      );
      console.log(`[billing/webhook] reverted to free plan for customerId=${customerId}`);
    }
  }

  return res.json({ received: true });
};

// POST /billing/redeem-promo
const redeemPromo = async (req, res) => {
  const userId = req.user.user_id;
  const { code } = req.body;

  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Promo code is required." });
  }

  const normalizedCode = code.trim().toUpperCase();

  // ── Look up promo in the `promos` collection ───────────────────────────────
  const snap = await firestore
    .collection("promos")
    .where("code", "==", normalizedCode)
    .limit(1)
    .get();

  if (snap.empty) {
    return res.status(404).json({ error: "Invalid promo code." });
  }

  const promoRef  = snap.docs[0].ref;
  const promoData = snap.docs[0].data();

  // ── Validate promo ─────────────────────────────────────────────────────────
  if (!promoData.isActive) {
    return res.status(400).json({ error: "This promo code is no longer active." });
  }

  const now = new Date();

  const validFrom = promoData.validFrom
    ? (promoData.validFrom.toDate ? promoData.validFrom.toDate() : new Date(promoData.validFrom))
    : null;
  if (validFrom && now < validFrom) {
    return res.status(400).json({ error: "This promo code is not yet valid." });
  }

  const validUntil = promoData.validUntil
    ? (promoData.validUntil.toDate ? promoData.validUntil.toDate() : new Date(promoData.validUntil))
    : null;
  if (validUntil && now > validUntil) {
    return res.status(400).json({ error: "This promo code has expired." });
  }

  if (promoData.usageLimit != null && (promoData.usedCount ?? 0) >= promoData.usageLimit) {
    return res.status(400).json({ error: "This promo code has reached its usage limit." });
  }

  // ── Check per-user redemption limit ───────────────────────────────────────
  const userDoc = await firestore.collection("users").doc(userId).get();
  const userData = userDoc.exists ? userDoc.data() : {};

  // Block if user already has an active (non-expired) promo
  if (userData.plan === "beta" && userData.promo_expiry) {
    const existingExpiry = userData.promo_expiry.toDate
      ? userData.promo_expiry.toDate()
      : new Date(userData.promo_expiry);
    if (existingExpiry > now) {
      return res.status(400).json({ error: "You already have an active promo. Only one promo can be active at a time." });
    }
  }

  const redeemedCodes = userData.redeemed_promos ?? [];
  if (redeemedCodes.includes(normalizedCode)) {
    return res.status(400).json({ error: "You have already redeemed this promo code." });
  }

  // ── Determine limits granted by this promo ────────────────────────────────
  const dailyJdLimit   = promoData.jdsPerDay    ?? 10;
  const tweaksPerJd    = promoData.tweaksPerJD  ?? 5;

  // ── Atomically update user + increment promo usedCount ────────────────────
  await firestore.runTransaction(async (tx) => {
    tx.set(
      firestore.collection("users").doc(userId),
      {
        plan:              "beta",
        promo_code:        normalizedCode,
        promo_expiry:      promoData.validUntil ?? null,
        promo_daily_limit: dailyJdLimit,
        promo_tweaks_per_jd: tweaksPerJd,
        redeemed_promos:   Firestore.FieldValue.arrayUnion(normalizedCode),
        next_billing_date: null,
      },
      { merge: true }
    );
    tx.update(promoRef, {
      usedCount: Firestore.FieldValue.increment(1),
      updatedAt: Firestore.Timestamp.now(),
    });
  });

  console.log(`[billing/redeem-promo] userId=${userId} redeemed code=${normalizedCode} → beta, jds=${dailyJdLimit}/day tweaks=${tweaksPerJd}/jd`);

  return res.json({
    ack:                true,
    plan:               "beta",
    daily_tailor_limit: dailyJdLimit,
    tweaks_per_jd:      tweaksPerJd,
    promo_code:         normalizedCode,
    promo_expiry:       validUntil ? validUntil.toISOString() : null,
  });
};

module.exports = {
  getBillingStatus,
  recordDownload,
  recordJD,
  simulateUpgrade,
  simulateDowngrade,
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
  redeemPromo,
};
