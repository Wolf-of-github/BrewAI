'use strict';

const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../lib/secrets');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.slice(7);

  let secret;
  try {
    secret = await getJwtSecret();
  } catch (err) {
    console.error('[auth] Failed to fetch JWT secret:', err.message);
    return res.status(503).json({ error: 'Service temporarily unavailable' });
  }

  try {
    req.user = jwt.verify(token, secret);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = { authenticate };
