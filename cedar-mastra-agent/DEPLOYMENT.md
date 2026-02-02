# Deployment Plan: Vercel (Frontend) + GCP Cloud Run (Backend)

This is a step-by-step deployment plan tailored to this repo structure. Follow in order.

---

## 0) Assumptions and naming

Pick names and reuse them throughout:

- `GCP_PROJECT_ID`: Your Google Cloud project ID.
- `GCP_REGION`: Choose a region (example: `us-central1`).
- `SERVICE_NAME`: Example: `rutgers-soc-mastra-backend`.
- `AR_REPO`: Artifact Registry repo name, example: `mastra-backend`.
- `IMAGE_NAME`: Example: `mastra-backend`.
- `VERCEL_PROJECT`: Your Vercel project name.

---

## 1) Confirm env vars used by the app

Backend `.env` (from `README.md`):

- `GOOGLE_VERTEX_PROJECT`
- `GOOGLE_VERTEX_LOCATION`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Frontend (from `src/app/layout.tsx`):

- `NEXT_PUBLIC_MASTRA_URL` (points to the backend URL)

Decision: We will set all backend vars as Cloud Run environment variables. For Vertex AI auth we will use a service account (recommended), not a JSON key file.

---

## 2) Create GCP service account + permissions

1. In GCP Console → IAM & Admin → Service Accounts → Create.
2. Name it `mastra-backend-sa`.
3. Grant roles:
   - `Vertex AI User`
   - `Service Account Token Creator` (needed for some Vertex auth flows)
4. Note the service account email.

We will attach this service account to the Cloud Run service.

---

## 3) Create Artifact Registry repo

```bash
gcloud services enable artifactregistry.googleapis.com run.googleapis.com cloudbuild.googleapis.com
gcloud artifacts repositories create $AR_REPO \
  --repository-format=docker \
  --location=$GCP_REGION \
  --description="Mastra backend images"
```

---

## 4) Add a Dockerfile for the backend

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

# Cloud Run listens on $PORT; Mastra should bind to it.
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080
CMD ["pnpm", "run", "start"]
```

Add `cedar-mastra-agent/src/backend/.dockerignore`:

```
node_modules
dist
.env
```

Notes:
- The backend requires Node 22 (per `src/backend/package.json`).
- If Mastra does not honor `PORT`, update the `CMD` to include a port flag after checking `mastra --help`.

---

## 5) Build and push the backend image

From the repo root:

```bash
cd cedar-mastra-agent/src/backend
gcloud auth configure-docker $GCP_REGION-docker.pkg.dev

IMAGE_URI="$GCP_REGION-docker.pkg.dev/$GCP_PROJECT_ID/$AR_REPO/$IMAGE_NAME:$(date +%Y%m%d%H%M%S)"
docker build -t "$IMAGE_URI" .
docker push "$IMAGE_URI"
```

---

## 6) Deploy backend to Cloud Run

```bash
gcloud run deploy $SERVICE_NAME \
  --image "$IMAGE_URI" \
  --region $GCP_REGION \
  --platform managed \
  --allow-unauthenticated \
  --service-account mastra-backend-sa@$GCP_PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars "GOOGLE_VERTEX_PROJECT=$GCP_PROJECT_ID,GOOGLE_VERTEX_LOCATION=$GCP_REGION,SUPABASE_URL=YOUR_SUPABASE_URL,SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY"
```

After deploy, note the Cloud Run URL (we will use it for Vercel).

---

## 7) Verify backend health locally

1. Test the Cloud Run URL with a simple curl:

```bash
curl -i https://YOUR_CLOUD_RUN_URL/chat
```

If your backend is configured only for POST endpoints, expect a 404/405 for GET. That still confirms the service is reachable.

2. For a real test, send a POST:

```bash
curl -X POST https://YOUR_CLOUD_RUN_URL/chat/execute-function \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello","temperature":0.2,"maxTokens":64,"systemPrompt":"You are a helpful assistant."}'
```

---

## 8) Deploy frontend on Vercel

1. In Vercel, create a new project and import the repo.
2. Set the **Root Directory** to `cedar-mastra-agent`.
3. Build settings:
   - Framework: Next.js
   - Build Command: `npm run build`
   - Output: `.next`
4. Environment variables:
   - `NEXT_PUBLIC_MASTRA_URL=https://YOUR_CLOUD_RUN_URL`
5. Deploy.

---

## 9) Verify end-to-end

1. Open the Vercel URL.
2. Open the Cedar chat UI.
3. Send a message and confirm you get a response.

If you see network errors:
- Ensure `NEXT_PUBLIC_MASTRA_URL` is correct.
- Ensure Cloud Run allows unauthenticated requests (or add auth if you want it private).
- Check CORS: if needed, allow your Vercel domain in the backend CORS config.

---

## 10) Production hardening (recommended)

- Lock down Cloud Run with IAM and require an API key or JWT.
- Set up a custom domain for Cloud Run.
- Add rate limiting at Cloud Run or via a proxy.
- Store secrets in Secret Manager and reference them in Cloud Run env vars.

---

## 11) Optional: automate builds with Cloud Build

You can use a Cloud Build trigger on `main` to build and deploy the backend. This avoids local Docker builds.

---

## Quick checklist

- [ ] Cloud Run service deployed and reachable
- [ ] `NEXT_PUBLIC_MASTRA_URL` set on Vercel
- [ ] Vertex + Supabase env vars set on Cloud Run
- [ ] End-to-end chat works

