import { z } from 'zod';

export const ChatMessageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);

export const ChatUIMessagePartSchema = z.object({ type: z.string() }).passthrough();

export const ChatUIMessageSchema = z
  .object({
    id: z.string().optional(),
    role: z.enum(['system', 'user', 'assistant']),
    metadata: z.unknown().optional(),
    parts: z.array(ChatUIMessagePartSchema),
  })
  .passthrough();

export const ChatUIRequestSchema = z.object({
  threadId: z.string().uuid(),
  messages: z.array(ChatUIMessageSchema),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  additionalContext: z.any().optional(),
  hiddenModelContext: z
    .string()
    .max(20000, 'Hidden model context must be 20000 characters or fewer')
    .optional(),
});

export const ChatThreadSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  anonymousClientId: z.string().uuid().nullable(),
  title: z.string(),
  lastMessagePreview: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  metadata: z.unknown(),
  archivedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ChatMessageSchema = z.object({
  id: z.string().uuid(),
  threadId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  anonymousClientId: z.string().uuid().nullable(),
  uiMessageId: z.string().min(1),
  role: ChatMessageRoleSchema,
  parts: z.array(ChatUIMessagePartSchema),
  uiMessage: ChatUIMessageSchema,
  textContent: z.string().nullable(),
  sequenceIndex: z.number().int(),
  metadata: z.unknown(),
  createdAt: z.string(),
});

export const ChatThreadWithMessagesSchema = z.object({
  thread: ChatThreadSchema,
  messages: z.array(ChatMessageSchema),
});

export const CreateChatThreadRequestSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

export const GetChatThreadRequestSchema = z.object({
  threadId: z.string().uuid(),
});

export const UpdateChatThreadRequestSchema = z.object({
  threadId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
});

export const DeleteChatThreadRequestSchema = z.object({
  threadId: z.string().uuid(),
});

export const ChatThreadsResponseSchema = z.object({
  threads: z.array(ChatThreadSchema),
});

export const ChatThreadResponseSchema = z.object({
  thread: ChatThreadSchema,
});

export const ChatThreadWithMessagesResponseSchema = z.object({
  thread: ChatThreadSchema,
  messages: z.array(ChatUIMessageSchema),
});

export const DeleteChatThreadResponseSchema = z.object({
  deleted: z.boolean(),
});

export const ChatSuggestionsRequestSchema = z.object({
  threadId: z.string().uuid(),
});

export const ChatSuggestionsResponseSchema = z.object({
  suggestions: z.array(z.string()),
});

export type ChatUIMessage = z.infer<typeof ChatUIMessageSchema>;
export type ChatThread = z.infer<typeof ChatThreadSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatThreadWithMessages = z.infer<typeof ChatThreadWithMessagesSchema>;
