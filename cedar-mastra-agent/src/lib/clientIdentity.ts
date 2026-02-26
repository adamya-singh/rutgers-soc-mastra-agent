export interface ClientIdentity {
  userId: string;
  threadId: string;
  browserClientId: string;
}

const USER_KEY = 'cedar_user_id';
const THREAD_KEY = 'cedar_thread_id';
const BROWSER_CLIENT_KEY = 'browser_client_id';

function randomId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  const fallback = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  return `${prefix}_${fallback}`;
}

function getOrCreateLocalStorageId(storageKey: string, prefix: string): string {
  const existing = window.localStorage.getItem(storageKey);
  if (existing && existing.trim().length > 0) {
    return existing;
  }

  const created = randomId(prefix);
  window.localStorage.setItem(storageKey, created);
  return created;
}

export function getClientIdentity(): ClientIdentity {
  if (typeof window === 'undefined') {
    return {
      userId: 'anon_server_render',
      threadId: 'thread_server_render',
      browserClientId: 'browser_server_render',
    };
  }

  return {
    userId: getOrCreateLocalStorageId(USER_KEY, 'anon'),
    threadId: getOrCreateLocalStorageId(THREAD_KEY, 'thread'),
    browserClientId: getOrCreateLocalStorageId(BROWSER_CLIENT_KEY, 'browser'),
  };
}
