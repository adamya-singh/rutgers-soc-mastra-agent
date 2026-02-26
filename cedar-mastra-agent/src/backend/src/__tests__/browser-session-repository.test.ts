import assert from 'node:assert';
import { describe, it } from 'node:test';

import { createInMemoryBrowserSessionRepository } from '../browser/sessionRepository.js';
import { BrowserSessionError } from '../browser/types.js';

describe('browser session repository', () => {
  it('supports create, touch, and getOwned lifecycle', async () => {
    const repository = createInMemoryBrowserSessionRepository();

    const created = await repository.create({
      provider: 'browserbase',
      sessionId: 'session_repo_1',
      liveViewUrl: 'https://example.com/live',
      target: 'degree_navigator',
      status: 'awaiting_login',
      ownerId: 'owner_repo_1',
    });

    assert.strictEqual(created.sessionId, 'session_repo_1');

    const touched = await repository.touch('session_repo_1', 'owner_repo_1', 'ready');
    assert.strictEqual(touched.status, 'ready');

    const owned = await repository.getOwned('session_repo_1', 'owner_repo_1');
    assert.strictEqual(owned.ownerId, 'owner_repo_1');
  });

  it('enforces ownership checks', async () => {
    const repository = createInMemoryBrowserSessionRepository();

    await repository.create({
      provider: 'browserbase',
      sessionId: 'session_repo_2',
      liveViewUrl: 'https://example.com/live',
      target: 'degree_navigator',
      status: 'ready',
      ownerId: 'owner_repo_2',
    });

    await assert.rejects(
      repository.getOwned('session_repo_2', 'owner_wrong'),
      (error: unknown) => {
        return error instanceof BrowserSessionError && error.code === 'SESSION_OWNERSHIP_MISMATCH';
      },
    );
  });

  it('supports markClosing close-in-progress behavior', async () => {
    const repository = createInMemoryBrowserSessionRepository();

    await repository.create({
      provider: 'browserbase',
      sessionId: 'session_repo_3',
      liveViewUrl: 'https://example.com/live',
      target: 'degree_navigator',
      status: 'ready',
      ownerId: 'owner_repo_3',
    });

    await repository.markClosing('session_repo_3', 'owner_repo_3', 'manual_stop');

    await assert.rejects(
      repository.markClosing('session_repo_3', 'owner_repo_3', 'manual_stop'),
      (error: unknown) => {
        return error instanceof BrowserSessionError && error.code === 'SESSION_CLOSE_IN_PROGRESS';
      },
    );

    await repository.unmarkClosing('session_repo_3');

    await repository.markClosed('session_repo_3', {
      reason: 'manual_stop',
      terminationMethod: 'delete',
      terminationVerified: true,
      providerStillRunning: false,
    });

    const closed = await repository.get('session_repo_3');
    assert.strictEqual(closed?.status, 'closed');
  });
});
