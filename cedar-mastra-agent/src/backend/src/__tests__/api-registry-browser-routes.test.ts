import { describe, it } from 'node:test';
import assert from 'node:assert';

import { apiRoutes } from '../mastra/apiRegistry.js';
import {
  resetBrowserSessionRepository,
  setBrowserSessionRepository,
} from '../browser/browserService.js';
import { BrowserSessionRepository, createInMemoryBrowserSessionRepository } from '../browser/sessionRepository.js';

describe('browser session API routes', () => {
  it('registers create/status/close/close-beacon browser session endpoints', () => {
    const byPath = new Map(apiRoutes.map((route) => [route.path, route]));

    const createRoute = byPath.get('/browser/session/create');
    const statusRoute = byPath.get('/browser/session/status');
    const closeRoute = byPath.get('/browser/session/close');
    const closeBeaconRoute = byPath.get('/browser/session/close-beacon');

    assert.ok(createRoute, 'Missing /browser/session/create route');
    assert.ok(statusRoute, 'Missing /browser/session/status route');
    assert.ok(closeRoute, 'Missing /browser/session/close route');
    assert.ok(closeBeaconRoute, 'Missing /browser/session/close-beacon route');

    assert.strictEqual(createRoute?.method, 'POST');
    assert.strictEqual(statusRoute?.method, 'POST');
    assert.strictEqual(closeRoute?.method, 'POST');
    assert.strictEqual(closeBeaconRoute?.method, 'POST');
  });

  it('accepts text/plain close-beacon payloads and returns 200', async () => {
    const closeBeaconRoute = apiRoutes.find((route) => route.path === '/browser/session/close-beacon');
    assert.ok(closeBeaconRoute?.handler, 'Missing close-beacon route handler');

    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.BROWSERBASE_API_KEY;
    const originalProjectId = process.env.BROWSERBASE_PROJECT_ID;
    const repository = createInMemoryBrowserSessionRepository();
    setBrowserSessionRepository(repository);
    process.env.BROWSERBASE_API_KEY = 'test_api_key';
    process.env.BROWSERBASE_PROJECT_ID = 'test_project_id';

    try {
      globalThis.fetch = (async () => {
        return new Response(JSON.stringify({ statusCode: 404 }), { status: 404 });
      }) as typeof fetch;

      const response = await closeBeaconRoute.handler({
        req: {
          json: async () => {
            throw new Error('Not JSON');
          },
          text: async () =>
            JSON.stringify({
              browserClientId: 'owner_1',
              sessionId: 'session_unknown_1',
              reason: 'pagehide',
              allowUntracked: true,
            }),
        },
        json: (payload: unknown, status: number) =>
          new Response(JSON.stringify(payload), {
            status,
            headers: { 'Content-Type': 'application/json' },
          }),
      } as never);

      assert.strictEqual(response.status, 200);
      const body = (await response.json()) as { accepted: boolean; terminated: boolean };
      assert.strictEqual(body.accepted, true);
      assert.strictEqual(typeof body.terminated, 'boolean');
    } finally {
      resetBrowserSessionRepository();
      globalThis.fetch = originalFetch;
      process.env.BROWSERBASE_API_KEY = originalApiKey;
      process.env.BROWSERBASE_PROJECT_ID = originalProjectId;
    }
  });

  it('rejects invalid payload for strict close route', async () => {
    const closeRoute = apiRoutes.find((route) => route.path === '/browser/session/close');
    assert.ok(closeRoute?.handler, 'Missing close route handler');

    const originalConsoleError = console.error;
    console.error = () => undefined;
    let response: Response;
    try {
      response = await closeRoute.handler({
        req: {
          json: async () => ({ sessionId: 'session_1' }),
        },
        json: (payload: unknown, status: number) =>
          new Response(JSON.stringify(payload), {
            status,
            headers: { 'Content-Type': 'application/json' },
          }),
      } as never);
    } finally {
      console.error = originalConsoleError;
    }

    assert.notStrictEqual(response.status, 200);
  });

  it('close route response includes termination metadata fields', async () => {
    const closeRoute = apiRoutes.find((route) => route.path === '/browser/session/close');
    assert.ok(closeRoute?.handler, 'Missing close route handler');

    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.BROWSERBASE_API_KEY;
    const originalProjectId = process.env.BROWSERBASE_PROJECT_ID;
    const repository: BrowserSessionRepository = createInMemoryBrowserSessionRepository();
    setBrowserSessionRepository(repository);
    process.env.BROWSERBASE_API_KEY = 'test_api_key';
    process.env.BROWSERBASE_PROJECT_ID = 'test_project_id';

    await repository.create({
      provider: 'browserbase',
      sessionId: 'session_meta_1',
      liveViewUrl: 'https://example.com/live',
      target: 'degree_navigator',
      status: 'ready',
      ownerId: 'owner_meta',
    });

    const calls: Array<{ input: string; init?: RequestInit }> = [];
    try {
      globalThis.fetch = (async (input, init) => {
        calls.push({ input: String(input), init });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }) as typeof fetch;

      const response = await closeRoute.handler({
        req: {
          json: async () => ({
            browserClientId: 'owner_meta',
            sessionId: 'session_meta_1',
            reason: 'manual_stop',
            allowUntracked: false,
          }),
        },
        json: (payload: unknown, status: number) =>
          new Response(JSON.stringify(payload), {
            status,
            headers: { 'Content-Type': 'application/json' },
          }),
      } as never);

      assert.strictEqual(response.status, 200);
      const body = (await response.json()) as {
        accepted: boolean;
        terminated: boolean;
        terminationMethod: string;
        terminationVerified?: boolean;
        providerStillRunning?: boolean;
      };

      assert.strictEqual(body.accepted, true);
      assert.strictEqual(body.terminated, true);
      assert.strictEqual(body.terminationMethod, 'request_release');
      assert.strictEqual(typeof body.terminationVerified, 'boolean');
      assert.strictEqual(typeof body.providerStillRunning, 'boolean');
      assert.strictEqual(calls[0]?.input, 'https://api.browserbase.com/v1/sessions/session_meta_1');
      assert.strictEqual(calls[0]?.init?.method, 'POST');
      assert.deepStrictEqual(JSON.parse(String(calls[0]?.init?.body)), {
        projectId: 'test_project_id',
        status: 'REQUEST_RELEASE',
      });
    } finally {
      resetBrowserSessionRepository();
      globalThis.fetch = originalFetch;
      process.env.BROWSERBASE_API_KEY = originalApiKey;
      process.env.BROWSERBASE_PROJECT_ID = originalProjectId;
    }
  });
});
