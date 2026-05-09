import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert';

import {
  ANONYMOUS_CHAT_AUTH_SCHEME,
  ANONYMOUS_CHAT_TOKEN_HEADER,
  AuthError,
  createAnonymousChatToken,
  resolveChatPrincipal,
  setAnonymousChatTokenSecretForTest,
} from '../auth/supabaseAuth.js';

const ANONYMOUS_CLIENT_ID = '22222222-2222-4222-8222-222222222222';

describe('anonymous chat auth', () => {
  afterEach(() => {
    setAnonymousChatTokenSecretForTest(null);
  });

  it('resolves a signed anonymous chat token into an anonymous principal', async () => {
    setAnonymousChatTokenSecretForTest('test-anonymous-secret');
    const { token } = createAnonymousChatToken(ANONYMOUS_CLIENT_ID);

    const principal = await resolveChatPrincipal({
      req: {
        header: (name) => (name === ANONYMOUS_CHAT_TOKEN_HEADER ? token : undefined),
      },
    });

    assert.deepStrictEqual(principal, {
      type: 'anonymous',
      anonymousClientId: ANONYMOUS_CLIENT_ID,
    });
  });

  it('resolves anonymous chat tokens from the Authorization header', async () => {
    setAnonymousChatTokenSecretForTest('test-anonymous-secret');
    const { token } = createAnonymousChatToken(ANONYMOUS_CLIENT_ID);

    const principal = await resolveChatPrincipal({
      req: {
        header: (name) =>
          name.toLowerCase() === 'authorization'
            ? `${ANONYMOUS_CHAT_AUTH_SCHEME} ${token}`
            : undefined,
      },
    });

    assert.deepStrictEqual(principal, {
      type: 'anonymous',
      anonymousClientId: ANONYMOUS_CLIENT_ID,
    });
  });

  it('rejects forged anonymous chat tokens', async () => {
    setAnonymousChatTokenSecretForTest('test-anonymous-secret');
    const { token } = createAnonymousChatToken(ANONYMOUS_CLIENT_ID);
    const forgedToken = token.replace(/\.[^.]+$/, '.forged');

    await assert.rejects(
      () =>
        resolveChatPrincipal({
          req: {
            header: (name) =>
              name === ANONYMOUS_CHAT_TOKEN_HEADER ? forgedToken : undefined,
          },
        }),
      AuthError,
    );
  });
});
