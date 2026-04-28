import { registerApiRoute } from '@mastra/core/server';
import { ChatInputSchema, chatWorkflow } from './workflows/chatWorkflow';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ZodError } from 'zod';
import { createSSEStream } from '../utils/streamUtils';
import {
  CloseBrowserSessionBeaconRequestSchema,
  CloseBrowserSessionBeaconResponseSchema,
  CloseBrowserSessionResponseSchema,
  BrowserSessionResponseSchema,
  CloseBrowserSessionWithPolicyRequestSchema,
  CreateBrowserSessionRequestSchema,
  StatusBrowserSessionRequestSchema,
} from '../browser/schemas.js';
import {
  closeSessionWithPolicy,
  createSession,
  getSession,
} from '../browser/browserService.js';
import { BrowserSessionError } from '../browser/types.js';
import {
  AuthError,
  requireAuthenticatedUser,
  requireAuthenticatedUserWithFallbackToken,
} from '../auth/supabaseAuth.js';

// Helper function to convert Zod schema to OpenAPI schema
function toOpenApiSchema(schema: unknown) {
  return zodToJsonSchema(schema as never) as Record<string, unknown>;
}

function handleBrowserError(c: { json: (payload: unknown, status: number) => Response }, error: unknown) {
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

function handleRouteError(c: { json: (payload: unknown, status: number) => Response }, error: unknown) {
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
  if (error instanceof AuthError || error instanceof ZodError || error instanceof BrowserSessionError) {
    return;
  }

  console.error(error);
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
        const {
          prompt,
          temperature,
          maxTokens,
          additionalContext,
        } = ChatInputSchema.parse(body);

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
        const { sessionId, reason, allowUntracked } = CloseBrowserSessionWithPolicyRequestSchema.parse(body);
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

        const { sessionId, reason, allowUntracked, accessToken } = CloseBrowserSessionBeaconRequestSchema.parse(rawBody);
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
