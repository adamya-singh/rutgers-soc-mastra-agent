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

let getSupabaseServiceClientForRepository = getSupabaseServiceClient;

export class ChatThreadNotFoundError extends Error {
  constructor(threadId: string) {
    super(`Chat thread not found: ${threadId}`);
    this.name = 'ChatThreadNotFoundError';
  }
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

export async function listChatThreads(userId: string): Promise<ChatThread[]> {
  const supabase = getSupabaseServiceClientForRepository();
  const { data, error } = await supabase
    .from('chat_threads')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Failed to list chat threads: ${error.message}`);
  }

  return (data ?? []).map(mapThreadRow);
}

export async function createChatThread(
  userId: string,
  title = DEFAULT_THREAD_TITLE,
): Promise<ChatThread> {
  const supabase = getSupabaseServiceClientForRepository();
  const payload: ChatThreadInsert = {
    user_id: userId,
    title: title.trim() || DEFAULT_THREAD_TITLE,
  };

  const { data, error } = await supabase
    .from('chat_threads')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create chat thread: ${error.message}`);
  }

  return mapThreadRow(data);
}

export async function getChatThread(
  userId: string,
  threadId: string,
): Promise<ChatThread | null> {
  const supabase = getSupabaseServiceClientForRepository();
  const { data, error } = await supabase
    .from('chat_threads')
    .select('*')
    .eq('id', threadId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read chat thread: ${error.message}`);
  }

  return data ? mapThreadRow(data) : null;
}

export async function requireChatThread(
  userId: string,
  threadId: string,
): Promise<ChatThread> {
  const thread = await getChatThread(userId, threadId);
  if (!thread) {
    throw new ChatThreadNotFoundError(threadId);
  }
  return thread;
}

export async function getChatThreadWithMessages(
  userId: string,
  threadId: string,
): Promise<{ thread: ChatThread; messages: ChatMessage[] }> {
  const thread = await requireChatThread(userId, threadId);
  const supabase = getSupabaseServiceClientForRepository();
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .eq('user_id', userId)
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
  userId: string,
  threadId: string,
  title: string,
): Promise<ChatThread> {
  const supabase = getSupabaseServiceClientForRepository();
  const { data, error } = await supabase
    .from('chat_threads')
    .update({ title: title.trim() || DEFAULT_THREAD_TITLE })
    .eq('id', threadId)
    .eq('user_id', userId)
    .is('deleted_at', null)
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
  userId: string,
  threadId: string,
): Promise<boolean> {
  const supabase = getSupabaseServiceClientForRepository();
  const { data, error } = await supabase
    .from('chat_threads')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', threadId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to delete chat thread: ${error.message}`);
  }

  return Boolean(data);
}

export async function appendChatMessage(
  userId: string,
  threadId: string,
  message: ChatUIMessage,
): Promise<ChatMessage> {
  const thread = await requireChatThread(userId, threadId);
  const supabase = getSupabaseServiceClientForRepository();
  const now = new Date().toISOString();
  const uiMessageId = message.id ?? `${message.role}-${now}`;
  const textContent = getMessageTextContent(message);
  const preview = buildPreview(message);
  const { data: existingMessage, error: existingError } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .eq('user_id', userId)
    .eq('ui_message_id', uiMessageId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to check chat message: ${existingError.message}`);
  }
  if (existingMessage) {
    return mapMessageRow(existingMessage);
  }

  const nextSequenceIndex = await getNextSequenceIndex(threadId);

  const payload: ChatMessageInsert = {
    thread_id: threadId,
    user_id: userId,
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

  const { error: threadError } = await supabase
    .from('chat_threads')
    .update(threadUpdate)
    .eq('id', threadId)
    .eq('user_id', userId);

  if (threadError) {
    throw new Error(`Failed to update chat thread metadata: ${threadError.message}`);
  }

  return mapMessageRow(data);
}
