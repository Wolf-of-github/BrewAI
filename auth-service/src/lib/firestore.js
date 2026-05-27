'use strict';

// Singleton Firebase Admin + Firestore client.
// Importing this module multiple times is safe — initializeApp is called once.

const admin = require('firebase-admin');
const config = require('../config');

// Guard against double-initialisation (e.g. in tests that re-require modules)
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: config.gcpProjectId,
    serviceAccountId: `firebase-adminsdk-fbsvc@${config.gcpProjectId}.iam.gserviceaccount.com`,
  });
}

const db = admin.firestore();

db.settings({
  projectId: config.gcpProjectId,
  databaseId: config.firestoreDatabaseId,
});

module.exports = { admin, db };
