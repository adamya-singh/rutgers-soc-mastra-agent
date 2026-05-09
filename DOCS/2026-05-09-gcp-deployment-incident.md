# 2026-05-09 GCP Deployment Incident

## Summary

Both push-triggered auto-deploys were failing for the Cloud Run services in project `concise-foundry-465822-d7`.

- Frontend service: `rutgers-soc-agent`
- Backend service: `rutgers-agent-mastra-backend`
- Region: `us-east4`
- Branch trigger: `master`

Existing Cloud Run revisions stayed ready, so the live services were not fully down, but new commits were not rolling out until the build and deploy issues were fixed.

## What Failed

Frontend Cloud Build failed during Docker `next build` because the Cloud Build path did not pass required public Next.js values as Docker build args:

```text
Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Backend Cloud Build initially failed during the Docker install step because `src/backend/package.json` and `src/backend/pnpm-lock.yaml` were out of sync:

```text
pnpm install --frozen-lockfile
[ERR_PNPM_OUTDATED_LOCKFILE]
```

After the lockfile was fixed, backend verification exposed pnpm build-script approval failures in fresh Cloud Build containers:

```text
[ERR_PNPM_IGNORED_BUILDS]
```

The backend also failed during Cloud Run deploy after the image was built and pushed because the service referenced Secret Manager secrets that did not yet exist in the project and the runtime service account needed secret accessor permissions.

The frontend Cloud Run URL also returned `403 Forbidden` during smoke testing until public Cloud Run invocation was preserved in the repo-managed build config.

## Fixes Applied

The deployment path was moved into committed Cloud Build YAML files:

- `cedar-mastra-agent/cloudbuild.frontend.yaml`
- `cedar-mastra-agent/cloudbuild.backend.yaml`
- `cedar-mastra-agent/cloudbuild.trigger.frontend.yaml`
- `cedar-mastra-agent/cloudbuild.trigger.backend.yaml`

The frontend build config now passes `NEXT_PUBLIC_*` values as Docker `--build-arg` entries and deploys with `--no-invoker-iam-check`.

The backend lockfile was regenerated for the current `src/backend/package.json`, and the backend Dockerfile now pins pnpm to `10.32.1` so Cloud Build uses the same pnpm behavior verified locally.

Sensitive backend values were moved to Secret Manager references:

- `SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest`
- `BROWSERBASE_API_KEY=browserbase-api-key:latest`

The missing secrets were created from the previous ready Cloud Run revision without printing the values, and the backend runtime service account was granted `roles/secretmanager.secretAccessor` on both secrets. Those values should still be rotated after the incident because they previously existed as plaintext Cloud Run environment variables.

## Verification

Final successful frontend builds included:

- `2dd03d3a-4e60-4699-a216-770185036bb2`
- `c7b6f4b9-ac57-40bf-a52c-f49600b346ff`

Final successful backend build:

- `061422a8-7e6a-4f07-8553-83c69eac92ec`

Backend Cloud Run deployed revision:

- `rutgers-agent-mastra-backend-00009-kpd`

The final smoke check passed:

```bash
cd cedar-mastra-agent
npm run deploy:verify
```

Output:

```text
Deployment smoke checks passed.
```

## Follow-Up Notes

Keep incident-specific build IDs, exact failure order, and dated recovery details in this file or other files under `DOCS`. Keep `cedar-mastra-agent/DEPLOYMENT.md` focused on the reusable workflow for future deployments.
