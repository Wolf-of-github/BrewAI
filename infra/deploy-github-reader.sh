#!/usr/bin/env bash
# Build, push, and deploy the github-reader-service to Cloud Run.
# Run from the infra/ directory: ./deploy-github-reader.sh [image-tag]
set -euo pipefail

PROJECT_ID="brewai-497502"
REGION="us-central1"
SERVICE="github-reader-service"
REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE}"
TAG="${1:-$(date +%Y%m%d-%H%M%S)}"
IMAGE="${REPO}/${SERVICE}:${TAG}"

echo "==> Authenticating Docker to Artifact Registry"
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

echo "==> Building image: ${IMAGE}"
docker build --no-cache --platform linux/amd64 -t "${IMAGE}" "../${SERVICE}"

echo "==> Pushing image: ${IMAGE}"
docker push "${IMAGE}"

echo "==> Tagging and pushing :latest"
docker tag "${IMAGE}" "${REPO}/${SERVICE}:latest"
docker push "${REPO}/${SERVICE}:latest"

echo "==> Deploying Cloud Run service"
gcloud run services update "${SERVICE}" \
  --image="${IMAGE}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --update-env-vars="SERVICE_VERSION=${TAG},GCS_BUCKET_NAME=brewai-497502-artifacts" \
  --quiet

gcloud run services update-traffic "${SERVICE}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --to-latest

echo "==> Done. GitHub reader service deployed with tag=${TAG}"
