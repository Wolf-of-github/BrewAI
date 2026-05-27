'use strict';

// Lazy-loads secrets from Google Cloud Secret Manager and caches them in
// memory for the lifetime of the process. On Cloud Run this means one fetch
// per cold start, which is acceptable.

const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const config = require('../config');

const client = new SecretManagerServiceClient();

// In-memory cache: secretName -> plaintext string
const _cache = new Map();

/**
 * Fetch the latest version of a secret from Secret Manager.
 * Returns the plaintext string. Throws on any error.
 * @param {string} name - Secret name (not the full resource path)
 */
async function getSecret(name) {
  if (_cache.has(name)) return _cache.get(name);

  const secretPath = `projects/${config.gcpProjectId}/secrets/${name}/versions/latest`;

  const [version] = await client.accessSecretVersion({ name: secretPath });
  const payload = version.payload.data.toString('utf8');

  _cache.set(name, payload);
  return payload;
}

/**
 * Returns the JWT signing secret, fetched once and cached.
 */
async function getJwtSecret() {
  return getSecret('jwt_secret');
}

module.exports = { getJwtSecret };
