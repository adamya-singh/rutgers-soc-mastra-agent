import { describe, it } from 'node:test';
import assert from 'node:assert';

import { setAuthTokenVerifier } from '../auth/supabaseAuth.js';
import { setDegreeNavigatorProfileSupabaseClientFactoryForTest } from '../degree-navigator/repository.js';
import { apiRoutes } from '../mastra/apiRegistry.js';

const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';

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

function createDeleteClient(options: {
  count: number | null;
  error?: { message: string } | null;
  calls: {
    table?: string;
    deleteOptions?: unknown;
    column?: string;
    userId?: string;
  };
}) {
  return {
    from: (table: string) => {
      options.calls.table = table;
      return {
        delete: (deleteOptions: unknown) => {
          options.calls.deleteOptions = deleteOptions;
          return {
            eq: async (column: string, userId: string) => {
              options.calls.column = column;
              options.calls.userId = userId;
              return {
                count: options.count,
                error: options.error ?? null,
              };
            },
          };
        },
      };
    },
  };
}

describe('Degree Navigator profile API routes', () => {
  it('registers GET, POST, and DELETE profile endpoints', () => {
    const profileRoutes = apiRoutes.filter((route) => route.path === '/degree-navigator/profile');
    const methods = new Set(profileRoutes.map((route) => route.method));

    assert.ok(methods.has('GET'), 'Missing GET /degree-navigator/profile');
    assert.ok(methods.has('POST'), 'Missing POST /degree-navigator/profile');
    assert.ok(methods.has('DELETE'), 'Missing DELETE /degree-navigator/profile');
  });

  it('rejects clear requests without a bearer token', async () => {
    const deleteRoute = apiRoutes.find(
      (route) => route.path === '/degree-navigator/profile' && route.method === 'DELETE',
    );
    assert.ok(deleteRoute?.handler, 'Missing Degree Navigator delete route handler');

    let deleteCalled = false;
    setAuthTokenVerifier(async () => {
      throw new Error('token verifier should not be reached without a bearer token');
    });
    setDegreeNavigatorProfileSupabaseClientFactoryForTest(() =>
      createDeleteClient({
        count: 1,
        calls: {},
      }) as never,
    );

    try {
      const response = await deleteRoute.handler({
        req: {
          header: () => undefined,
        },
        json: (payload: unknown, status: number) => {
          deleteCalled = true;
          return jsonResponder(payload, status);
        },
      } as never);

      assert.strictEqual(response.status, 401);
      assert.strictEqual(deleteCalled, true);
    } finally {
      setAuthTokenVerifier(null);
      setDegreeNavigatorProfileSupabaseClientFactoryForTest(null);
    }
  });

  it('clears the authenticated user profile through the scoped repository helper', async () => {
    const deleteRoute = apiRoutes.find(
      (route) => route.path === '/degree-navigator/profile' && route.method === 'DELETE',
    );
    assert.ok(deleteRoute?.handler, 'Missing Degree Navigator delete route handler');

    const calls: {
      table?: string;
      deleteOptions?: unknown;
      column?: string;
      userId?: string;
    } = {};

    setAuthTokenVerifier(async (token) => {
      assert.strictEqual(token, 'test_token');
      return {
        userId: TEST_USER_ID,
        email: 'student@example.com',
      };
    });
    setDegreeNavigatorProfileSupabaseClientFactoryForTest(() =>
      createDeleteClient({
        count: 1,
        calls,
      }) as never,
    );

    try {
      const response = await deleteRoute.handler({
        req: withAuthReq({}),
        json: jsonResponder,
      } as never);

      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(await response.json(), { cleared: true });
      assert.strictEqual(calls.table, 'degree_navigator_profiles');
      assert.deepStrictEqual(calls.deleteOptions, { count: 'exact' });
      assert.strictEqual(calls.column, 'user_id');
      assert.strictEqual(calls.userId, TEST_USER_ID);
    } finally {
      setAuthTokenVerifier(null);
      setDegreeNavigatorProfileSupabaseClientFactoryForTest(null);
    }
  });

  it('treats clearing a missing profile as a successful idempotent request', async () => {
    const deleteRoute = apiRoutes.find(
      (route) => route.path === '/degree-navigator/profile' && route.method === 'DELETE',
    );
    assert.ok(deleteRoute?.handler, 'Missing Degree Navigator delete route handler');

    setAuthTokenVerifier(async () => ({
      userId: TEST_USER_ID,
    }));
    setDegreeNavigatorProfileSupabaseClientFactoryForTest(() =>
      createDeleteClient({
        count: 0,
        calls: {},
      }) as never,
    );

    try {
      const response = await deleteRoute.handler({
        req: withAuthReq({}),
        json: jsonResponder,
      } as never);

      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(await response.json(), { cleared: false });
    } finally {
      setAuthTokenVerifier(null);
      setDegreeNavigatorProfileSupabaseClientFactoryForTest(null);
    }
  });
});
