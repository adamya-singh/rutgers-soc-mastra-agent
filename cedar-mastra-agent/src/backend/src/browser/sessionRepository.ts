import { getSupabaseServiceClient } from '../lib/supabase.js';
import {
  BrowserSessionCloseReason,
  BrowserSessionError,
  BrowserSessionState,
} from './types.js';

const DEFAULT_TTL_MS = 60 * 1000;

interface SessionRepositoryOptions {
  ttlMs?: number;
  now?: () => number;
}

type BrowserSessionRow = {
  provider: string;
  session_id: string;
  live_view_url: string;
  target: string;
  status: BrowserSessionState['status'];
  owner_id: string;
  user_id: string | null;
  created_at: string;
  last_heartbeat_at: string;
  closing_started_at: string | null;
  close_reason: BrowserSessionCloseReason | null;
  termination_method: string | null;
  termination_verified: boolean | null;
  provider_still_running: boolean | null;
  updated_at: string;
};

export interface MarkClosedMetadata {
  reason?: BrowserSessionCloseReason;
  terminationMethod?: string;
  terminationVerified?: boolean;
  providerStillRunning?: boolean;
}

export interface BrowserSessionRepository {
  assertReady?(): Promise<void>;
  create(input: Omit<BrowserSessionState, 'createdAt' | 'lastHeartbeatAt'>): Promise<BrowserSessionState>;
  getOwned(sessionId: string, ownerId: string): Promise<BrowserSessionState>;
  get(sessionId: string): Promise<BrowserSessionState | null>;
  touch(sessionId: string, ownerId: string, status?: BrowserSessionState['status']): Promise<BrowserSessionState>;
  updateStatus(
    sessionId: string,
    ownerId: string,
    status: BrowserSessionState['status'],
  ): Promise<BrowserSessionState>;
  listExpired(nowMs: number, cutoffMs: number): Promise<BrowserSessionState[]>;
  markClosing(sessionId: string, ownerId: string, reason?: BrowserSessionCloseReason): Promise<void>;
  unmarkClosing(sessionId: string): Promise<void>;
  markClosed(sessionId: string, metadata?: MarkClosedMetadata): Promise<BrowserSessionState | null>;
  deleteSession(sessionId: string): Promise<void>;
}

function mapRowToSession(row: BrowserSessionRow): BrowserSessionState {
  return {
    provider: 'browserbase',
    sessionId: row.session_id,
    liveViewUrl: row.live_view_url,
    target: row.target as BrowserSessionState['target'],
    status: row.status,
    ownerId: row.user_id ?? row.owner_id,
    createdAt: row.created_at,
    lastHeartbeatAt: row.last_heartbeat_at,
  };
}

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const candidate = (error as { code?: unknown }).code;
  return typeof candidate === 'string' ? candidate : null;
}

async function fetchBySessionId(sessionId: string): Promise<BrowserSessionRow | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('browser_sessions')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) {
    throw new BrowserSessionError('BROWSER_PROVIDER_ERROR', `Failed to read browser session: ${error.message}`);
  }

  return (data as BrowserSessionRow | null) ?? null;
}

export function createSupabaseBrowserSessionRepository(
  options: SessionRepositoryOptions = {},
): BrowserSessionRepository {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

  async function getOwned(sessionId: string, ownerId: string): Promise<BrowserSessionState> {
    const row = await fetchBySessionId(sessionId);

    if (!row) {
      throw new BrowserSessionError('SESSION_NOT_FOUND', `Session ${sessionId} was not found.`);
    }

    if ((row.user_id ?? row.owner_id) !== ownerId) {
      throw new BrowserSessionError(
        'SESSION_OWNERSHIP_MISMATCH',
        `Session ${sessionId} does not belong to this browser client.`,
      );
    }

    if (now() - new Date(row.last_heartbeat_at).getTime() > ttlMs) {
      const supabase = getSupabaseServiceClient();
      await supabase.from('browser_sessions').delete().eq('session_id', sessionId);
      throw new BrowserSessionError('SESSION_EXPIRED', `Session ${sessionId} has expired.`);
    }

    return mapRowToSession(row);
  }

  async function touch(
    sessionId: string,
    ownerId: string,
    status?: BrowserSessionState['status'],
  ): Promise<BrowserSessionState> {
    const existing = await getOwned(sessionId, ownerId);
    const timestamp = new Date(now()).toISOString();
    const supabase = getSupabaseServiceClient();

    const { data, error } = await supabase
      .from('browser_sessions')
      .update({
        status: status ?? existing.status,
        last_heartbeat_at: timestamp,
        updated_at: timestamp,
      })
      .eq('session_id', sessionId)
      .eq('user_id', ownerId)
      .select('*')
      .single();

    if (error) {
      throw new BrowserSessionError('BROWSER_PROVIDER_ERROR', `Failed to touch browser session: ${error.message}`);
    }

    return mapRowToSession(data as BrowserSessionRow);
  }

  return {
    async assertReady() {
      const supabase = getSupabaseServiceClient();
      const { error } = await supabase
        .from('browser_sessions')
        .select('session_id')
        .limit(1);

      if (error) {
        throw new BrowserSessionError(
          'BROWSER_PROVIDER_ERROR',
          `Browser session repository is not writable with the configured Supabase service key: ${error.message}`,
        );
      }
    },

    async create(input) {
      const timestamp = new Date(now()).toISOString();
      const supabase = getSupabaseServiceClient();
      const { data, error } = await supabase
        .from('browser_sessions')
        .upsert(
          {
            provider: input.provider,
            session_id: input.sessionId,
            live_view_url: input.liveViewUrl,
            target: input.target,
            status: input.status,
            owner_id: input.ownerId,
            user_id: input.ownerId,
            created_at: timestamp,
            last_heartbeat_at: timestamp,
            closing_started_at: null,
            updated_at: timestamp,
          },
          {
            onConflict: 'session_id',
          },
        )
        .select('*')
        .single();

      if (error) {
        throw new BrowserSessionError('BROWSER_PROVIDER_ERROR', `Failed to create browser session: ${error.message}`);
      }

      return mapRowToSession(data as BrowserSessionRow);
    },

    getOwned,

    async get(sessionId) {
      const row = await fetchBySessionId(sessionId);
      return row ? mapRowToSession(row) : null;
    },

    touch,

    async updateStatus(sessionId, ownerId, status) {
      return touch(sessionId, ownerId, status);
    },

    async listExpired(nowMs, cutoffMs) {
      const cutoffIso = new Date(nowMs - cutoffMs).toISOString();
      const supabase = getSupabaseServiceClient();
      const { data, error } = await supabase
        .from('browser_sessions')
        .select('*')
        .lt('last_heartbeat_at', cutoffIso)
        .neq('status', 'closed');

      if (error) {
        throw new BrowserSessionError('BROWSER_PROVIDER_ERROR', `Failed to read stale browser sessions: ${error.message}`);
      }

      return (data as BrowserSessionRow[]).map(mapRowToSession);
    },

    async markClosing(sessionId, ownerId, reason) {
      const timestamp = new Date(now()).toISOString();
      const supabase = getSupabaseServiceClient();

      const { data, error } = await supabase
        .from('browser_sessions')
        .update({
          closing_started_at: timestamp,
          close_reason: reason ?? null,
          updated_at: timestamp,
        })
        .eq('session_id', sessionId)
        .eq('user_id', ownerId)
        .is('closing_started_at', null)
        .neq('status', 'closed')
        .select('*')
        .maybeSingle();

      if (!error && data) {
        return;
      }

      const errorCode = getErrorCode(error);
      if (error && errorCode !== 'PGRST116') {
        throw new BrowserSessionError('BROWSER_PROVIDER_ERROR', `Failed to mark browser session closing: ${error.message}`);
      }

      const row = await fetchBySessionId(sessionId);
      if (!row) {
        throw new BrowserSessionError('SESSION_NOT_FOUND', `Session ${sessionId} was not found.`);
      }

      if ((row.user_id ?? row.owner_id) !== ownerId) {
        throw new BrowserSessionError(
          'SESSION_OWNERSHIP_MISMATCH',
          `Session ${sessionId} does not belong to this browser client.`,
        );
      }

      if (row.closing_started_at) {
        throw new BrowserSessionError(
          'SESSION_CLOSE_IN_PROGRESS',
          `Session ${sessionId} is already being closed.`,
        );
      }

      if (row.status === 'closed') {
        throw new BrowserSessionError('SESSION_NOT_FOUND', `Session ${sessionId} was not found.`);
      }

      throw new BrowserSessionError(
        'BROWSER_PROVIDER_ERROR',
        `Failed to mark browser session ${sessionId} as closing.`,
      );
    },

    async unmarkClosing(sessionId) {
      const timestamp = new Date(now()).toISOString();
      const supabase = getSupabaseServiceClient();
      const { error } = await supabase
        .from('browser_sessions')
        .update({
          closing_started_at: null,
          updated_at: timestamp,
        })
        .eq('session_id', sessionId);

      if (error) {
        throw new BrowserSessionError('BROWSER_PROVIDER_ERROR', `Failed to clear closing lock: ${error.message}`);
      }
    },

    async markClosed(sessionId, metadata = {}) {
      const timestamp = new Date(now()).toISOString();
      const supabase = getSupabaseServiceClient();

      const { data, error } = await supabase
        .from('browser_sessions')
        .update({
          status: 'closed',
          last_heartbeat_at: timestamp,
          closing_started_at: null,
          close_reason: metadata.reason ?? null,
          termination_method: metadata.terminationMethod ?? null,
          termination_verified: metadata.terminationVerified ?? null,
          provider_still_running: metadata.providerStillRunning ?? null,
          updated_at: timestamp,
        })
        .eq('session_id', sessionId)
        .select('*')
        .maybeSingle();

      if (error) {
        const errorCode = getErrorCode(error);
        if (errorCode === 'PGRST116') {
          return null;
        }

        throw new BrowserSessionError('BROWSER_PROVIDER_ERROR', `Failed to mark browser session closed: ${error.message}`);
      }

      return data ? mapRowToSession(data as BrowserSessionRow) : null;
    },

    async deleteSession(sessionId) {
      const supabase = getSupabaseServiceClient();
      const { error } = await supabase.from('browser_sessions').delete().eq('session_id', sessionId);

      if (error) {
        throw new BrowserSessionError('BROWSER_PROVIDER_ERROR', `Failed to delete browser session: ${error.message}`);
      }
    },
  };
}

export function createInMemoryBrowserSessionRepository(
  options: SessionRepositoryOptions = {},
): BrowserSessionRepository {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const sessions = new Map<string, BrowserSessionState>();
  const closingSessions = new Set<string>();

  function assertOwned(sessionId: string, ownerId: string): BrowserSessionState {
    const session = sessions.get(sessionId);

    if (!session) {
      throw new BrowserSessionError('SESSION_NOT_FOUND', `Session ${sessionId} was not found.`);
    }

    if (session.ownerId !== ownerId) {
      throw new BrowserSessionError(
        'SESSION_OWNERSHIP_MISMATCH',
        `Session ${sessionId} does not belong to this browser client.`,
      );
    }

    if (now() - new Date(session.lastHeartbeatAt).getTime() > ttlMs) {
      sessions.delete(sessionId);
      throw new BrowserSessionError('SESSION_EXPIRED', `Session ${sessionId} has expired.`);
    }

    return session;
  }

  async function touchInMemory(
    sessionId: string,
    ownerId: string,
    status?: BrowserSessionState['status'],
  ): Promise<BrowserSessionState> {
    const existing = assertOwned(sessionId, ownerId);
    const next: BrowserSessionState = {
      ...existing,
      status: status ?? existing.status,
      lastHeartbeatAt: new Date(now()).toISOString(),
    };

    sessions.set(sessionId, next);
    return next;
  }

  return {
    async assertReady() {
      return undefined;
    },

    async create(input) {
      const timestamp = new Date(now()).toISOString();
      const session: BrowserSessionState = {
        ...input,
        createdAt: timestamp,
        lastHeartbeatAt: timestamp,
      };

      sessions.set(session.sessionId, session);
      return session;
    },

    async getOwned(sessionId, ownerId) {
      return assertOwned(sessionId, ownerId);
    },

    async get(sessionId) {
      return sessions.get(sessionId) ?? null;
    },

    touch: touchInMemory,

    async updateStatus(sessionId, ownerId, status) {
      return touchInMemory(sessionId, ownerId, status);
    },

    async listExpired(nowMs, cutoffMs) {
      return [...sessions.values()].filter((session) => {
        return (nowMs - new Date(session.lastHeartbeatAt).getTime()) > cutoffMs;
      });
    },

    async markClosing(sessionId, ownerId) {
      assertOwned(sessionId, ownerId);
      if (closingSessions.has(sessionId)) {
        throw new BrowserSessionError(
          'SESSION_CLOSE_IN_PROGRESS',
          `Session ${sessionId} is already being closed.`,
        );
      }

      closingSessions.add(sessionId);
    },

    async unmarkClosing(sessionId) {
      closingSessions.delete(sessionId);
    },

    async markClosed(sessionId, metadata = {}) {
      const existing = sessions.get(sessionId);
      if (!existing) {
        return null;
      }

      const closed: BrowserSessionState = {
        ...existing,
        status: 'closed',
        lastHeartbeatAt: new Date(now()).toISOString(),
      };
      sessions.set(sessionId, closed);
      closingSessions.delete(sessionId);

      void metadata;
      return closed;
    },

    async deleteSession(sessionId) {
      sessions.delete(sessionId);
      closingSessions.delete(sessionId);
    },
  };
}
