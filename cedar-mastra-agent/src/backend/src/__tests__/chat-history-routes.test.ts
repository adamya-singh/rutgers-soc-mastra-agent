import { describe, it } from 'node:test';
import assert from 'node:assert';

import { setAuthTokenVerifier } from '../auth/supabaseAuth.js';
import { setChatHistorySupabaseClientFactoryForTest } from '../chat/repository.js';
import { apiRoutes } from '../mastra/apiRegistry.js';

const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
const THREAD_ID = '22222222-2222-4222-8222-222222222222';

function jsonResponder(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function withAuthReq<T extends object>(req: T): T & {
  header: (name: string) => string | undefined;
} {
  return {
    ...req,
    header: (name: string) => (name.toLowerCase() === 'authorization' ? 'Bearer test_token' : undefined),
  };
}

function createMissingThreadClient() {
  return {
    from(table: string) {
      assert.strictEqual(table, 'chat_threads');
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        is() {
          return query;
        },
        maybeSingle: async () => ({
          data: null,
          error: null,
        }),
      };
      return query;
    },
  };
}

describe('chat history API routes', () => {
  it('registers chat history endpoints', () => {
    assert.ok(apiRoutes.some((route) => route.path === '/chat/threads' && route.method === 'GET'));
    assert.ok(apiRoutes.some((route) => route.path === '/chat/threads' && route.method === 'POST'));
    assert.ok(apiRoutes.some((route) => route.path === '/chat/thread' && route.method === 'POST'));
    assert.ok(apiRoutes.some((route) => route.path === '/chat/thread' && route.method === 'PATCH'));
    assert.ok(apiRoutes.some((route) => route.path === '/chat/thread' && route.method === 'DELETE'));
  });

  it('rejects loading saved chats without a bearer token', async () => {
    const loadRoute = apiRoutes.find((route) => route.path === '/chat/thread' && route.method === 'POST');
    assert.ok(loadRoute?.handler, 'Missing chat thread load route handler');

    try {
      const response = await loadRoute.handler({
        req: {
          header: () => undefined,
          json: async () => ({ threadId: THREAD_ID }),
        },
        json: jsonResponder,
      } as never);

      assert.strictEqual(response.status, 401);
    } finally {
      setAuthTokenVerifier(null);
      setChatHistorySupabaseClientFactoryForTest(null);
    }
  });

  it('returns 404 when a user loads a thread they do not own', async () => {
    const loadRoute = apiRoutes.find((route) => route.path === '/chat/thread' && route.method === 'POST');
    assert.ok(loadRoute?.handler, 'Missing chat thread load route handler');

    setAuthTokenVerifier(async (token) => {
      assert.strictEqual(token, 'test_token');
      return {
        userId: TEST_USER_ID,
        email: 'student@example.com',
      };
    });
    setChatHistorySupabaseClientFactoryForTest(() => createMissingThreadClient() as never);

    try {
      const response = await loadRoute.handler({
        req: withAuthReq({
          json: async () => ({ threadId: THREAD_ID }),
        }),
        json: jsonResponder,
      } as never);

      assert.strictEqual(response.status, 404);
    } finally {
      setAuthTokenVerifier(null);
      setChatHistorySupabaseClientFactoryForTest(null);
    }
  });
});
