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

// Helper function to convert Zod schema to OpenAPI schema
function toOpenApiSchema(schema: unknown) {
  return zodToJsonSchema(schema as never) as Record<string, unknown>;
}

function handleBrowserError(c: { json: (payload: unknown, status: number) => Response }, error: unknown) {
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
      error.code === 'INVALID_BROWSER_TARGET'
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
        const body = await c.req.json();
        const {
          prompt,
          temperature,
          maxTokens,
          systemPrompt,
          additionalContext,
          resourceId,
          threadId,
        } = ChatInputSchema.parse(body);

        return createSSEStream(async (controller) => {
          const run = await chatWorkflow.createRunAsync();
          const result = await run.start({
            inputData: {
              prompt,
              temperature,
              maxTokens,
              systemPrompt,
              streamController: controller,
              additionalContext,
              resourceId,
              threadId,
            },
          });

          if (result.status !== 'success') {
            // TODO: Handle workflow errors appropriately
            throw new Error(`Workflow failed: ${result.status}`);
          }
        });
      } catch (error) {
        console.error(error);
        return c.json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
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
        const body = await c.req.json();
        const { browserClientId, target } = CreateBrowserSessionRequestSchema.parse(body);
        const session = await createSession(target, browserClientId);
        return c.json({ session }, 200);
      } catch (error) {
        console.error(error);
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
        const body = await c.req.json();
        const { browserClientId, sessionId } = StatusBrowserSessionRequestSchema.parse(body);
        const session = await getSession(sessionId, browserClientId);
        return c.json({ session }, 200);
      } catch (error) {
        console.error(error);
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
        const body = await c.req.json();
        const { browserClientId, sessionId, reason, allowUntracked } = CloseBrowserSessionWithPolicyRequestSchema.parse(body);
        const result = await closeSessionWithPolicy({
          sessionId,
          ownerId: browserClientId,
          reason,
          allowUntracked,
        });
        return c.json(result, 200);
      } catch (error) {
        console.error(error);
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

        const { browserClientId, sessionId, reason, allowUntracked } = CloseBrowserSessionBeaconRequestSchema.parse(rawBody);
        const result = await closeSessionWithPolicy({
          sessionId,
          ownerId: browserClientId,
          reason,
          allowUntracked,
        });

        return c.json({ accepted: true, terminated: result.terminated }, 200);
      } catch (error) {
        console.error(error);
        return c.json({ accepted: true, terminated: false }, 200);
      }
    },
  }),
];
