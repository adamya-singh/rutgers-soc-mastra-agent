# Google Vertex AI Setup

This repository uses Google Vertex AI for Gemini-backed Mastra agent responses and, optionally, Stagehand browser automation.

## 1. Prerequisites In Google Cloud

- Use a GCP project with billing enabled.
- Enable the Vertex AI API in that project.
- Create or attach a service account with Vertex AI access, for example `roles/aiplatform.user`.
- For Cloud Run, prefer attaching the service account to the workload instead of using a JSON key.

## 2. Local Credentials

For local development, use Application Default Credentials or a service account key file:

```bash
gcloud auth application-default login
```

If you use a service account JSON key, store it outside the repository and point `GOOGLE_APPLICATION_CREDENTIALS` at the absolute path. Do not commit keys or `.env` files.

## 3. Environment Variables

Set these in `cedar-mastra-agent/.env`, deployment secrets, or the runtime environment:

- `GOOGLE_VERTEX_PROJECT` - GCP project used for Vertex AI calls.
- `GOOGLE_VERTEX_LOCATION` - Vertex region or location, for example `global`.
- `GOOGLE_APPLICATION_CREDENTIALS` - optional local path to a service account JSON file.

For Stagehand browser tools that should use Vertex/Gemini, also set:

- `STAGEHAND_MODEL_PROVIDER=vertex`
- `STAGEHAND_MODEL_NAME=vertex/gemini-3.1-pro-preview` or another supported Vertex model with the `vertex/` prefix.

Stagehand can alternatively use `STAGEHAND_MODEL_API_KEY` or `OPENAI_API_KEY` for API-key-backed models.

The Mastra agent model is configured separately in code as `gemini-3.1-pro-preview` through `createVertex`; only Stagehand Vertex model names use the `vertex/` prefix.

## 4. Code Paths

Vertex configuration is initialized in:

- `cedar-mastra-agent/src/backend/src/mastra/agents/soc-agent.ts` for the Rutgers SOC Mastra agent.
- `cedar-mastra-agent/src/backend/src/browser/browserService.ts` for Stagehand observe, extract, and act tools when Vertex mode is enabled.

Both paths read `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION`, and `GOOGLE_APPLICATION_CREDENTIALS`.

## 5. How To Run Locally

```bash
cd cedar-mastra-agent
npm install
npm --prefix src/backend install
npm run dev
```

The root `dev` script loads `cedar-mastra-agent/.env` and starts both the Next.js app and Mastra backend.

## 6. Production Auth

On Cloud Run, attach the service account to the backend service and set `GOOGLE_VERTEX_PROJECT` and `GOOGLE_VERTEX_LOCATION` as runtime environment variables. With workload credentials attached, `GOOGLE_APPLICATION_CREDENTIALS` is not required.

For this repo's current Cloud Run deployment details, service names, Secret Manager bindings, and verification commands, see [`cedar-mastra-agent/DEPLOYMENT.md`](cedar-mastra-agent/DEPLOYMENT.md).

## 7. Quick Verification Checklist

- Vertex AI API is enabled in the target project.
- The runtime service account has Vertex AI permissions.
- `GOOGLE_VERTEX_PROJECT` and `GOOGLE_VERTEX_LOCATION` are set.
- Local-only `GOOGLE_APPLICATION_CREDENTIALS`, if used, points to a readable JSON key outside the repo.
- Backend requests complete successfully and appear in Google Cloud Vertex AI monitoring or billing views.

## 8. Troubleshooting

- 403 or permission errors: check service account roles, project, and location.
- Missing credentials locally: run `gcloud auth application-default login` or set `GOOGLE_APPLICATION_CREDENTIALS`.
- Stagehand model errors: keep the `vertex/` prefix in `STAGEHAND_MODEL_NAME` when `STAGEHAND_MODEL_PROVIDER=vertex`.
- Unexpected billing project: confirm the runtime is using the intended `GOOGLE_VERTEX_PROJECT`.