'use strict';

const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const client = new SecretManagerServiceClient();
const _cache = new Map();

async function getSecret(name) {
  if (_cache.has(name)) return _cache.get(name);
  const secretPath = `projects/${process.env.GCP_PROJECT_ID}/secrets/${name}/versions/latest`;
  const [version] = await client.accessSecretVersion({ name: secretPath });
  const payload = version.payload.data.toString('utf8');
  _cache.set(name, payload);
  return payload;
}

async function getJwtSecret() {
  return getSecret('jwt_secret');
}

module.exports = { getJwtSecret };
