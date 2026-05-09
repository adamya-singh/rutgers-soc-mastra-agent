# 2026-05-09 GCP Deployment Incident

## Summary

Both push-triggered auto-deploys were failing for the Cloud Run services in project `concise-foundry-465822-d7`.

- Frontend service: `rutgers-soc-agent`
- Backend service: `rutgers-agent-mastra-backend`
- Region: `us-east4`
- Branch trigger: `master`

Existing Cloud Run revisions stayed ready, so the live services were not fully down, but new commits were not rolling out until the build and deploy issues were fixed. A third frontend deployment path, Firebase App Hosting/buildpacks, was also still active and could redeploy the same frontend Cloud Run service independently of the repo-managed Docker Cloud Build trigger.

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

After the Docker-based frontend and backend paths were fixed, Firebase App Hosting/buildpacks still failed on the frontend path because `cedar-mastra-agent/pnpm-lock.yaml` was stale. After that lockfile was updated, Firebase App Hosting then failed to set the Cloud Run public invocation policy because its service agent lacked sufficient Cloud Run IAM permissions.

Once Firebase App Hosting succeeded, it changed the frontend service public access behavior again, causing the frontend URL to return `403 Forbidden` until public invocation was restored on the Cloud Run service.

## Fixes Applied

The deployment path was moved into committed Cloud Build YAML files:

- `cedar-mastra-agent/cloudbuild.frontend.yaml`
- `cedar-mastra-agent/cloudbuild.backend.yaml`
- `cedar-mastra-agent/cloudbuild.trigger.frontend.yaml`
- `cedar-mastra-agent/cloudbuild.trigger.backend.yaml`

The frontend build config now passes `NEXT_PUBLIC_*` values as Docker `--build-arg` entries and deploys with `--no-invoker-iam-check`.

The frontend build config now also runs `gcloud run services update-traffic --to-latest` after deploy so successful frontend builds actually move traffic to the latest ready revision.

The backend lockfile was regenerated for the current `src/backend/package.json`, the backend Dockerfile copies `src/backend/.npmrc`, and the backend Dockerfile pins pnpm to `10.32.1` so Cloud Build uses the same pnpm behavior verified locally.

Sensitive backend values were moved to Secret Manager references:

- `SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest`
- `BROWSERBASE_API_KEY=browserbase-api-key:latest`

The missing secrets were created from the previous ready Cloud Run revision without printing the values, and the backend runtime service account was granted `roles/secretmanager.secretAccessor` on both secrets. Those values should still be rotated after the incident because they previously existed as plaintext Cloud Run environment variables.

The Firebase App Hosting/buildpacks frontend path was fixed by updating and committing `cedar-mastra-agent/pnpm-lock.yaml`. Its service agent, `service-496012954691@gcp-sa-firebaseapphosting.iam.gserviceaccount.com`, was granted `roles/run.admin` so it could manage the Cloud Run public invocation policy it was attempting to set.

Public frontend invocation was restored with:

```bash
gcloud run services update rutgers-soc-agent \
  --region us-east4 \
  --project concise-foundry-465822-d7 \
  --no-invoker-iam-check
```

## Verification

Final successful frontend builds included:

- `2dd03d3a-4e60-4699-a216-770185036bb2`
- `c7b6f4b9-ac57-40bf-a52c-f49600b346ff`

Final successful backend builds included:

- `061422a8-7e6a-4f07-8553-83c69eac92ec`

After the final documentation and deployment fixes were pushed, all Cloud Build jobs for commit `101b549` were successful.

Final Cloud Run traffic state:

- Frontend: `rutgers-soc-agent-00036-dnv` at 100% traffic
- Backend: `rutgers-agent-mastra-backend-00014-8sp` at 100% traffic

The final smoke check passed:

```bash
cd cedar-mastra-agent
npm run deploy:verify
```

Output:

```text
Deployment smoke checks passed.
```

Recent Cloud Run error logs were checked after rollout and did not show active frontend or backend service errors.

## Follow-Up Notes

Keep incident-specific build IDs, exact failure order, and dated recovery details in this file or other files under `DOCS`. Keep `cedar-mastra-agent/DEPLOYMENT.md` focused on the reusable workflow for future deployments.

For future dependency changes, remember that the frontend has two active deploy consumers: the Docker path uses `package-lock.json`, while the Firebase App Hosting/buildpacks path uses `pnpm-lock.yaml`.
