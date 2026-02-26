import {
  BrowserSessionError,
  BrowserSessionState,
} from './types.js';

const DEFAULT_TTL_MS = 60 * 1000;

interface SessionStoreOptions {
  ttlMs?: number;
  now?: () => number;
}

class BrowserSessionStore {
  private readonly sessions = new Map<string, BrowserSessionState>();
  private readonly closingSessions = new Set<string>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: SessionStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  create(input: Omit<BrowserSessionState, 'createdAt' | 'lastHeartbeatAt'>): BrowserSessionState {
    const timestamp = new Date(this.now()).toISOString();
    const session: BrowserSessionState = {
      ...input,
      createdAt: timestamp,
      lastHeartbeatAt: timestamp,
    };

    this.sessions.set(session.sessionId, session);
    return session;
  }

  getOwned(sessionId: string, ownerId: string, touch = true): BrowserSessionState {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new BrowserSessionError('SESSION_NOT_FOUND', `Session ${sessionId} was not found.`);
    }

    if (session.ownerId !== ownerId) {
      throw new BrowserSessionError(
        'SESSION_OWNERSHIP_MISMATCH',
        `Session ${sessionId} does not belong to this browser client.`,
      );
    }

    if (this.isExpired(session)) {
      this.sessions.delete(sessionId);
      throw new BrowserSessionError('SESSION_EXPIRED', `Session ${sessionId} has expired.`);
    }

    if (touch) {
      return this.touch(sessionId, ownerId);
    }

    return session;
  }

  touch(sessionId: string, ownerId: string, status?: BrowserSessionState['status']): BrowserSessionState {
    const existing = this.getOwned(sessionId, ownerId, false);
    const next: BrowserSessionState = {
      ...existing,
      status: status ?? existing.status,
      lastHeartbeatAt: new Date(this.now()).toISOString(),
    };

    this.sessions.set(sessionId, next);
    return next;
  }

  updateStatus(
    sessionId: string,
    ownerId: string,
    status: BrowserSessionState['status'],
  ): BrowserSessionState {
    return this.touch(sessionId, ownerId, status);
  }

  close(sessionId: string, ownerId: string): BrowserSessionState {
    const existing = this.getOwned(sessionId, ownerId, false);
    const closed: BrowserSessionState = {
      ...existing,
      status: 'closed',
      lastHeartbeatAt: new Date(this.now()).toISOString(),
    };

    this.sessions.delete(sessionId);
    return closed;
  }

  get(sessionId: string): BrowserSessionState | null {
    return this.sessions.get(sessionId) ?? null;
  }

  listSessions(): BrowserSessionState[] {
    return [...this.sessions.values()];
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  markClosing(sessionId: string): void {
    if (this.closingSessions.has(sessionId)) {
      throw new BrowserSessionError(
        'SESSION_CLOSE_IN_PROGRESS',
        `Session ${sessionId} is already being closed.`,
      );
    }

    this.closingSessions.add(sessionId);
  }

  unmarkClosing(sessionId: string): void {
    this.closingSessions.delete(sessionId);
  }

  isClosing(sessionId: string): boolean {
    return this.closingSessions.has(sessionId);
  }

  getExpired(nowMs: number, cutoffMs: number): BrowserSessionState[] {
    return this.listSessions().filter((session) => {
      return (nowMs - new Date(session.lastHeartbeatAt).getTime()) > cutoffMs;
    });
  }

  private isExpired(session: BrowserSessionState): boolean {
    return this.now() - new Date(session.lastHeartbeatAt).getTime() > this.ttlMs;
  }

  clear(): void {
    this.sessions.clear();
    this.closingSessions.clear();
  }
}

export const browserSessionStore = new BrowserSessionStore();

export function createBrowserSessionStore(options: SessionStoreOptions = {}) {
  return new BrowserSessionStore(options);
}
