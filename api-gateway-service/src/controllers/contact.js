const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = 'onboarding@resend.dev';  // Resend's verified sender — no domain setup needed
const TO   = 'ishaanmapte@gmail.com'; // direct delivery to inbox

// Simple in-memory rate limit: max 5 requests per IP per hour
const _rateLimitMap = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = _rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    _rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count++;
  return false;
}

async function sendContactEmail(req, res) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket.remoteAddress;
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many messages. Please wait before sending again.' });
  }

  const { email, subject, body } = req.body ?? {};

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!body || typeof body !== 'string' || !body.trim()) {
    return res.status(400).json({ error: 'Message body is required.' });
  }
  if (body.length > 5000) {
    return res.status(400).json({ error: 'Message is too long (max 5000 characters).' });
  }

  const resolvedSubject = subject?.trim() || 'Message from Brew AI contact form';

  console.log(`[contact] sending from=${FROM} to=${TO} reply_to=${email} subject="${resolvedSubject}"`)
  try {
    const result = await resend.emails.send({
      from: FROM,
      to:   TO,
      reply_to: email,
      subject: resolvedSubject,
      text: `From: ${email}\n\n${body.trim()}`,
    });
    console.log('[contact] sent ok, id:', result?.data?.id ?? result)
    return res.json({ ok: true });
  } catch (err) {
    console.error('[contact] Resend error:', err);
    return res.status(502).json({ error: 'Failed to send message. Please try again later.' });
  }
}

module.exports = { sendContactEmail };
