#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-concise-foundry-465822-d7}"
BACKEND_SERVICE_ACCOUNT="${BACKEND_SERVICE_ACCOUNT:-rutgers-agent-mastra-backend@concise-foundry-465822-d7.iam.gserviceaccount.com}"

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "Set SUPABASE_SERVICE_ROLE_KEY to the newly rotated Supabase service_role key." >&2
  exit 1
fi

if [[ -z "${BROWSERBASE_API_KEY:-}" ]]; then
  echo "Set BROWSERBASE_API_KEY to the newly rotated Browserbase API key." >&2
  exit 1
fi

upsert_secret() {
  local name="$1"
  local value="$2"

  if gcloud secrets describe "${name}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    printf '%s' "${value}" | gcloud secrets versions add "${name}" \
      --project "${PROJECT_ID}" \
      --data-file=-
  else
    printf '%s' "${value}" | gcloud secrets create "${name}" \
      --project "${PROJECT_ID}" \
      --data-file=-
  fi

  gcloud secrets add-iam-policy-binding "${name}" \
    --project "${PROJECT_ID}" \
    --member "serviceAccount:${BACKEND_SERVICE_ACCOUNT}" \
    --role roles/secretmanager.secretAccessor
}

upsert_secret supabase-service-role-key "${SUPABASE_SERVICE_ROLE_KEY}"
upsert_secret browserbase-api-key "${BROWSERBASE_API_KEY}"
