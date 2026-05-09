import { getSupabaseServiceClient } from '../lib/supabase.js';
import type { Json, Tables, TablesInsert } from '../types/database.js';
import {
  ChatMessage,
  ChatMessageSchema,
  ChatThread,
  ChatThreadSchema,
  ChatUIMessage,
} from './schemas.js';

type ChatThreadDbRow = Tables<'chat_threads'>;
type ChatMessageDbRow = Tables<'chat_messages'>;
type ChatThreadInsert = TablesInsert<'chat_threads'>;
type ChatMessageInsert = TablesInsert<'chat_messages'>;
type SupabaseServiceClient = ReturnType<typeof getSupabaseServiceClient>;

const DEFAULT_THREAD_TITLE = 'New chat';
const MAX_TITLE_LENGTH = 80;
const MAX_PREVIEW_LENGTH = 180;
const DEFAULT_ANONYMOUS_CHAT_DAILY_MESSAGE_LIMIT = 10;

let getSupabaseServiceClientForRepository = getSupabaseServiceClient;

export class ChatThreadNotFoundError extends Error {
  constructor(threadId: string) {
    super(`Chat thread not found: ${threadId}`);
    this.name = 'ChatThreadNotFoundError';
  }
}

export class AnonymousChatQuotaExceededError extends Error {
  readonly status = 429;

  constructor(readonly quota: AnonymousChatQuota) {
    super('Daily anonymous chat limit reached. Sign in to continue chatting.');
    this.name = 'AnonymousChatQuotaExceededError';
  }
}

export type ChatOwner =
  | {
      type: 'authenticated';
      userId: string;
    }
  | {
      type: 'anonymous';
      anonymousClientId: string;
    };

export type AnonymousChatQuota = {
  allowed: boolean;
  messageCount: number;
  dailyLimit: number;
  remaining: number;
  usageDate: string;
};

export function authenticatedChatOwner(userId: string): ChatOwner {
  return { type: 'authenticated', userId };
}

export function anonymousChatOwner(anonymousClientId: string): ChatOwner {
  return { type: 'anonymous', anonymousClientId };
}

export function setChatHistorySupabaseClientFactoryForTest(
  factory: (() => SupabaseServiceClient) | null,
): void {
  getSupabaseServiceClientForRepository = factory ?? getSupabaseServiceClient;
}

function asJson(value: unknown): Json {
  return value as Json;
}

function mapThreadRow(row: ChatThreadDbRow): ChatThread {
  return ChatThreadSchema.parse({
    id: row.id,
    userId: row.user_id,
    anonymousClientId: row.anonymous_client_id,
    title: row.title,
    lastMessagePreview: row.last_message_preview,
    lastMessageAt: row.last_message_at,
    metadata: row.metadata,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapMessageRow(row: ChatMessageDbRow): ChatMessage {
  return ChatMessageSchema.parse({
    id: row.id,
    threadId: row.thread_id,
    userId: row.user_id,
    anonymousClientId: row.anonymous_client_id,
    uiMessageId: row.ui_message_id,
    role: row.role,
    parts: row.parts,
    uiMessage: row.ui_message,
    textContent: row.text_content,
    sequenceIndex: row.sequence_index,
    metadata: row.metadata,
    createdAt: row.created_at,
  });
}

function getOwnerInsert(owner: ChatOwner): Pick<ChatThreadInsert, 'user_id' | 'anonymous_client_id'> {
  if (owner.type === 'authenticated') {
    return {
      user_id: owner.userId,
      anonymous_client_id: null,
    };
  }

  return {
    user_id: null,
    anonymous_client_id: owner.anonymousClientId,
  };
}

function getMessageOwnerInsert(
  owner: ChatOwner,
): Pick<ChatMessageInsert, 'user_id' | 'anonymous_client_id'> {
  if (owner.type === 'authenticated') {
    return {
      user_id: owner.userId,
      anonymous_client_id: null,
    };
  }

  return {
    user_id: null,
    anonymous_client_id: owner.anonymousClientId,
  };
}

function applyOwnerFilter<T extends { eq: (column: string, value: string) => T }>(
  query: T,
  owner: ChatOwner,
): T {
  if (owner.type === 'authenticated') {
    return query.eq('user_id', owner.userId);
  }

  return query.eq('anonymous_client_id', owner.anonymousClientId);
}

function readAnonymousDailyLimit(): number {
  const raw = process.env.ANONYMOUS_CHAT_DAILY_MESSAGE_LIMIT;
  if (!raw) {
    return DEFAULT_ANONYMOUS_CHAT_DAILY_MESSAGE_LIMIT;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_ANONYMOUS_CHAT_DAILY_MESSAGE_LIMIT;
}

export function getMessageTextContent(message: ChatUIMessage): string {
  const partText = message.parts
    .map((part) => {
      if (part.type === 'text' && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();

  if (partText) {
    return partText;
  }

  const legacyContent = (message as { content?: unknown }).content;
  return typeof legacyContent === 'string' ? legacyContent.trim() : '';
}

export function buildThreadTitle(message: ChatUIMessage): string {
  const normalized = getMessageTextContent(message).replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return DEFAULT_THREAD_TITLE;
  }
  return normalized.length > MAX_TITLE_LENGTH
    ? `${normalized.slice(0, MAX_TITLE_LENGTH - 3).trimEnd()}...`
    : normalized;
}

function buildPreview(message: ChatUIMessage): string | null {
  const normalized = getMessageTextContent(message).replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }
  return normalized.length > MAX_PREVIEW_LENGTH
    ? `${normalized.slice(0, MAX_PREVIEW_LENGTH - 3).trimEnd()}...`
    : normalized;
}

async function getNextSequenceIndex(threadId: string): Promise<number> {
  const supabase = getSupabaseServiceClientForRepository();
  const { data, error } = await supabase
    .from('chat_messages')
    .select('sequence_index')
    .eq('thread_id', threadId)
    .order('sequence_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read chat message sequence: ${error.message}`);
  }

  return typeof data?.sequence_index === 'number' ? data.sequence_index + 1 : 0;
}

export async function listChatThreads(owner: ChatOwner): Promise<ChatThread[]> {
  const supabase = getSupabaseServiceClientForRepository();
  const query = supabase
    .from('chat_threads')
    .select('*')
    .is('deleted_at', null);

  const { data, error } = await applyOwnerFilter(query, owner)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Failed to list chat threads: ${error.message}`);
  }

  return (data ?? []).map(mapThreadRow);
}

export async function createChatThread(
  owner: ChatOwner,
  title = DEFAULT_THREAD_TITLE,
): Promise<ChatThread> {
  const supabase = getSupabaseServiceClientForRepository();
  const payload: ChatThreadInsert = {
    ...getOwnerInsert(owner),
    title: title.trim() || DEFAULT_THREAD_TITLE,
  };

  const { data, error } = await supabase
    .from('chat_threads')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    const wrappedError = new Error(`Failed to create chat thread: ${error.message}`) as Error & {
      code?: unknown;
    };
    wrappedError.code = (error as { code?: unknown }).code;
    throw wrappedError;
  }

  return mapThreadRow(data);
}

export async function getChatThread(
  owner: ChatOwner,
  threadId: string,
): Promise<ChatThread | null> {
  const supabase = getSupabaseServiceClientForRepository();
  const query = supabase
    .from('chat_threads')
    .select('*')
    .eq('id', threadId)
    .is('deleted_at', null);

  const { data, error } = await applyOwnerFilter(query, owner)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read chat thread: ${error.message}`);
  }

  return data ? mapThreadRow(data) : null;
}

export async function requireChatThread(
  owner: ChatOwner,
  threadId: string,
): Promise<ChatThread> {
  const thread = await getChatThread(owner, threadId);
  if (!thread) {
    throw new ChatThreadNotFoundError(threadId);
  }
  return thread;
}

export async function getChatThreadWithMessages(
  owner: ChatOwner,
  threadId: string,
): Promise<{ thread: ChatThread; messages: ChatMessage[] }> {
  const thread = await requireChatThread(owner, threadId);
  const supabase = getSupabaseServiceClientForRepository();
  const query = supabase
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId);

  const { data, error } = await applyOwnerFilter(query, owner)
    .order('sequence_index', { ascending: true });

  if (error) {
    throw new Error(`Failed to read chat messages: ${error.message}`);
  }

  return {
    thread,
    messages: (data ?? []).map(mapMessageRow),
  };
}

export async function renameChatThread(
  owner: ChatOwner,
  threadId: string,
  title: string,
): Promise<ChatThread> {
  const supabase = getSupabaseServiceClientForRepository();
  const query = supabase
    .from('chat_threads')
    .update({ title: title.trim() || DEFAULT_THREAD_TITLE })
    .eq('id', threadId)
    .is('deleted_at', null);

  const { data, error } = await applyOwnerFilter(query, owner)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to rename chat thread: ${error.message}`);
  }
  if (!data) {
    throw new ChatThreadNotFoundError(threadId);
  }

  return mapThreadRow(data);
}

export async function deleteChatThread(
  owner: ChatOwner,
  threadId: string,
): Promise<boolean> {
  const supabase = getSupabaseServiceClientForRepository();
  const query = supabase
    .from('chat_threads')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', threadId)
    .is('deleted_at', null);

  const { data, error } = await applyOwnerFilter(query, owner)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to delete chat thread: ${error.message}`);
  }

  return Boolean(data);
}

export async function appendChatMessage(
  owner: ChatOwner,
  threadId: string,
  message: ChatUIMessage,
): Promise<ChatMessage> {
  const thread = await requireChatThread(owner, threadId);
  const supabase = getSupabaseServiceClientForRepository();
  const now = new Date().toISOString();
  const uiMessageId = message.id ?? `${message.role}-${now}`;
  const textContent = getMessageTextContent(message);
  const preview = buildPreview(message);
  const existingQuery = supabase
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .eq('ui_message_id', uiMessageId);

  const { data: existingMessage, error: existingError } = await applyOwnerFilter(existingQuery, owner)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to check chat message: ${existingError.message}`);
  }
  if (existingMessage) {
    return mapMessageRow(existingMessage);
  }

  const nextSequenceIndex = await getNextSequenceIndex(threadId);

  const payload: ChatMessageInsert = {
    ...getMessageOwnerInsert(owner),
    thread_id: threadId,
    ui_message_id: uiMessageId,
    role: message.role,
    parts: asJson(message.parts),
    ui_message: asJson(message),
    text_content: textContent || null,
    sequence_index: nextSequenceIndex,
  };

  const { data, error } = await supabase
    .from('chat_messages')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to append chat message: ${error.message}`);
  }

  const shouldSetGeneratedTitle =
    message.role === 'user' &&
    (thread.title === DEFAULT_THREAD_TITLE || thread.title.trim().length === 0);

  const threadUpdate: {
    last_message_preview: string | null;
    last_message_at: string;
    title?: string;
  } = {
    last_message_preview: preview,
    last_message_at: now,
  };

  if (shouldSetGeneratedTitle) {
    threadUpdate.title = buildThreadTitle(message);
  }

  const threadUpdateQuery = supabase
    .from('chat_threads')
    .update(threadUpdate)
    .eq('id', threadId);

  const { error: threadError } = await applyOwnerFilter(threadUpdateQuery, owner);

  if (threadError) {
    throw new Error(`Failed to update chat thread metadata: ${threadError.message}`);
  }

  return mapMessageRow(data);
}

export async function ensureAnonymousChatClient(anonymousClientId: string): Promise<void> {
  const supabase = getSupabaseServiceClientForRepository();
  const { error } = await supabase
    .from('anonymous_chat_clients')
    .upsert(
      {
        id: anonymousClientId,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

  if (error) {
    throw new Error(`Failed to ensure anonymous chat client: ${error.message}`);
  }
}

async function getActiveAnonymousThread(anonymousClientId: string): Promise<ChatThread | null> {
  const supabase = getSupabaseServiceClientForRepository();
  const { data, error } = await supabase
    .from('chat_threads')
    .select('*')
    .eq('anonymous_client_id', anonymousClientId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read anonymous chat thread: ${error.message}`);
  }

  return data ? mapThreadRow(data) : null;
}

export async function getOrCreateAnonymousChatThread(
  anonymousClientId: string,
): Promise<ChatThread> {
  await ensureAnonymousChatClient(anonymousClientId);

  const existingThread = await getActiveAnonymousThread(anonymousClientId);
  if (existingThread) {
    return existingThread;
  }

  try {
    return await createChatThread(anonymousChatOwner(anonymousClientId));
  } catch (error) {
    const duplicateKeyCode = typeof error === 'object' && error !== null
      ? (error as { code?: unknown }).code
      : undefined;
    if (duplicateKeyCode !== '23505') {
      throw error;
    }

    const racedThread = await getActiveAnonymousThread(anonymousClientId);
    if (racedThread) {
      return racedThread;
    }
    throw error;
  }
}

export async function getAnonymousChatQuota(
  anonymousClientId: string,
  dailyLimit = readAnonymousDailyLimit(),
): Promise<AnonymousChatQuota> {
  await ensureAnonymousChatClient(anonymousClientId);

  const today = new Date().toISOString().slice(0, 10);
  const supabase = getSupabaseServiceClientForRepository();
  const { data, error } = await supabase
    .from('anonymous_chat_daily_usage')
    .select('*')
    .eq('client_id', anonymousClientId)
    .eq('usage_date', today)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read anonymous chat quota: ${error.message}`);
  }

  const messageCount = data?.message_count ?? 0;
  return {
    allowed: messageCount < dailyLimit,
    messageCount,
    dailyLimit,
    remaining: Math.max(dailyLimit - messageCount, 0),
    usageDate: today,
  };
}

export async function claimAnonymousChatMessage(
  anonymousClientId: string,
  dailyLimit = readAnonymousDailyLimit(),
): Promise<AnonymousChatQuota> {
  const supabase = getSupabaseServiceClientForRepository();
  const { data, error } = await supabase.rpc('claim_anonymous_chat_message', {
    p_client_id: anonymousClientId,
    p_daily_limit: dailyLimit,
  });

  if (error) {
    throw new Error(`Failed to claim anonymous chat quota: ${error.message}`);
  }

  const row = data?.[0];
  if (!row) {
    throw new Error('Anonymous chat quota claim returned no result.');
  }

  const quota = {
    allowed: row.allowed,
    messageCount: row.message_count,
    dailyLimit: row.daily_limit,
    remaining: row.remaining,
    usageDate: row.usage_date,
  };

  if (!quota.allowed) {
    throw new AnonymousChatQuotaExceededError(quota);
  }

  return quota;
}
