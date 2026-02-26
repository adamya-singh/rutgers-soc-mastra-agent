import { describe, it } from 'node:test';
import assert from 'node:assert';

import { createBrowserSessionStore } from '../browser/sessionStore.js';
import { BrowserSessionError } from '../browser/types.js';

describe('browserSessionStore', () => {
  it('supports create, touch, and close lifecycle', () => {
    const store = createBrowserSessionStore();

    const session = store.create({
      provider: 'browserbase',
      sessionId: 'session_1',
      liveViewUrl: 'https://example.com/live',
      target: 'degree_navigator',
      status: 'awaiting_login',
      ownerId: 'owner_1',
    });

    assert.strictEqual(session.sessionId, 'session_1');

    const touched = store.touch('session_1', 'owner_1', 'ready');
    assert.strictEqual(touched.status, 'ready');

    const closed = store.close('session_1', 'owner_1');
    assert.strictEqual(closed.status, 'closed');

    assert.throws(() => store.getOwned('session_1', 'owner_1'), (error: unknown) => {
      return error instanceof BrowserSessionError && error.code === 'SESSION_NOT_FOUND';
    });
  });

  it('enforces ownership and expiry', () => {
    let now = Date.now();
    const store = createBrowserSessionStore({
      ttlMs: 100,
      now: () => now,
    });

    store.create({
      provider: 'browserbase',
      sessionId: 'session_2',
      liveViewUrl: 'https://example.com/live',
      target: 'degree_navigator',
      status: 'awaiting_login',
      ownerId: 'owner_2',
    });

    assert.throws(() => store.getOwned('session_2', 'owner_wrong'), (error: unknown) => {
      return error instanceof BrowserSessionError && error.code === 'SESSION_OWNERSHIP_MISMATCH';
    });

    now += 200;
    assert.throws(() => store.getOwned('session_2', 'owner_2'), (error: unknown) => {
      return error instanceof BrowserSessionError && error.code === 'SESSION_EXPIRED';
    });
  });

  it('supports listing, deleting, and close-in-flight guards', () => {
    const store = createBrowserSessionStore();

    store.create({
      provider: 'browserbase',
      sessionId: 'session_3',
      liveViewUrl: 'https://example.com/live',
      target: 'degree_navigator',
      status: 'awaiting_login',
      ownerId: 'owner_3',
    });

    assert.strictEqual(store.listSessions().length, 1);
    assert.strictEqual(store.isClosing('session_3'), false);

    store.markClosing('session_3');
    assert.strictEqual(store.isClosing('session_3'), true);

    assert.throws(() => store.markClosing('session_3'), (error: unknown) => {
      return error instanceof BrowserSessionError && error.code === 'SESSION_CLOSE_IN_PROGRESS';
    });

    store.unmarkClosing('session_3');
    assert.strictEqual(store.isClosing('session_3'), false);

    store.deleteSession('session_3');
    assert.strictEqual(store.listSessions().length, 0);
  });

  it('returns sessions past a stale heartbeat cutoff', () => {
    const nowMs = Date.now();
    const store = createBrowserSessionStore({
      now: () => nowMs,
    });

    const session = store.create({
      provider: 'browserbase',
      sessionId: 'session_4',
      liveViewUrl: 'https://example.com/live',
      target: 'degree_navigator',
      status: 'ready',
      ownerId: 'owner_4',
    });

    const expiredAtPlusOneMs = new Date(session.lastHeartbeatAt).getTime() + 60_001;
    const expired = store.getExpired(expiredAtPlusOneMs, 60_000);
    assert.strictEqual(expired.length, 1);
    assert.strictEqual(expired[0]?.sessionId, 'session_4');
  });
});
