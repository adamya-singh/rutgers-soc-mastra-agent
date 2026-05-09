#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-concise-foundry-465822-d7}"
TRIGGER_REGION="${TRIGGER_REGION:-global}"

cd "$(dirname "$0")/../.."

gcloud builds triggers import \
  --project "${PROJECT_ID}" \
  --region "${TRIGGER_REGION}" \
  --source cedar-mastra-agent/cloudbuild.trigger.frontend.yaml

gcloud builds triggers import \
  --project "${PROJECT_ID}" \
  --region "${TRIGGER_REGION}" \
  --source cedar-mastra-agent/cloudbuild.trigger.backend.yaml
