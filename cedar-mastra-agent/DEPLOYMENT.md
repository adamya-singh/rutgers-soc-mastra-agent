# Deployment Runbook

This repo currently deploys both services to Google Cloud Run from GitHub push-triggered Cloud Build jobs.

The older Firebase App Hosting configuration (`apphosting.prod.yaml`) may still be useful context, and the frontend Cloud Run service carries Firebase App Hosting labels, but the active auto-deploy path is Cloud Build building Docker images and deploying Cloud Run services.

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
- Traffic: deployed with `--to-latest`

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

Current trigger IDs:

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

## Secret Manager Checks

Before changing backend deploy config, confirm the expected sensitive values exist in Secret Manager and that the Cloud Run runtime service account can read them:

```bash
gcloud secrets list \
  --project concise-foundry-465822-d7

gcloud secrets get-iam-policy supabase-service-role-key \
  --project concise-foundry-465822-d7

gcloud secrets get-iam-policy browserbase-api-key \
  --project concise-foundry-465822-d7
```

The backend runtime service account must have `roles/secretmanager.secretAccessor` on each referenced secret, or the deploy can build and push the image but fail while creating the Cloud Run revision.

Prefer `npm run deploy:rotate-secrets` with freshly rotated values. If recovering a secret value from a legacy Cloud Run revision is unavoidable, do not print the value; pipe it directly into `gcloud secrets create` or `gcloud secrets versions add`, then rotate it afterward.

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

The backend Dockerfile pins pnpm to `10.32.1`. Keep the local deploy check and Docker install behavior aligned; rerun the backend deploy check before changing this pin.

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

Start with Cloud Build, then move to Cloud Run only after you know which build and deploy step ran.

Confirm triggers still point at the committed YAML files:

```bash
gcloud builds triggers list \
  --project concise-foundry-465822-d7 \
  --format='table(id,name,filename,github.push.branch)'
```

List recent builds and compare frontend/backend trigger status:

```bash
gcloud builds list \
  --project concise-foundry-465822-d7 \
  --limit=30 \
  --format='table(id,status,createTime,duration,substitutions.TRIGGER_NAME)'
```

Inspect the newest relevant build before reading the full log:

```bash
gcloud builds describe BUILD_ID \
  --project concise-foundry-465822-d7 \
  --format='yaml(status,logUrl,finishTime,steps)'
```

Read the failed build log:

```bash
gcloud builds log BUILD_ID \
  --project concise-foundry-465822-d7
```

Classify the failing phase before changing anything:

- Fetch/source failure: confirm GitHub trigger connection, branch, and source path.
- Docker install/build failure: reproduce with `npm run check:deploy:frontend` or `npm run check:deploy:backend`.
- Image push failure: check Artifact Registry repository name, region, and Cloud Build service account permissions.
- Cloud Run deploy failure: inspect `gcloud run deploy` flags, service account, env vars, secrets, and public access.
- Runtime readiness failure: inspect latest created vs. ready revisions and Cloud Run revision logs.
- Smoke test failure: verify the deployed service URLs and run `npm run deploy:verify`.

Check Cloud Run revision state:

```bash
gcloud run services describe rutgers-soc-agent \
  --region us-east4 \
  --project concise-foundry-465822-d7 \
  --format='yaml(status.latestCreatedRevisionName,status.latestReadyRevisionName,status.conditions,status.url)'

gcloud run services describe rutgers-agent-mastra-backend \
  --region us-east4 \
  --project concise-foundry-465822-d7 \
  --format='yaml(status.latestCreatedRevisionName,status.latestReadyRevisionName,status.conditions,status.url)'
```

Inspect full Cloud Run service config when env vars, secrets, service accounts, or public access look wrong:

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

After rollout, run:

```bash
cd cedar-mastra-agent
npm run deploy:verify
```

## Common Deployment Failure Patterns

Frontend missing build-time env vars:

- Symptom: `next build` fails before a Cloud Run revision is created.
- Check `NEXT_PUBLIC_*` substitutions and Docker `--build-arg` entries in `cedar-mastra-agent/cloudbuild.frontend.yaml`.
- Reproduce locally with `npm run check:deploy:frontend`.

Backend frozen lockfile failure:

- Symptom: `pnpm install --frozen-lockfile` fails during the backend Docker build.
- Check whether `cedar-mastra-agent/src/backend/package.json` changed without regenerating `cedar-mastra-agent/src/backend/pnpm-lock.yaml`.
- Reproduce locally with `npm run check:deploy:backend`.

Backend pnpm build-script approval failure:

- Symptom: pnpm reports ignored dependency build scripts during the backend Docker build or Mastra output install.
- Check `cedar-mastra-agent/src/backend/.npmrc` and the pinned pnpm version in `cedar-mastra-agent/src/backend/Dockerfile`.
- Do not switch the Dockerfile back to `pnpm@latest` without rerunning the full backend deploy check.

Cloud Run Secret Manager failure:

- Symptom: Docker build and image push succeed, but `gcloud run deploy` fails while creating the revision.
- Check that each secret referenced by `--set-secrets` exists and that the runtime service account has `roles/secretmanager.secretAccessor`.

Public URL returns `403 Forbidden`:

- Symptom: Cloud Run has a ready revision, but the service URL is not publicly reachable.
- Confirm the repo build config includes `--no-invoker-iam-check`.
- Restore the same public access mode used by the build config if needed:

```bash
gcloud run services update rutgers-soc-agent \
  --region us-east4 \
  --project concise-foundry-465822-d7 \
  --no-invoker-iam-check
```

Frontend build succeeds but traffic stays on an old revision:

- Symptom: `gcloud builds` shows success, but `status.latestReadyRevisionName` or `status.traffic` still points at an older frontend revision.
- Confirm the frontend build config includes `--to-latest`.
- Restore latest-revision traffic if needed:

```bash
gcloud run services update-traffic rutgers-soc-agent \
  --region us-east4 \
  --project concise-foundry-465822-d7 \
  --to-latest
```

Runtime errors after a successful deploy:

- Symptom: Cloud Build succeeds and a revision is ready, but requests fail.
- Read Cloud Run logs for the affected service:

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

## Incident Records

Dated incident notes live outside the general runbook under the repo-root `DOCS` folder. See `DOCS/2026-05-09-gcp-deployment-incident.md` for the May 9, 2026 deployment incident.
