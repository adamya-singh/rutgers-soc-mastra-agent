import type { UIMessage } from 'ai';

import { buildMastraApiUrl } from '@/lib/mastraConfig';
import { supabaseClient } from '@/lib/supabaseClient';

export interface ChatThread {
  id: string;
  userId: string;
  title: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  metadata: unknown;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ChatHistoryMessage = UIMessage;

interface ChatThreadsResponse {
  threads: ChatThread[];
}

interface ChatThreadResponse {
  thread: ChatThread;
}

interface ChatThreadWithMessagesResponse {
  thread: ChatThread;
  messages: ChatHistoryMessage[];
}

interface DeleteChatThreadResponse {
  deleted: boolean;
}

async function getAccessToken(): Promise<string> {
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Sign in to use saved chats.');
  }
  return token;
}

async function chatHistoryFetch<T>(
  path: `/${string}`,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(buildMastraApiUrl(path), {
    ...init,
    headers,
  });
  const text = await response.text();
  const json = text ? (JSON.parse(text) as { error?: string }) : {};

  if (!response.ok) {
    throw new Error(json.error ?? `Chat history request failed (${response.status})`);
  }

  return json as T;
}

export async function listChatThreads(): Promise<ChatThread[]> {
  const { threads } = await chatHistoryFetch<ChatThreadsResponse>('/chat/threads');
  return threads;
}

export async function createChatThread(title?: string): Promise<ChatThread> {
  const { thread } = await chatHistoryFetch<ChatThreadResponse>('/chat/threads', {
    method: 'POST',
    body: JSON.stringify(title ? { title } : {}),
  });
  return thread;
}

export async function loadChatThread(threadId: string): Promise<ChatThreadWithMessagesResponse> {
  return chatHistoryFetch<ChatThreadWithMessagesResponse>('/chat/thread', {
    method: 'POST',
    body: JSON.stringify({ threadId }),
  });
}

export async function renameChatThread(
  threadId: string,
  title: string,
): Promise<ChatThread> {
  const { thread } = await chatHistoryFetch<ChatThreadResponse>('/chat/thread', {
    method: 'PATCH',
    body: JSON.stringify({ threadId, title }),
  });
  return thread;
}

export async function deleteChatThread(threadId: string): Promise<boolean> {
  const { deleted } = await chatHistoryFetch<DeleteChatThreadResponse>('/chat/thread', {
    method: 'DELETE',
    body: JSON.stringify({ threadId }),
  });
  return deleted;
}
