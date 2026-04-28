import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  extractBrowserSessionIdFromAdditionalContext,
  requireBrowserSessionIdFromRuntime,
} from '../browser/runtimeContext.js';

describe('browser runtime context', () => {
  it('extracts browser session id from subscribed browserSession context', () => {
    const sessionId = extractBrowserSessionIdFromAdditionalContext({
      browserSession: {
        data: {
          browserSession: {
            sessionId: 'session_visible_1',
            status: 'awaiting_login',
          },
        },
      },
    });

    assert.strictEqual(sessionId, 'session_visible_1');
  });

  it('prefers explicit session id over browserSession context', () => {
    const sessionId = requireBrowserSessionIdFromRuntime(
      {
        get: (key: string) =>
          key === 'additionalContext'
            ? {
                browserSession: {
                  data: {
                    browserSession: {
                      sessionId: 'session_context_1',
                    },
                  },
                },
              }
            : undefined,
      },
      'session_explicit_1',
    );

    assert.strictEqual(sessionId, 'session_explicit_1');
  });
});
