# Browser Automation Plan (Degree Navigator + WebReg)

This is a historical design note. The current implemented harness is summarized in [`HARNESS.md`](HARNESS.md); use that file as the source of truth for active tools, routes, frontend state, and guardrails.

## Bottom line
Use a **remote browser session** (not a direct Rutgers iframe) and embed the provider's **live view iframe** in your app. Let the student log in manually inside that live view, then let Mastra call browser-action tools against that same session.

This gives you the UX you want (browser pane in page + agent control) while avoiding same-origin/frame-policy blockers from trying to directly script a third-party Rutgers iframe.

## Why direct iframe control is the wrong abstraction
- Parent pages cannot directly inspect/control cross-origin iframe DOM due browser same-origin policy.
- Cross-origin communication requires explicit `postMessage` cooperation from the embedded app (Rutgers apps do not expose this integration contract).
- Rutgers WebReg explicitly warns against automated registration software.

## Recommended stack (easy + elegant)
- **Browser runtime**: Browserbase session
- **Automation driver**: Playwright (or Stagehand on top of Playwright)
- **Agent integration**: Mastra tools in backend
- **Frontend UX**: Cedar state + `iframe` that points to Browserbase Live View URL

## Architecture
1. Signed-in frontend requests `createBrowserSession` with a Supabase bearer token.
2. Backend verifies the token, derives the authenticated Supabase user, creates a remote session, and returns `{ sessionId, liveViewUrl }`.
3. Frontend stores session state and renders iframe pane with `liveViewUrl`.
4. User logs in manually in iframe (no credential collection by your app).
5. Agent executes browser tools against that `sessionId`:
   - `browserNavigate`
   - `browserObserve`
   - `browserExtract`
   - `browserAct` (guarded)
6. Structured Degree Navigator captures can be validated and saved to `public.degree_navigator_profiles`.
7. For high-risk actions (submit/register/drop), require explicit human confirmation and a server-issued single-use confirmation token before execution.

## Rutgers-specific guardrails
- Treat **WebReg registration submit** as restricted: require a final explicit confirm step and warn about policy risk.
- Default automation to read-only where possible (plan checks, degree audits, schedule options).
- Auto-expire and destroy remote sessions after inactivity.

## Current implementation pointers
- Agent/tool registry:
  - `src/backend/src/mastra/agents/soc-agent.ts`
  - `src/backend/src/mastra/tools/toolDefinitions.ts`
  - browser tools under `src/backend/src/mastra/tools/browser/`
  - Degree Navigator tools under `src/backend/src/mastra/tools/degree-navigator/`
- Frontend tool/state bridge:
  - `src/app/page.tsx`
  - Cedar state for `browserSession`, browser session frontend tools, and Degree Navigator readiness/extraction orchestration
- UI pane:
  - embedded Browserbase Live View pane beside schedule/search/chat

## Data model

Browser session metadata is operational state and is stored separately from student academic data.

```ts
interface BrowserSessionState {
  provider: 'browserbase';
  sessionId: string;
  liveViewUrl: string;
  target: 'degree_navigator';
  status: 'created' | 'awaiting_login' | 'ready' | 'error' | 'closed';
  ownerId: string; // server-derived Supabase user id
  createdAt: string;
  lastHeartbeatAt: string;
}
```

Saved Degree Navigator data uses one latest user-owned row in `public.degree_navigator_profiles`:

```ts
interface DegreeNavigatorProfileCapture {
  profile: {
    name?: string;
    ruid?: string;
    netid?: string;
    school?: { code?: string; name?: string };
    declaredGraduation?: { year?: string; month?: string };
    degreeCreditsEarned?: number;
    cumulativeGpa?: number;
    plannedCourseCount?: number;
  };
  programs: Array<{ code?: string; title: string; campus?: string; kind?: string }>;
  audits: unknown[];
  transcriptTerms: unknown[];
  runNotes: Record<string, unknown>;
}
```

The canonical validation schema is `src/backend/src/degree-navigator/schemas.ts`. The table stores top-level lookup fields plus JSONB columns for the nested audit and transcript documents.

## Tool contract sketch
```ts
ensureDegreeNavigatorSession({})
closeBrowserSession({ sessionId })
browserNavigate({ sessionId, url })
browserObserve({ sessionId })
browserExtract({ sessionId, instruction })
browserAct({ sessionId, action, requireConfirmationToken })
readDegreeNavigatorProfile({})
readDegreeNavigatorExtractionRun({ runId })
saveDegreeNavigatorProfile({ capture })
```

`createBrowserSession({ target })` still exists as a lower-level backend tool/route concept, but the active agent uses `ensureDegreeNavigatorSession` so the frontend can open or reuse the pane-backed session.

## Human-in-the-loop policy
- `browserAct` checks whether action is sensitive (`submit`, `register`, `drop`, `confirm`).
- If sensitive and no confirmation token, return a structured `needs_confirmation` response.
- Agent asks user for explicit confirmation and retries with the server-issued token.

## Delivery phases
1. **Phase 1 (implemented)**
   - Session create/close + iframe live view in UI
   - Manual login + safe read-only extract
2. **Phase 2 (implemented for Degree Navigator)**
   - Add structured `observe/extract/act` tools
   - Add confirmation gate for sensitive actions
3. **Phase 3 (ongoing production hardening)**
   - Per-user session ownership checks using authenticated Supabase `user_id`
   - Redaction and minimal retention
   - Rate limiting, audit logging, and failure recovery

## Non-negotiable security
- Never ask/store Rutgers passwords in app DB.
- Keep auth only inside the remote browser session.
- Scope backend tools to the requesting authenticated user.
- Log action metadata, not page secrets.
- Do not store raw page HTML, screenshots, or Browserbase Live View URLs in Degree Navigator profile rows.

## References
- MDN same-origin policy: https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy
- MDN X-Frame-Options: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options
- MDN postMessage: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
- Playwright frames: https://playwright.dev/docs/frames
- Browserbase Live View docs: https://docs.browserbase.com/features/live-view
- Browserbase + Mastra + Stagehand quickstart: https://docs.browserbase.com/integrations/mastra
- Rutgers WebReg warnings: https://sims.rutgers.edu/webreg/
- Rutgers Degree Navigator page: https://dn.rutgers.edu/
- Rutgers CAS SSO docs: https://sso.rutgers.edu/cas/login
