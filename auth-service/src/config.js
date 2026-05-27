'use strict';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'production',
  googleClientId: required('GOOGLE_CLIENT_ID'),
  gcpProjectId: required('GCP_PROJECT_ID'),
  firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || '(default)',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean),
};

module.exports = config;
