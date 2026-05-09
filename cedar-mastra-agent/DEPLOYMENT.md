# Deployment Runbook

This repo currently deploys both services to Google Cloud Run from GitHub push-triggered Cloud Build jobs.

The older Firebase App Hosting configuration (`apphosting.prod.yaml`) may still be useful context, and the frontend Cloud Run service carries Firebase App Hosting labels, but the live failing auto-deploy path observed on May 9, 2026 was Cloud Build building Docker images and deploying Cloud Run services.

## Live Services

Shared project and region:

- Project: `concise-foundry-465822-d7`
- Region: `us-east4`
- Branch trigger: `master`

Frontend:

- Cloud Run service: `rutgers-soc-agent`
- Public URL: `https://rutgers-soc-agent-496012954691.us-east4.run.app`
- Source root: `cedar-mastra-agent`
- Dockerfile: `cedar-mastra-agent/Dockerfile`
- Repo build config: `cedar-mastra-agent/cloudbuild.frontend.yaml`
- Public access: deployed with `--no-invoker-iam-check`

Backend:

- Cloud Run service: `rutgers-agent-mastra-backend`
- Public URL: `https://rutgers-agent-mastra-backend-496012954691.us-east4.run.app`
- Source root: `cedar-mastra-agent/src/backend`
- Dockerfile: `cedar-mastra-agent/src/backend/Dockerfile`
- Repo build config: `cedar-mastra-agent/cloudbuild.backend.yaml`
- Runtime service account: `rutgers-agent-mastra-backend@concise-foundry-465822-d7.iam.gserviceaccount.com`
- Public access: deployed with `--no-invoker-iam-check`

## Required Environment

Frontend values are public client configuration, but they are still required at both build time and runtime:

- `NEXT_PUBLIC_MASTRA_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Next.js prerenders pages during `next build`. If the Docker build does not receive these values as `--build-arg`, the build can fail before a Cloud Run revision is created.

Backend runtime values:

- `GOOGLE_VERTEX_PROJECT`
- `GOOGLE_VERTEX_LOCATION`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BROWSERBASE_API_KEY`
- `BROWSERBASE_PROJECT_ID`
- `BROWSERBASE_API_BASE` optional, defaults to `https://api.browserbase.com/v1`
- `STAGEHAND_MODEL_PROVIDER=vertex`
- `STAGEHAND_MODEL_NAME=vertex/gemini-3.1-pro-preview`

Sensitive backend values must be Secret Manager bindings, not plaintext Cloud Run environment variables:

- `SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest`
- `BROWSERBASE_API_KEY=browserbase-api-key:latest`

## Cloud Build Triggers

Use committed build config files instead of console-only inline trigger definitions:

```bash
cd cedar-mastra-agent
npm run deploy:update-triggers
```

Equivalent direct commands:

```bash
gcloud builds triggers import \
  --project concise-foundry-465822-d7 \
  --region global \
  --source cedar-mastra-agent/cloudbuild.trigger.frontend.yaml

gcloud builds triggers import \
  --project concise-foundry-465822-d7 \
  --region global \
  --source cedar-mastra-agent/cloudbuild.trigger.backend.yaml
```

Known trigger IDs from the May 9, 2026 incident:

- Frontend: `8706fe1d-ae5a-4f4b-9abc-e1bec57ee266`
- Backend: `d3de1a24-a7af-4485-8613-bf1caa612800`

If the trigger update command rejects `--build-config`, update the trigger in the Cloud Build console and select the matching repository YAML file.

## Secret Setup

Create or update secrets before deploying the backend config:

```bash
cd cedar-mastra-agent
SUPABASE_SERVICE_ROLE_KEY='<new-service-role-key>' \
BROWSERBASE_API_KEY='<new-browserbase-api-key>' \
npm run deploy:rotate-secrets
```

Equivalent direct commands:

```bash
printf '%s' "$SUPABASE_SERVICE_ROLE_KEY" | \
  gcloud secrets create supabase-service-role-key \
    --project concise-foundry-465822-d7 \
    --data-file=- \
  || printf '%s' "$SUPABASE_SERVICE_ROLE_KEY" | \
    gcloud secrets versions add supabase-service-role-key \
      --project concise-foundry-465822-d7 \
      --data-file=-

printf '%s' "$BROWSERBASE_API_KEY" | \
  gcloud secrets create browserbase-api-key \
    --project concise-foundry-465822-d7 \
    --data-file=- \
  || printf '%s' "$BROWSERBASE_API_KEY" | \
    gcloud secrets versions add browserbase-api-key \
      --project concise-foundry-465822-d7 \
      --data-file=-
```

Grant the Cloud Run runtime service account secret access if needed:

```bash
gcloud secrets add-iam-policy-binding supabase-service-role-key \
  --project concise-foundry-465822-d7 \
  --member serviceAccount:rutgers-agent-mastra-backend@concise-foundry-465822-d7.iam.gserviceaccount.com \
  --role roles/secretmanager.secretAccessor

gcloud secrets add-iam-policy-binding browserbase-api-key \
  --project concise-foundry-465822-d7 \
  --member serviceAccount:rutgers-agent-mastra-backend@concise-foundry-465822-d7.iam.gserviceaccount.com \
  --role roles/secretmanager.secretAccessor
```

Rotate the Supabase service role key and Browserbase API key any time they are pasted into logs, terminal output, or chat.

## Local Pre-Push Checks

From `cedar-mastra-agent`:

```bash
npm run check:deploy:frontend
npm run check:deploy:backend
```

The frontend check loads `.env`, verifies the three `NEXT_PUBLIC_*` values, and runs `next build`.

The backend check runs `pnpm install --frozen-lockfile` and `pnpm run build` in `src/backend`. Keep the frozen install; it catches stale lockfiles before Cloud Build does.

If `src/backend/package.json` changes, regenerate and commit `src/backend/pnpm-lock.yaml`:

```bash
cd cedar-mastra-agent/src/backend
pnpm install
```

The backend Dockerfile pins pnpm to `10.32.1`. Do not switch it back to `pnpm@latest`; pnpm 11 changed build-script approval behavior and caused Cloud Build installs to fail on dependency postinstall scripts.

## Manual Builds

Frontend:

```bash
gcloud builds submit . \
  --project concise-foundry-465822-d7 \
  --config cedar-mastra-agent/cloudbuild.frontend.yaml
```

Backend:

```bash
gcloud builds submit . \
  --project concise-foundry-465822-d7 \
  --config cedar-mastra-agent/cloudbuild.backend.yaml
```

After rollout:

```bash
cd cedar-mastra-agent
npm run deploy:verify
```

## Diagnose Failed Auto-Deploys

List recent builds:

```bash
gcloud builds list \
  --project concise-foundry-465822-d7 \
  --limit=30
```

Read a failed build log:

```bash
gcloud builds log BUILD_ID \
  --project concise-foundry-465822-d7
```

Inspect Cloud Build triggers:

```bash
gcloud builds triggers list \
  --project concise-foundry-465822-d7
```

Inspect Cloud Run service config:

```bash
gcloud run services describe rutgers-soc-agent \
  --region us-east4 \
  --project concise-foundry-465822-d7 \
  --format=yaml

gcloud run services describe rutgers-agent-mastra-backend \
  --region us-east4 \
  --project concise-foundry-465822-d7 \
  --format=yaml
```

If the frontend URL returns `403 Forbidden`, public Cloud Run invocation is blocked. Restore the same public access mode used by the frontend build config:

```bash
gcloud run services update rutgers-soc-agent \
  --region us-east4 \
  --project concise-foundry-465822-d7 \
  --no-invoker-iam-check
```

Read service logs:

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="rutgers-soc-agent"' \
  --project concise-foundry-465822-d7 \
  --freshness=7d \
  --limit=120

gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="rutgers-agent-mastra-backend"' \
  --project concise-foundry-465822-d7 \
  --freshness=7d \
  --limit=120
```

## May 9, 2026 Incident Summary

Frontend auto-deploy failed because Cloud Build did not pass the `NEXT_PUBLIC_*` Docker build args. `next build` failed while prerendering `/_not-found` with:

```text
Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Backend auto-deploy failed because `src/backend/package.json` added `ai@5.0.44` without a matching `src/backend/pnpm-lock.yaml` update. The Docker build failed at:

```text
pnpm install --frozen-lockfile
[ERR_PNPM_OUTDATED_LOCKFILE]
```

Both live Cloud Run services remained ready on older revisions, but push-triggered redeploys failed before new revisions were created.

The frontend Cloud Run URL also returned `403 Forbidden` during smoke testing, which indicates public invocation was not enabled on that service URL. The repo frontend build config now includes `--no-invoker-iam-check` so future deploys preserve public access.
