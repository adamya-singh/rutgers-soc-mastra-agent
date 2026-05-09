import { buildMastraApiUrl } from '@/lib/mastraConfig';
import type { ChatThread } from '@/lib/chatHistoryClient';

export const ANONYMOUS_CHAT_TOKEN_HEADER = 'X-Anonymous-Chat-Token';
export const ANONYMOUS_CHAT_AUTH_SCHEME = 'Anonymous';

const ANONYMOUS_CHAT_TOKEN_STORAGE_KEY = 'soc_anonymous_chat_token';

export interface AnonymousChatQuota {
  allowed: boolean;
  messageCount: number;
  dailyLimit: number;
  remaining: number;
  usageDate: string;
}

export interface AnonymousChatSession {
  token: string;
  anonymousClientId: string;
  thread: ChatThread;
  quota: AnonymousChatQuota;
}

export function getAnonymousChatToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(ANONYMOUS_CHAT_TOKEN_STORAGE_KEY);
}

export function buildAnonymousChatAuthorization(token: string): string {
  return `${ANONYMOUS_CHAT_AUTH_SCHEME} ${token}`;
}

function storeAnonymousChatToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(ANONYMOUS_CHAT_TOKEN_STORAGE_KEY, token);
}

function clearAnonymousChatToken(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(ANONYMOUS_CHAT_TOKEN_STORAGE_KEY);
}

async function requestAnonymousChatSession(token: string | null): Promise<Response> {
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', buildAnonymousChatAuthorization(token));
  }

  return fetch(buildMastraApiUrl('/chat/anonymous/session'), {
    method: 'POST',
    headers,
  });
}

async function parseAnonymousChatSession(response: Response): Promise<AnonymousChatSession> {
  const json = (await response.json()) as AnonymousChatSession & { error?: string };
  if (!response.ok) {
    throw new Error(json.error ?? `Anonymous chat session failed (${response.status})`);
  }

  storeAnonymousChatToken(json.token);
  return json;
}

export async function ensureAnonymousChatSession(): Promise<AnonymousChatSession> {
  const existingToken = getAnonymousChatToken();
  const response = await requestAnonymousChatSession(existingToken);

  if (response.ok || !existingToken) {
    return parseAnonymousChatSession(response);
  }

  clearAnonymousChatToken();
  return parseAnonymousChatSession(await requestAnonymousChatSession(null));
}
