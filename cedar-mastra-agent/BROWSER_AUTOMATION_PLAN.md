# Browser Automation Plan (Degree Navigator + WebReg)

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
1. Frontend requests `createBrowserSession` tool.
2. Backend creates remote session and returns `{ sessionId, liveViewUrl }`.
3. Frontend stores session state and renders iframe pane with `liveViewUrl`.
4. User logs in manually in iframe (no credential collection by your app).
5. Agent executes browser tools against that `sessionId`:
   - `browserNavigate`
   - `browserObserve`
   - `browserExtract`
   - `browserAct` (guarded)
6. For high-risk actions (submit/register/drop), require explicit human confirmation in chat before execution.

## Rutgers-specific guardrails
- Treat **WebReg registration submit** as restricted: require a final explicit confirm step and warn about policy risk.
- Default automation to read-only where possible (plan checks, degree audits, schedule options).
- Auto-expire and destroy remote sessions after inactivity.

## Where to wire this in this codebase
- Agent/tool registry:
  - `src/backend/src/mastra/agents/soc-agent.ts`
  - `src/backend/src/mastra/tools/toolDefinitions.ts`
  - add new files under `src/backend/src/mastra/tools/browser/`
- Frontend tool/state bridge:
  - `src/app/page.tsx`
  - add Cedar state for `browserSession` and setter tools for iframe URL/status
- UI pane:
  - add a browser pane component in the main grid beside schedule/search/chat

## Data model
```ts
interface BrowserSessionState {
  provider: 'browserbase';
  sessionId: string;
  liveViewUrl: string;
  target: 'degree_navigator' | 'webreg';
  status: 'created' | 'awaiting_login' | 'ready' | 'error' | 'closed';
  lastHeartbeatAt: string;
}
```

## Tool contract sketch
```ts
createBrowserSession({ target })
closeBrowserSession({ sessionId })
browserNavigate({ sessionId, url })
browserObserve({ sessionId })
browserExtract({ sessionId, instruction })
browserAct({ sessionId, action, requireConfirmationToken })
```

## Human-in-the-loop policy
- `browserAct` checks whether action is sensitive (`submit`, `register`, `drop`, `confirm`).
- If sensitive and no confirmation token, return a structured `needs_confirmation` response.
- Agent asks user for explicit confirmation and retries with token.

## Delivery phases
1. **Phase 1 (fast POC)**
   - Session create/close + iframe live view in UI
   - Manual login + safe read-only extract
2. **Phase 2 (guided automation)**
   - Add structured `observe/extract/act` tools
   - Add confirmation gate and audit logs
3. **Phase 3 (production hardening)**
   - Per-user session ownership checks
   - Redaction and minimal retention
   - Rate limiting and failure recovery

## Non-negotiable security
- Never ask/store Rutgers passwords in app DB.
- Keep auth only inside the remote browser session.
- Scope backend tools to the requesting authenticated user.
- Log action metadata, not page secrets.

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
