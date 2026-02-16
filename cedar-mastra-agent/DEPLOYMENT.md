# Deployment Plan: GCP Frontend + GCP Cloud Run Backend

This is a step-by-step deployment plan tailored to this repo structure.

Architecture:
- Frontend: Firebase App Hosting (Next.js app in `cedar-mastra-agent`)
- Backend: Google Cloud Run (Mastra service in `cedar-mastra-agent/src/backend`)
- Data/Auth: Supabase

---

## 0) Assumptions and naming

Pick names and reuse them throughout:

- `GCP_PROJECT_ID`: `concise-foundry-465822-d7`.
- `GCP_REGION`: `global` (Vertex model location for Gemini 3 models).
- `CLOUD_RUN_REGION`: `us-east4` (must not be `global`).
- `AR_LOCATION`: `us-east4`.
- `SERVICE_NAME`: `rutgers-agent-mastra-backend`.
- `SERVICE_ACCOUNT_NAME`: `rutgers-agent-mastra-backend`.
- `AR_REPO`: `rutgers-agent-backend-ar`.
- `IMAGE_NAME`: `rutgers-agent-mastra-backend-img`.
- `FIREBASE_PROJECT_ID`: `concise-foundry-465822-d7` (or a Firebase-linked project you choose).

---

## 1) Confirm env vars used by the app

Backend env vars (Mastra service):

- `GOOGLE_VERTEX_PROJECT`
- `GOOGLE_VERTEX_LOCATION`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Frontend env vars (Next.js app):

- `NEXT_PUBLIC_MASTRA_URL` (points to Cloud Run backend URL)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Notes:
- Frontend Supabase env vars are required by `src/lib/supabaseClient.ts`.
- For Vertex auth on Cloud Run, use a service account (recommended), not a JSON key file.

---

## 2) Create GCP service account + permissions

1. In GCP Console -> IAM & Admin -> Service Accounts -> Create.
2. Name it `rutgers-agent-mastra-backend`.
3. Grant roles:
   - `Vertex AI User`
   - `Service Account Token Creator` (needed for some Vertex auth flows)
4. Note the service account email.

Attach this service account to the Cloud Run backend service.

---

## 3) Enable required GCP APIs

```bash
gcloud services enable \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  firebase.googleapis.com
```

---

## 4) Create Artifact Registry repo

```bash
gcloud artifacts repositories create rutgers-agent-backend-ar \
  --repository-format=docker \
  --location=us-east4 \
  --description="Mastra backend images"
```

---

## 5) Add a Dockerfile for the backend

Create `cedar-mastra-agent/src/backend/Dockerfile` with this content:

```Dockerfile
FROM node:22-slim

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build Mastra
RUN pnpm run build

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080
CMD ["pnpm", "run", "start"]
```

Add `cedar-mastra-agent/src/backend/.dockerignore`:

```text
node_modules
dist
.env
```

Notes:
- Backend requires Node 22 (see `src/backend/package.json`).
- If Mastra does not honor `PORT`, adjust `CMD` after checking `mastra --help`.

---

## 6) Build and push backend image

From repo root:

```bash
cd cedar-mastra-agent/src/backend
gcloud auth configure-docker us-east4-docker.pkg.dev

IMAGE_URI="us-east4-docker.pkg.dev/concise-foundry-465822-d7/rutgers-agent-backend-ar/rutgers-agent-mastra-backend-img:$(date +%Y%m%d%H%M%S)"
docker build -t "$IMAGE_URI" .
docker push "$IMAGE_URI"
```

---

## 7) Deploy backend to Cloud Run

```bash
gcloud run deploy rutgers-agent-mastra-backend \
  --image "$IMAGE_URI" \
  --region us-east4 \
  --platform managed \
  --service-account rutgers-agent-mastra-backend@concise-foundry-465822-d7.iam.gserviceaccount.com \
  --set-env-vars "GOOGLE_VERTEX_PROJECT=concise-foundry-465822-d7,GOOGLE_VERTEX_LOCATION=global,SUPABASE_URL=https://cokisotftjntuswdfuhc.supabase.co,SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNva2lzb3RmdGpudHVzd2RmdWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMjY4OTQsImV4cCI6MjA4MzYwMjg5NH0.BU9D9cMt_j2Gd5HYf8Xccd02cq5SGSJk-EBVJZIyBCU"
```

Successful deployment reference:
- Service: `rutgers-agent-mastra-backend`
- Revision: `rutgers-agent-mastra-backend-00002-q95`
- URL: `https://rutgers-agent-mastra-backend-496012954691.us-east4.run.app`

Permission note:
- Deploy permissions apply to the active `gcloud` account, not the runtime service account.
- If you see `PERMISSION_DENIED: run.services.update`, switch account and grant IAM:
  - `roles/run.admin` on project `concise-foundry-465822-d7`
  - `roles/iam.serviceAccountUser` on `rutgers-agent-mastra-backend@concise-foundry-465822-d7.iam.gserviceaccount.com`
- Check active account with `gcloud auth list` and set it with `gcloud config set account YOUR_USER_EMAIL`.

---

## 8) Verify backend health

1. Basic reachability check:

```bash
curl -i https://rutgers-agent-mastra-backend-496012954691.us-east4.run.app/chat
```

If GET returns 404/405, that can still indicate service reachability.

2. Functional POST test:

```bash
curl -X POST https://rutgers-agent-mastra-backend-496012954691.us-east4.run.app/chat/execute-function \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello","temperature":0.2,"maxTokens":64,"systemPrompt":"You are a helpful assistant."}'
```

---

## 9) Deploy frontend on Firebase App Hosting (GCP)

1. In Firebase Console, create/select project `FIREBASE_PROJECT_ID`.
2. Go to **App Hosting** and connect your GitHub repo.
3. Set app root directory to `cedar-mastra-agent`.
4. Set frontend environment variables:
   - `NEXT_PUBLIC_MASTRA_URL=https://rutgers-agent-mastra-backend-496012954691.us-east4.run.app`
   - `NEXT_PUBLIC_SUPABASE_URL=https://cokisotftjntuswdfuhc.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<same anon key used by backend>`
5. Trigger deployment from the connected branch.

---

## 10) Verify end-to-end

1. Open the Firebase App Hosting URL.
2. Open Cedar chat UI and send a message.
3. Confirm response returns from backend.
4. Validate login/schedule features (they rely on frontend Supabase env vars).

If there are network errors:
- Check `NEXT_PUBLIC_MASTRA_URL` value.
- Confirm Cloud Run service is reachable.
- If you add CORS restrictions later, include your App Hosting domain.

---

## 11) Production hardening (recommended)

- Move sensitive values to Secret Manager and reference from Cloud Run.
- Add Cloud Monitoring alerts for backend latency/error rate.
- Configure Cloud Run min instances for reduced cold start.
- Add backend auth (JWT/API key/IAM) before broad public traffic.
- Configure custom domain + SSL for frontend App Hosting.

---

## 12) Optional CI/CD

- Use Cloud Build trigger for backend image build/deploy on `main`.
- Keep frontend auto-deploy via Firebase App Hosting GitHub integration.

---

## Quick checklist

- [ ] Cloud Run backend deployed and reachable
- [ ] Backend env vars set (`GOOGLE_VERTEX_*`, `SUPABASE_*`)
- [ ] Firebase App Hosting connected to repo and deployed
- [ ] Frontend env vars set (`NEXT_PUBLIC_MASTRA_URL`, `NEXT_PUBLIC_SUPABASE_*`)
- [ ] End-to-end chat and auth paths work
