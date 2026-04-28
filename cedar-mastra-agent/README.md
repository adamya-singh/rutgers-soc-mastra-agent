# Cedar-OS + Mastra Starter Template

A blank starter template combining [Cedar-OS](https://cedar.ai) for the frontend AI interface and [Mastra](https://mastra.ai) for the backend agent orchestration.

## Features

- **🤖 AI Chat Integration**: Built-in chat workflows powered by OpenAI through Mastra agents
- **⚡ Real-time Streaming**: Server-sent events (SSE) for streaming AI responses
- **🎨 Beautiful UI**: Cedar-OS components with 3D effects and modern design
- **🔧 Type-safe Workflows**: Mastra-based backend with full TypeScript support
- **📡 Dual API Modes**: Both streaming and non-streaming chat endpoints

## Quick Start

The fastest way to get started:

```bash
npx cedar-os-cli plant-seed
```

Then select this template when prompted. This will set up the entire project structure and dependencies automatically.

This template contains the Cedar chat connected to a mastra backend to demonstrate what endpoints need to be implemented.

For more details, see the [Cedar Getting Started Guide](https://docs.cedarcopilot.com/getting-started/getting-started).

## Manual Setup

### Prerequisites

- Node.js 18+
- OpenAI API key
- pnpm (recommended) or npm

### Installation

1. **Clone and install dependencies:**

```bash
git clone <repository-url>
cd cedar-mastra-starter
pnpm install && cd src/backend && pnpm install && cd ../..
```

2. **Set up environment variables:**
   Create a `.env` file in the root directory (see `.env.example`):

```env
# Google Vertex AI
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
GOOGLE_VERTEX_PROJECT=your-gcp-project-id
GOOGLE_VERTEX_LOCATION=us-central1

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

3. **Start the development servers:**

```bash
npm run dev
```

This runs both the Next.js frontend and Mastra backend concurrently:

- Frontend: http://localhost:3000
- Backend API: http://localhost:4111

## Project Architecture

### Frontend (Next.js + Cedar-OS)

- **Simple Chat UI**: See Cedar OS components in action in a pre-configured chat interface
- **Cedar-OS Components**: Cedar-OS Components installed in shadcn style for local changes
- **Tailwind CSS, Typescript, NextJS**: Patterns you're used to in any NextJS project

### Backend (Mastra)

- **Chat Workflow**: Example of a Mastra workflow – a chained sequence of tasks including LLM calls
- **Streaming Utils**: Examples of streaming text, status updates, and objects like tool calls
- **API Routes**: Examples of registering endpoint handlers for interacting with the backend

## API Endpoints (Mastra backend)

Mastra backend routes are authenticated. Include the current Supabase access token as a bearer token.

### Streaming Chat

```http
POST /chat/stream
Content-Type: application/json
Authorization: Bearer <supabase-access-token>

{
  "prompt": "Tell me a story",
  "temperature": 0.7
}
```

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

The chat stream returns Server-Sent Events with:

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

## Learn More

- [Cedar-OS Documentation](https://docs.cedarcopilot.com/)
- [Mastra Documentation](https://mastra.ai/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Rutgers SOC Tools Spec](./TOOLS-SPEC.md)

## License

MIT License - see LICENSE file for details.
