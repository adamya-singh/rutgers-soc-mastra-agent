import { registerApiRoute } from '@mastra/core/server';
import {
  buildModelVisibleAdditionalContext,
  ChatInputSchema,
  chatWorkflow,
} from './workflows/chatWorkflow';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z, ZodError } from 'zod';
import { createSSEStream } from '../utils/streamUtils';
import { RuntimeContext } from '@mastra/core/di';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { socAgent } from './agents/soc-agent.js';
import {
  CloseBrowserSessionBeaconRequestSchema,
  CloseBrowserSessionBeaconResponseSchema,
  CloseBrowserSessionResponseSchema,
  BrowserSessionResponseSchema,
  CloseBrowserSessionWithPolicyRequestSchema,
  CreateBrowserSessionRequestSchema,
  DegreeNavigatorExtractionRequestSchema,
  DegreeNavigatorExtractionResponseSchema,
  DegreeNavigatorReadinessRequestSchema,
  DegreeNavigatorReadinessResponseSchema,
  StatusBrowserSessionRequestSchema,
} from '../browser/schemas.js';
import {
  closeSessionWithPolicy,
  createSession,
  extractDegreeNavigatorFromSession,
  getDegreeNavigatorReadiness,
  getSession,
} from '../browser/browserService.js';
import { BrowserSessionError } from '../browser/types.js';
import {
  AuthError,
  requireAuthenticatedUser,
  requireAuthenticatedUserWithFallbackToken,
} from '../auth/supabaseAuth.js';
import {
  DegreeNavigatorProfileResponseSchema,
  UpsertDegreeNavigatorProfileRequestSchema,
} from '../degree-navigator/schemas.js';
import {
  deleteDegreeNavigatorProfile,
  getDegreeNavigatorProfile,
  upsertDegreeNavigatorProfile,
} from '../degree-navigator/repository.js';
import { enrichDegreeNavigatorCourseTitles } from '../degree-navigator/courseTitleEnrichment.js';

const ClearDegreeNavigatorProfileResponseSchema = z.object({
  cleared: z.boolean(),
});

const ChatUIMessagePartSchema = z.object({ type: z.string() }).passthrough();
const ChatUIMessageSchema = z
  .object({
    id: z.string().optional(),
    role: z.enum(['system', 'user', 'assistant']),
    metadata: z.unknown().optional(),
    parts: z.array(ChatUIMessagePartSchema),
  })
  .passthrough();

export const ChatUIRequestSchema = z.object({
  messages: z.array(ChatUIMessageSchema),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  additionalContext: z.any().optional(),
});

type ChatUIMessage = z.infer<typeof ChatUIMessageSchema>;

// Helper function to convert Zod schema to OpenAPI schema
function toOpenApiSchema(schema: unknown) {
  return zodToJsonSchema(schema as never) as Record<string, unknown>;
}

function handleBrowserError(
  c: { json: (payload: unknown, status: number) => Response },
  error: unknown,
) {
  if (error instanceof AuthError) {
    return c.json({ error: error.message }, error.status);
  }

  if (error instanceof ZodError) {
    return c.json(
      {
        error: 'Invalid browser session request payload.',
        details: error.flatten(),
      },
      400,
    );
  }

  if (error instanceof BrowserSessionError) {
    if (error.code === 'SESSION_NOT_FOUND') {
      return c.json({ error: error.message, code: error.code }, 404);
    }
    if (
      error.code === 'SESSION_OWNERSHIP_MISMATCH' ||
      error.code === 'MISSING_BROWSER_CLIENT_ID' ||
      error.code === 'INVALID_BROWSER_TARGET' ||
      error.code === 'INVALID_BROWSER_URL'
    ) {
      return c.json({ error: error.message, code: error.code }, 403);
    }
    if (error.code === 'SESSION_EXPIRED') {
      return c.json({ error: error.message, code: error.code }, 410);
    }

    return c.json({ error: error.message, code: error.code }, 502);
  }

  if (error instanceof Error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ error: 'Internal error' }, 500);
}

function handleRouteError(
  c: { json: (payload: unknown, status: number) => Response },
  error: unknown,
) {
  if (error instanceof AuthError) {
    return c.json({ error: error.message }, error.status);
  }

  if (error instanceof ZodError) {
    return c.json(
      {
        error: 'Invalid request payload.',
        details: error.flatten(),
      },
      400,
    );
  }

  if (error instanceof Error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ error: 'Internal error' }, 500);
}

function logUnexpectedRouteError(error: unknown): void {
  if (
    error instanceof AuthError ||
    error instanceof ZodError ||
    error instanceof BrowserSessionError
  ) {
    return;
  }

  console.error(error);
}

export function normalizeChatUIMessages(messages: ChatUIMessage[]): ChatUIMessage[] {
  return messages.map((message, index) => ({
    ...message,
    id: message.id ?? `message-${index}`,
  }));
}

export function selectMessagesForAgent(messages: ChatUIMessage[]): ChatUIMessage[] {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  return latestUserMessage ? [latestUserMessage] : messages;
}

export function createAdditionalContextModelMessage(additionalContext: unknown) {
  const modelVisibleAdditionalContext = buildModelVisibleAdditionalContext(additionalContext);
  if (Object.keys(modelVisibleAdditionalContext).length === 0) {
    return undefined;
  }

  return {
    role: 'system',
    content:
      'Additional context (for background knowledge): ' +
      JSON.stringify(modelVisibleAdditionalContext),
  };
}

/**
 * API routes for the Mastra backend
 *
 * These routes handle chat interactions between the Cedar-OS frontend
 * and your Mastra agents. The chat UI will automatically use these endpoints.
 *
 * - /chat: Standard request-response chat endpoint
 * - /chat/stream: Server-sent events (SSE) endpoint for streaming responses
 */
export const apiRoutes = [
  registerApiRoute('/chat/ui', {
    method: 'POST',
    openapi: {
      requestBody: {
        content: {
          'application/json': {
            schema: toOpenApiSchema(ChatUIRequestSchema),
          },
        },
      },
    },
    handler: async (c) => {
      try {
        const authenticatedUser = await requireAuthenticatedUser(c);
        const body = await c.req.json();
        const { messages, temperature, maxTokens, additionalContext } =
          ChatUIRequestSchema.parse(body);
        const originalMessages = normalizeChatUIMessages(messages);
        const agentMessages = selectMessagesForAgent(originalMessages);
        const additionalContextMessage = createAdditionalContextModelMessage(additionalContext);

        const stream = createUIMessageStream({
          originalMessages: originalMessages as never,
          execute: async ({ writer }) => {
            const runtimeContext = new RuntimeContext();
            runtimeContext.set('additionalContext', additionalContext);
            runtimeContext.set('authenticatedUserId', authenticatedUser.userId);
            runtimeContext.set('streamController', {
              writeDataEvent: (eventType: string, eventData: unknown) => {
                writer.write({
                  type: `data-${eventType}`,
                  id: `${eventType}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  data: eventData,
                  transient: true,
                } as never);
              },
            });

            const streamResult = await socAgent.stream(agentMessages as never, {
              format: 'aisdk',
              maxSteps: 50,
              modelSettings: {
                temperature,
                maxOutputTokens: maxTokens,
              },
              runtimeContext,
              ...(additionalContextMessage
                ? {
                    context: [additionalContextMessage],
                  }
                : {}),
              memory: {
                thread: authenticatedUser.userId,
                resource: authenticatedUser.userId,
              },
            });

            writer.merge(streamResult.toUIMessageStream({ originalMessages: originalMessages as never }));
          },
          onError: (error) => {
            if (error instanceof Error) {
              return error.message;
            }
            return 'Internal error';
          },
        });

        return createUIMessageStreamResponse({ stream });
      } catch (error) {
        logUnexpectedRouteError(error);
        return handleRouteError(c, error);
      }
    },
  }),
  registerApiRoute('/chat/stream', {
    method: 'POST',
    openapi: {
      requestBody: {
        content: {
          'application/json': {
            schema: toOpenApiSchema(ChatInputSchema),
          },
        },
      },
    },
    handler: async (c) => {
      try {
        const authenticatedUser = await requireAuthenticatedUser(c);
        const body = await c.req.json();
        const { prompt, temperature, maxTokens, additionalContext } = ChatInputSchema.parse(body);

        return createSSEStream(async (controller) => {
          const run = await chatWorkflow.createRunAsync();
          const result = await run.start({
            inputData: {
              prompt,
              temperature,
              maxTokens,
              streamController: controller,
              additionalContext,
              resourceId: authenticatedUser.userId,
              threadId: authenticatedUser.userId,
              authenticatedUserId: authenticatedUser.userId,
            },
          });

          if (result.status !== 'success') {
            // TODO: Handle workflow errors appropriately
            throw new Error(`Workflow failed: ${result.status}`);
          }
        });
      } catch (error) {
        logUnexpectedRouteError(error);
        return handleRouteError(c, error);
      }
    },
  }),
  registerApiRoute('/degree-navigator/profile', {
    method: 'GET',
    openapi: {
      responses: {
        200: {
          description: 'Latest Degree Navigator profile for the authenticated user',
          content: {
            'application/json': {
              schema: toOpenApiSchema(DegreeNavigatorProfileResponseSchema),
            },
          },
        },
      },
    },
    handler: async (c) => {
      try {
        const authenticatedUser = await requireAuthenticatedUser(c);
        const profile = await getDegreeNavigatorProfile(authenticatedUser.userId);
        return c.json({ profile }, 200);
      } catch (error) {
        logUnexpectedRouteError(error);
        return handleRouteError(c, error);
      }
    },
  }),
  registerApiRoute('/degree-navigator/profile', {
    method: 'POST',
    openapi: {
      requestBody: {
        content: {
          'application/json': {
            schema: toOpenApiSchema(UpsertDegreeNavigatorProfileRequestSchema),
          },
        },
      },
      responses: {
        200: {
          description: 'Saved Degree Navigator profile for the authenticated user',
          content: {
            'application/json': {
              schema: toOpenApiSchema(DegreeNavigatorProfileResponseSchema),
            },
          },
        },
      },
    },
    handler: async (c) => {
      try {
        const authenticatedUser = await requireAuthenticatedUser(c);
        const body = await c.req.json();
        const capture = UpsertDegreeNavigatorProfileRequestSchema.parse(body);
        const enrichedCapture = await enrichDegreeNavigatorCourseTitles(capture);
        const profile = await upsertDegreeNavigatorProfile(
          authenticatedUser.userId,
          enrichedCapture,
        );
        return c.json({ profile }, 200);
      } catch (error) {
        logUnexpectedRouteError(error);
        return handleRouteError(c, error);
      }
    },
  }),
  registerApiRoute('/degree-navigator/profile', {
    method: 'DELETE',
    openapi: {
      responses: {
        200: {
          description: 'Cleared the saved Degree Navigator profile for the authenticated user',
          content: {
            'application/json': {
              schema: toOpenApiSchema(ClearDegreeNavigatorProfileResponseSchema),
            },
          },
        },
      },
    },
    handler: async (c) => {
      try {
        const authenticatedUser = await requireAuthenticatedUser(c);
        const cleared = await deleteDegreeNavigatorProfile(authenticatedUser.userId);
        return c.json({ cleared }, 200);
      } catch (error) {
        logUnexpectedRouteError(error);
        return handleRouteError(c, error);
      }
    },
  }),
  registerApiRoute('/browser/session/create', {
    method: 'POST',
    openapi: {
      requestBody: {
        content: {
          'application/json': {
            schema: toOpenApiSchema(CreateBrowserSessionRequestSchema),
          },
        },
      },
      responses: {
        200: {
          description: 'Browser session created',
          content: {
            'application/json': {
              schema: toOpenApiSchema(BrowserSessionResponseSchema),
            },
          },
        },
      },
    },
    handler: async (c) => {
      try {
        const authenticatedUser = await requireAuthenticatedUser(c);
        const body = await c.req.json();
        const { target } = CreateBrowserSessionRequestSchema.parse(body);
        const session = await createSession(target, authenticatedUser.userId);
        return c.json({ session }, 200);
      } catch (error) {
        logUnexpectedRouteError(error);
        return handleBrowserError(c, error);
      }
    },
  }),
  registerApiRoute('/browser/session/status', {
    method: 'POST',
    openapi: {
      requestBody: {
        content: {
          'application/json': {
            schema: toOpenApiSchema(StatusBrowserSessionRequestSchema),
          },
        },
      },
      responses: {
        200: {
          description: 'Browser session status',
          content: {
            'application/json': {
              schema: toOpenApiSchema(BrowserSessionResponseSchema),
            },
          },
        },
      },
    },
    handler: async (c) => {
      try {
        const authenticatedUser = await requireAuthenticatedUser(c);
        const body = await c.req.json();
        const { sessionId } = StatusBrowserSessionRequestSchema.parse(body);
        const session = await getSession(sessionId, authenticatedUser.userId);
        return c.json({ session }, 200);
      } catch (error) {
        logUnexpectedRouteError(error);
        return handleBrowserError(c, error);
      }
    },
  }),
  registerApiRoute('/browser/session/degree-navigator-readiness', {
    method: 'POST',
    openapi: {
      requestBody: {
        content: {
          'application/json': {
            schema: toOpenApiSchema(DegreeNavigatorReadinessRequestSchema),
          },
        },
      },
      responses: {
        200: {
          description: 'Degree Navigator login readiness for the active browser session',
          content: {
            'application/json': {
              schema: toOpenApiSchema(DegreeNavigatorReadinessResponseSchema),
            },
          },
        },
      },
    },
    handler: async (c) => {
      try {
        const authenticatedUser = await requireAuthenticatedUser(c);
        const body = await c.req.json();
        const { sessionId } = DegreeNavigatorReadinessRequestSchema.parse(body);
        const readiness = await getDegreeNavigatorReadiness(sessionId, authenticatedUser.userId);
        return c.json(readiness, 200);
      } catch (error) {
        logUnexpectedRouteError(error);
        return handleBrowserError(c, error);
      }
    },
  }),
  registerApiRoute('/browser/session/degree-navigator-extract', {
    method: 'POST',
    openapi: {
      requestBody: {
        content: {
          'application/json': {
            schema: toOpenApiSchema(DegreeNavigatorExtractionRequestSchema),
          },
        },
      },
      responses: {
        200: {
          description: 'Stored raw Degree Navigator extraction evidence from the active browser session',
          content: {
            'application/json': {
              schema: toOpenApiSchema(DegreeNavigatorExtractionResponseSchema),
            },
          },
        },
      },
    },
    handler: async (c) => {
      try {
        const authenticatedUser = await requireAuthenticatedUser(c);
        const body = await c.req.json();
        const { sessionId } = DegreeNavigatorExtractionRequestSchema.parse(body);
        const result = await extractDegreeNavigatorFromSession(sessionId, authenticatedUser.userId);
        return c.json(result, 200);
      } catch (error) {
        logUnexpectedRouteError(error);
        return handleBrowserError(c, error);
      }
    },
  }),
  registerApiRoute('/browser/session/close', {
    method: 'POST',
    openapi: {
      requestBody: {
        content: {
          'application/json': {
            schema: toOpenApiSchema(CloseBrowserSessionWithPolicyRequestSchema),
          },
        },
      },
      responses: {
        200: {
          description: 'Browser session closed',
          content: {
            'application/json': {
              schema: toOpenApiSchema(CloseBrowserSessionResponseSchema),
            },
          },
        },
      },
    },
    handler: async (c) => {
      try {
        const authenticatedUser = await requireAuthenticatedUser(c);
        const body = await c.req.json();
        const { sessionId, reason, allowUntracked } =
          CloseBrowserSessionWithPolicyRequestSchema.parse(body);
        const result = await closeSessionWithPolicy({
          sessionId,
          ownerId: authenticatedUser.userId,
          reason,
          allowUntracked,
        });
        return c.json(result, 200);
      } catch (error) {
        logUnexpectedRouteError(error);
        return handleBrowserError(c, error);
      }
    },
  }),
  registerApiRoute('/browser/session/close-beacon', {
    method: 'POST',
    openapi: {
      requestBody: {
        content: {
          'application/json': {
            schema: toOpenApiSchema(CloseBrowserSessionBeaconRequestSchema),
          },
          'text/plain': {
            schema: toOpenApiSchema(CloseBrowserSessionBeaconRequestSchema),
          },
        },
      },
      responses: {
        200: {
          description: 'Browser session close beacon accepted',
          content: {
            'application/json': {
              schema: toOpenApiSchema(CloseBrowserSessionBeaconResponseSchema),
            },
          },
        },
      },
    },
    handler: async (c) => {
      try {
        let rawBody: unknown = null;
        try {
          rawBody = await c.req.json();
        } catch {
          const text = await c.req.text();
          rawBody = text ? JSON.parse(text) : {};
        }

        const { sessionId, reason, allowUntracked, accessToken } =
          CloseBrowserSessionBeaconRequestSchema.parse(rawBody);
        const authenticatedUser = await requireAuthenticatedUserWithFallbackToken(c, accessToken);
        const result = await closeSessionWithPolicy({
          sessionId,
          ownerId: authenticatedUser.userId,
          reason,
          allowUntracked,
        });

        return c.json({ accepted: true, terminated: result.terminated }, 200);
      } catch (error) {
        logUnexpectedRouteError(error);
        return c.json({ accepted: true, terminated: false }, 200);
      }
    },
  }),
];
