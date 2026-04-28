import { BrowserSessionError } from './types.js';

const CONFIRMATION_TTL_MS = 5 * 60 * 1000;

type ConfirmationRecord = {
  userId: string;
  sessionId: string;
  action: string;
  expiresAtMs: number;
};

const confirmations = new Map<string, ConfirmationRecord>();

function randomToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function createActionConfirmation(input: {
  userId: string;
  sessionId: string;
  action: string;
  nowMs?: number;
}): { token: string; expiresAt: string } {
  const nowMs = input.nowMs ?? Date.now();
  const token = randomToken();
  const expiresAtMs = nowMs + CONFIRMATION_TTL_MS;

  confirmations.set(token, {
    userId: input.userId,
    sessionId: input.sessionId,
    action: input.action,
    expiresAtMs,
  });

  return {
    token,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export function consumeActionConfirmation(input: {
  token: string;
  userId: string;
  sessionId: string;
  action: string;
  nowMs?: number;
}): void {
  const record = confirmations.get(input.token);
  confirmations.delete(input.token);

  if (!record) {
    throw new BrowserSessionError('BROWSER_PROVIDER_ERROR', 'Confirmation token was not found or already used.');
  }

  const nowMs = input.nowMs ?? Date.now();
  if (record.expiresAtMs < nowMs) {
    throw new BrowserSessionError('BROWSER_PROVIDER_ERROR', 'Confirmation token has expired.');
  }

  if (
    record.userId !== input.userId ||
    record.sessionId !== input.sessionId ||
    record.action !== input.action
  ) {
    throw new BrowserSessionError('BROWSER_PROVIDER_ERROR', 'Confirmation token does not match this action.');
  }
}
