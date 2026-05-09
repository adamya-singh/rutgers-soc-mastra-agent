#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-concise-foundry-465822-d7}"
REGION="${REGION:-us-east4}"
FRONTEND_SERVICE="${FRONTEND_SERVICE:-rutgers-soc-agent}"
BACKEND_SERVICE="${BACKEND_SERVICE:-rutgers-agent-mastra-backend}"
FRONTEND_URL="${FRONTEND_URL:-https://rutgers-soc-agent-496012954691.us-east4.run.app}"
BACKEND_URL="${BACKEND_URL:-https://rutgers-agent-mastra-backend-496012954691.us-east4.run.app}"

gcloud run services describe "${FRONTEND_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.latestReadyRevisionName)'

gcloud run services describe "${BACKEND_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.latestReadyRevisionName)'

curl -fsSI "${FRONTEND_URL}" >/dev/null
curl -fsS "${BACKEND_URL}/chat" >/dev/null

echo "Deployment smoke checks passed."
