import { describe, it } from 'node:test';
import assert from 'node:assert';

import { browserAct } from '../mastra/tools/browser/browser-act.js';

describe('browserAct confirmation guard', () => {
  it('returns needsConfirmation for sensitive actions without token', async () => {
    const result = await browserAct.execute?.({
      context: {
        sessionId: 'session_123',
        action: 'submit degree audit request',
      },
      runtimeContext: {
        get: (key: string) => (key === 'authenticatedUserId' ? 'user_123' : undefined),
      },
    } as never);

    assert.ok(result);
    assert.strictEqual(result?.success, false);
    assert.strictEqual(result?.needsConfirmation, true);
    assert.strictEqual(result?.confirmationRequiredFor, 'submit degree audit request');
    assert.strictEqual(typeof result?.confirmationToken, 'string');
  });
});
