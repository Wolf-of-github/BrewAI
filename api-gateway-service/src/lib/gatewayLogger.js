'use strict';

// Fire-and-forget request logger for key gateway routes.
// Writes to the `gatewayRequests` Firestore collection.
// Never throws — logging must never block or break request handling.

const { Firestore } = require('@google-cloud/firestore');

const firestore = new Firestore();

/**
 * Log a gateway request event to Firestore.
 * Non-blocking — call without await.
 *
 * @param {{
 *   userId: string,
 *   route: string,
 *   method: string,
 *   statusCode: number,
 *   durationMs: number,
 *   ip: string,
 * }} params
 */
function logRequest({ userId, route, method, statusCode, durationMs, ip }) {
  firestore.collection('gatewayRequests').add({
    userId,
    route,
    method,
    statusCode,
    durationMs,
    ip,
    timestamp: Firestore.Timestamp.now(),
  }).catch((err) => {
    console.warn(`[gatewayLogger] Failed to write log — ${err.message}`);
  });
}

module.exports = { logRequest };
