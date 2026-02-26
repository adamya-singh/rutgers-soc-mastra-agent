import assert from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  closeSessionWithPolicy,
  resetBrowserSessionRepository,
  runBrowserSessionReaperTick,
  setBrowserSessionRepository,
  terminateProviderSession,
} from '../browser/browserService.js';
import { BrowserSessionRepository, createInMemoryBrowserSessionRepository } from '../browser/sessionRepository.js';
import { BrowserSessionError } from '../browser/types.js';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY;
const ORIGINAL_BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID;
let repository: BrowserSessionRepository;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

describe('browserService close policy', () => {
  beforeEach(() => {
    repository = createInMemoryBrowserSessionRepository();
    setBrowserSessionRepository(repository);
    process.env.BROWSERBASE_API_KEY = 'test_api_key';
    process.env.BROWSERBASE_PROJECT_ID = 'test_project_id';
  });

  afterEach(() => {
    resetBrowserSessionRepository();
    globalThis.fetch = ORIGINAL_FETCH;
    process.env.BROWSERBASE_API_KEY = ORIGINAL_BROWSERBASE_API_KEY;
    process.env.BROWSERBASE_PROJECT_ID = ORIGINAL_BROWSERBASE_PROJECT_ID;
  });

  it('terminateProviderSession supports DELETE success', async () => {
    globalThis.fetch = (async () => {
      return jsonResponse(200, { ok: true });
    }) as typeof fetch;

    const result = await terminateProviderSession('session_delete_success');

    assert.strictEqual(result.terminated, true);
    assert.strictEqual(result.method, 'delete');
    assert.strictEqual(result.terminationVerified, true);
    assert.strictEqual(result.providerStillRunning, false);
  });

  it('terminateProviderSession falls back to POST /terminate', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input) => {
      calls.push(String(input));
      if (calls.length === 1) {
        return jsonResponse(404, { statusCode: 404 });
      }
      return jsonResponse(200, { ok: true });
    }) as typeof fetch;

    const result = await terminateProviderSession('session_terminate_fallback');

    assert.strictEqual(result.terminated, true);
    assert.strictEqual(result.method, 'terminate_post');
    assert.strictEqual(calls.length, 2);
  });

  it('terminateProviderSession marks session closed when verification returns 404', async () => {
    globalThis.fetch = (async () => {
      return jsonResponse(404, { statusCode: 404 });
    }) as typeof fetch;

    const result = await terminateProviderSession('session_verify_404');

    assert.strictEqual(result.terminated, true);
    assert.strictEqual(result.method, 'verified_closed_not_found');
    assert.strictEqual(result.terminationVerified, true);
    assert.strictEqual(result.providerStillRunning, false);
  });

  it('terminateProviderSession reports still running when verify says active', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input) => {
      calls.push(String(input));
      if (calls.length < 3) {
        return jsonResponse(404, { statusCode: 404 });
      }
      return jsonResponse(200, { status: 'running' });
    }) as typeof fetch;

    const result = await terminateProviderSession('session_verify_running');

    assert.strictEqual(result.terminated, false);
    assert.strictEqual(result.method, 'still_running');
    assert.strictEqual(result.terminationVerified, true);
    assert.strictEqual(result.providerStillRunning, true);
    assert.strictEqual(calls.length, 3);
  });

  it('closes an owned tracked session when provider termination succeeds', async () => {
    await repository.create({
      provider: 'browserbase',
      sessionId: 'session_owned_1',
      liveViewUrl: 'https://example.com/live',
      target: 'degree_navigator',
      status: 'ready',
      ownerId: 'owner_1',
    });

    globalThis.fetch = (async () => {
      return jsonResponse(200, { ok: true });
    }) as typeof fetch;

    const result = await closeSessionWithPolicy({
      sessionId: 'session_owned_1',
      ownerId: 'owner_1',
      reason: 'manual_stop',
      allowUntracked: false,
    });

    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.terminated, true);
    assert.strictEqual(result.session?.status, 'closed');
    const session = await repository.get('session_owned_1');
    assert.strictEqual(session?.status, 'closed');
  });

  it('keeps tracked session when provider termination does not complete', async () => {
    await repository.create({
      provider: 'browserbase',
      sessionId: 'session_owned_2',
      liveViewUrl: 'https://example.com/live',
      target: 'degree_navigator',
      status: 'ready',
      ownerId: 'owner_2',
    });

    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount += 1;
      if (callCount < 3) {
        return jsonResponse(404, { statusCode: 404 });
      }
      return jsonResponse(200, { status: 'running' });
    }) as typeof fetch;

    const result = await closeSessionWithPolicy({
      sessionId: 'session_owned_2',
      ownerId: 'owner_2',
      reason: 'manual_stop',
      allowUntracked: false,
    });

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.terminated, false);
    assert.strictEqual(result.terminationMethod, 'still_running');
    assert.ok(await repository.get('session_owned_2'));
  });

  it('attempts provider close for untracked sessions even when allowUntracked is false', async () => {
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return jsonResponse(200, { ok: true });
    }) as typeof fetch;

    const result = await closeSessionWithPolicy({
      sessionId: 'session_missing',
      ownerId: 'owner_missing',
      reason: 'manual_stop',
      allowUntracked: false,
    });

    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.terminated, true);
    assert.strictEqual(result.session, null);
    assert.strictEqual(fetchCalls, 1);
  });

  it('returns terminated=false for untracked sessions still running with allowUntracked=true', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input) => {
      calls.push(String(input));
      if (calls.length < 3) {
        return jsonResponse(404, { statusCode: 404 });
      }
      return jsonResponse(200, { status: 'running' });
    }) as typeof fetch;

    const result = await closeSessionWithPolicy({
      sessionId: 'session_untracked_1',
      ownerId: 'owner_1',
      reason: 'startup_cleanup',
      allowUntracked: true,
    });

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.terminated, false);
    assert.strictEqual(result.terminationMethod, 'still_running');
    assert.strictEqual(result.session, null);
    assert.strictEqual(calls.length, 3);
  });

  it('returns idempotent success when a close is already in progress', async () => {
    await repository.create({
      provider: 'browserbase',
      sessionId: 'session_in_flight_1',
      liveViewUrl: 'https://example.com/live',
      target: 'degree_navigator',
      status: 'ready',
      ownerId: 'owner_1',
    });
    await repository.markClosing('session_in_flight_1', 'owner_1', 'manual_stop');

    const result = await closeSessionWithPolicy({
      sessionId: 'session_in_flight_1',
      ownerId: 'owner_1',
      reason: 'manual_stop',
      allowUntracked: true,
    });

    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.terminated, false);
    assert.strictEqual(result.terminationMethod, 'in_progress');
  });

  it('reaper closes stale tracked sessions', async () => {
    const session = await repository.create({
      provider: 'browserbase',
      sessionId: 'session_stale_1',
      liveViewUrl: 'https://example.com/live',
      target: 'degree_navigator',
      status: 'ready',
      ownerId: 'owner_stale',
    });

    globalThis.fetch = (async () => {
      return jsonResponse(200, { ok: true });
    }) as typeof fetch;

    const nowMs = new Date(session.lastHeartbeatAt).getTime() + 60_001;
    const closedCount = await runBrowserSessionReaperTick(nowMs);

    assert.strictEqual(closedCount, 1);
    const closedSession = await repository.get('session_stale_1');
    assert.strictEqual(closedSession?.status, 'closed');
  });
});
