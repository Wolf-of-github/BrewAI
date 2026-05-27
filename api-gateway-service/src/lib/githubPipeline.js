'use strict';

// Enqueues a github-reader job via Cloud Tasks (OIDC-authenticated).
// Called from both githubUpload and githubOAuth controllers.

const { CloudTasksClient } = require('@google-cloud/tasks');

const GITHUB_READER_URL          = process.env.GITHUB_READER_URL;
const GITHUB_READER_TASKS_QUEUE  = process.env.GITHUB_READER_TASKS_QUEUE;
const GCP_PROJECT_ID             = process.env.GCP_PROJECT_ID;
const CLOUD_TASKS_LOCATION       = process.env.CLOUD_TASKS_LOCATION;

const tasksClient = new CloudTasksClient();

/**
 * Enqueues a github-reader job via Cloud Tasks.
 * Never throws — all errors are logged internally.
 *
 * @param {{ githubId: string, userId: string, email: string }} params
 */
async function runGithubPipeline({ githubId, userId, email }) {
  try {
    const queuePath = tasksClient.queuePath(GCP_PROJECT_ID, CLOUD_TASKS_LOCATION, GITHUB_READER_TASKS_QUEUE);
    await tasksClient.createTask({
      parent: queuePath,
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: `${GITHUB_READER_URL}/process`,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify({ github_user_id: githubId, user_id: userId, email })).toString('base64'),
          oidcToken: {
            serviceAccountEmail: `api-gateway-service-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com`,
            audience: GITHUB_READER_URL,
          },
        },
      },
    });
    console.log(`[githubPipeline] Task enqueued userId=${userId} githubId=${githubId}`);
  } catch (err) {
    console.error(`[githubPipeline] FAILED to enqueue task — ${err.message}`);
  }
}

module.exports = { runGithubPipeline };
