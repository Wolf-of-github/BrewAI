'use strict';

const express = require('express');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Startup validation ────────────────────────────────────────────────────────
const REQUIRED_ENV = [
  'GCP_PROJECT_ID',
  'GCS_BUCKET_NAME',
  'ARTIFACTS_BUCKET_NAME',
  'GENAI_SERVICE_URL',
  'GITHUB_READER_URL',
  'GITHUB_READER_TASKS_QUEUE',
  'RESUME_PARSER_URL',
  'RESUME_PARSER_TASKS_QUEUE',
  'CLOUD_TASKS_QUEUE',
  'CLOUD_TASKS_LOCATION',
];

for (const name of REQUIRED_ENV) {
  if (!process.env[name]) {
    console.error(`[api-gateway] Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0) {
      if (process.env.NODE_ENV === 'production') {
        return cb(new Error(`CORS: no ALLOWED_ORIGINS configured — rejecting ${origin}`));
      }
      return cb(null, true);
    }
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

app.options('*', cors(corsOptions));

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
}));

app.use('/resume/tailor', rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
// Raw body for Stripe webhook signature verification — must come before express.json()
app.use('/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use(routes);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[api-gateway] listening on port ${PORT} (${process.env.NODE_ENV || 'production'})`);
});
