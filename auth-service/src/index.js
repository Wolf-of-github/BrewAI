'use strict';

// Config must be loaded first — it throws immediately if required env vars
// are absent, giving a clear startup error rather than a cryptic runtime crash.
const config = require('./config');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { rateLimit } = require('express-rate-limit');

const authRouter = require('./routes/auth');

const app = express();

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
app.use(helmet());

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const corsOptions = {
  origin(origin, callback) {
    // Allow requests with no origin (e.g. server-to-server, curl, Postman)
    if (!origin) return callback(null, true);

    if (config.allowedOrigins.length === 0) {
      // No allowlist configured — reject cross-origin requests in production,
      // allow everything in development so local testing is frictionless.
      if (config.nodeEnv === 'production') {
        return callback(new Error(`CORS: no ALLOWED_ORIGINS configured — rejecting ${origin}`));
      }
      return callback(null, true);
    }

    if (config.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS: origin ${origin} is not allowed`));
  },
  credentials: true, // required so the browser sends the httpOnly cookie
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // pre-flight for all routes

// ---------------------------------------------------------------------------
// Body parsing & cookies
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Rate limiting — applied to all auth endpoints
// ---------------------------------------------------------------------------
app.use('/auth', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
}));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/auth', authRouter);

// Health-check — required by Cloud Run and load balancers
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// 404 catch-all
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Centralised error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const message =
    config.nodeEnv === 'production' && status === 500
      ? 'Internal server error'
      : err.message || 'Internal server error';

  if (status === 500) {
    console.error('[error]', err);
  }

  res.status(status).json({ error: message });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(config.port, () => {
  console.log(`[auth-service] listening on port ${config.port} (${config.nodeEnv})`);
});

module.exports = app; // exported for testing
