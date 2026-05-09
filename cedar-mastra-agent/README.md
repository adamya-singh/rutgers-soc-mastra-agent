# Rutgers SOC Mastra Agent

A Rutgers Schedule of Classes assistant that combines a Next.js/Cedar-OS frontend, a Mastra backend agent, Supabase Auth/Postgres, and Browserbase-powered Degree Navigator automation.

The canonical harness map is [`HARNESS.md`](HARNESS.md). Deployment and production operations are documented in [`DEPLOYMENT.md`](DEPLOYMENT.md). Dated deployment incidents live under the repo-root [`DOCS`](../DOCS) folder.

## Features

- **Rutgers SOC search and planning**: Course, section, prerequisite, conflict, and room-availability tools backed by Supabase SOC catalog tables.
- **AI chat interface**: Cedar-OS frontend connected to Mastra streaming workflows.
- **Supabase auth and user data**: Email/password auth, saved schedules, browser-session ownership, and Degree Navigator profile storage.
- **Degree Navigator browser automation**: Browserbase Live View sessions with manual Rutgers login, read-only extraction, and confirmation gates for sensitive actions.

## Quick Start

Install dependencies from the app root and backend package:

```bash
npm install
npm --prefix src/backend install
```

## Manual Setup

### Prerequisites

- Node.js 22+ for the backend package
- Supabase project with the migrations in `supabase/migrations/` applied
- Google Vertex AI credentials, or an API-key-backed Stagehand model provider
- Browserbase API key/project ID for Degree Navigator automation
- pnpm (recommended) or npm

### Installation

1. **Clone and install dependencies:**

```bash
git clone <repository-url>
cd cedar-mastra-agent
npm install && npm --prefix src/backend install
```

2. **Set up environment variables:**
   Create a `.env` file in the app root directory with the required variables:

```env
# Google Vertex AI
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
GOOGLE_VERTEX_PROJECT=your-gcp-project-id
GOOGLE_VERTEX_LOCATION=global

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANONYMOUS_CHAT_TOKEN_SECRET=long-random-secret
ANONYMOUS_CHAT_DAILY_MESSAGE_LIMIT=10

# Browserbase
BROWSERBASE_API_KEY=your-browserbase-key
BROWSERBASE_PROJECT_ID=your-browserbase-project-id

# Stagehand browser tools
STAGEHAND_MODEL_PROVIDER=vertex
STAGEHAND_MODEL_NAME=vertex/gemini-3.1-pro-preview

# Frontend/backend connection
NEXT_PUBLIC_MASTRA_URL=http://localhost:4112
```

3. **Start the development servers:**

```bash
npm run dev
```

This runs both the Next.js frontend and Mastra backend concurrently:

- Frontend: http://localhost:3000
- Backend API: http://localhost:4112

## Project Architecture

### Frontend (Next.js + Cedar-OS)

- **Simple Chat UI**: See Cedar OS components in action in a pre-configured chat interface
- **Cedar-OS Components**: Cedar-OS Components installed in shadcn style for local changes
- **Tailwind CSS, Typescript, NextJS**: Patterns you're used to in any NextJS project

### Backend (Mastra)

- **Chat Workflow**: Authenticated streaming workflow for the Rutgers SOC agent.
- **SOC Tools**: Course search, section lookup, prerequisites, schedule conflicts, metadata browsing, and room availability.
- **Browser Tools**: Browserbase session lifecycle plus Stagehand observe/extract/act tools for Degree Navigator.
- **Degree Navigator Storage**: Validated profile/audit/transcript captures in `public.degree_navigator_profiles`.

## API Endpoints (Mastra backend)

The full route map is maintained in [`HARNESS.md`](HARNESS.md). Most Mastra backend routes are authenticated with the current Supabase access token as a bearer token.

Anonymous users can use the Vercel chat route through the limited anonymous trial flow. The frontend stores a backend-signed anonymous chat token in browser storage and the backend enforces a daily message quota for that anonymous browser identity. Clearing browser cookies/cache/site data removes that local anonymous token, so the backend treats the browser as a new anonymous identity and the anonymous limit resets. This is a trial/abuse-deterrence limit, not a durable account-level quota; signing in is required for saved chat history and user-owned Degree Navigator data.

### Chat APIs

The current frontend uses `POST /chat/ui` for AI SDK UI-message streaming, persisted chat threads, and anonymous trial chat. The older authenticated SSE workflow is still available at `POST /chat/stream`.

```http
POST /chat/ui
Content-Type: application/json
Authorization: Bearer <supabase-access-token>

{
  "threadId": "<thread-id>",
  "messages": [],
  "temperature": 0.7,
  "additionalContext": {}
}
```

Authenticated chat thread helpers are available at `GET /chat/threads`, `POST /chat/threads`, `POST /chat/thread`, `PATCH /chat/thread`, and `DELETE /chat/thread`. Anonymous trial setup is `POST /chat/anonymous/session`.

### Browser Session APIs

```http
POST /browser/session/create
Content-Type: application/json
Authorization: Bearer <supabase-access-token>

{
  "target": "degree_navigator"
}
```

Browser session ownership is derived from the verified Supabase user. Do not send or trust browser-local IDs for authorization.

The browser API family also includes session status, Degree Navigator readiness, Degree Navigator extraction, close, and close-beacon routes. See [`HARNESS.md`](HARNESS.md) for the exact list.

### Degree Navigator Profile APIs

```http
GET /degree-navigator/profile
Authorization: Bearer <supabase-access-token>
```

```http
POST /degree-navigator/profile
Content-Type: application/json
Authorization: Bearer <supabase-access-token>

{
  "profile": {
    "name": "Student Name",
    "ruid": "123456789",
    "netid": "netid",
    "degreeCreditsEarned": 86,
    "cumulativeGpa": 3.461
  },
  "programs": [],
  "audits": [],
  "transcriptTerms": [],
  "runNotes": {}
}
```

`DELETE /degree-navigator/profile` clears the authenticated user's saved profile. Degree Navigator data is saved as one latest user-owned row in `public.degree_navigator_profiles`. The backend derives `user_id` from the bearer token and validates the payload with `src/backend/src/degree-navigator/schemas.ts`.

The legacy `/chat/stream` endpoint returns Server-Sent Events with:

- **JSON Objects**: `{ type: 'stage_update', status: 'update_begin', message: 'Generating response...'}`
- **Text Chunks**: Streamed AI response text
- **Completion**: `event: done` signal

## Development

### Running the Project

```bash
# Start both frontend and backend
npm run dev

# Run frontend only
npm run dev:next

# Run backend only
npm run dev:mastra
```

### Deployment Checks

Before pushing deployment-related changes, run the same checks used by the Cloud Build paths:

```bash
npm run check:deploy:frontend
npm run check:deploy:backend
```

The repo currently has two frontend deploy consumers. The Cloud Build Docker path uses `package-lock.json`; the Firebase App Hosting/buildpacks path can still use `pnpm-lock.yaml`. When frontend dependencies change, keep both lockfiles synchronized.

## Learn More

- [Cedar-OS Documentation](https://docs.cedarcopilot.com/)
- [Mastra Documentation](https://mastra.ai/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Rutgers SOC Tools Spec](./TOOLS-SPEC.md)
- [Deployment Runbook](./DEPLOYMENT.md)

## License

License information has not been added to this repository yet.
