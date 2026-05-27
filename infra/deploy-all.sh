#!/usr/bin/env bash
# Build, push, and deploy all services to Cloud Run in parallel (each in a new terminal).
# Run from the infra/ directory: ./deploy-all.sh
# To deploy a single service: ./deploy-all.sh auth-service
set -euo pipefail

PROJECT_ID="brewai-497502"
REGION="us-central1"
TAG=$(date +%Y%m%d-%H%M%S)

SERVICES=("auth-service" "api-gateway-service" "resume-parser-service" "github-reader-service" "generative-ai-service")

# If argument provided, deploy only that service
if [[ $# -gt 0 ]]; then
  SERVICES=("$1")
fi

echo "==> Authenticating Docker to Artifact Registry"
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

deploy_service() {
  local SERVICE="$1"
  local REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE}"
  local IMAGE="${REPO}/${SERVICE}:${TAG}"
  local LATEST="${REPO}/${SERVICE}:latest"

  echo "==> [${SERVICE}] Building image"
  docker build --no-cache --platform linux/amd64 -t "${IMAGE}" -t "${LATEST}" "${SCRIPT_DIR}/../${SERVICE}"

  echo "==> [${SERVICE}] Pushing image"
  docker push "${IMAGE}"
  docker push "${LATEST}"

  echo "==> [${SERVICE}] Updating Cloud Run service"
  gcloud run services update "${SERVICE}" \
    --image="${IMAGE}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --quiet

  gcloud run services update-traffic "${SERVICE}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --to-latest

  echo "==> [${SERVICE}] Done"
}

export -f deploy_service
export PROJECT_ID REGION TAG

if [[ ${#SERVICES[@]} -eq 1 ]]; then
  deploy_service "${SERVICES[0]}"
else
  for SERVICE in "${SERVICES[@]}"; do
    osascript -e "tell application \"Terminal\" to do script \"cd '${SCRIPT_DIR}' && source <(declare -f deploy_service) && PROJECT_ID=${PROJECT_ID} REGION=${REGION} TAG=${TAG} deploy_service ${SERVICE}; echo '==> ${SERVICE} complete'; exec bash\""
  done
  echo ""
  echo "==> Launched ${#SERVICES[@]} terminal windows — one per service (tag=${TAG})"
fi
