export type BrowserTarget = 'degree_navigator';

export type BrowserSessionStatus =
  | 'created'
  | 'awaiting_login'
  | 'ready'
  | 'error'
  | 'closed';

export type BrowserSessionErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_OWNERSHIP_MISMATCH'
  | 'SESSION_EXPIRED'
  | 'SESSION_CLOSE_IN_PROGRESS'
  | 'BROWSER_PROVIDER_ERROR'
  | 'MISSING_BROWSER_CLIENT_ID'
  | 'INVALID_BROWSER_TARGET';

export type BrowserSessionCloseReason =
  | 'manual_stop'
  | 'pagehide'
  | 'beforeunload'
  | 'hidden_timeout'
  | 'idle_timeout'
  | 'startup_cleanup'
  | 'reaper';

export interface BrowserSessionState {
  provider: 'browserbase';
  sessionId: string;
  liveViewUrl: string;
  target: BrowserTarget;
  status: BrowserSessionStatus;
  ownerId: string;
  createdAt: string;
  lastHeartbeatAt: string;
}

export class BrowserSessionError extends Error {
  readonly code: BrowserSessionErrorCode;

  constructor(code: BrowserSessionErrorCode, message: string) {
    super(message);
    this.name = 'BrowserSessionError';
    this.code = code;
  }
}
