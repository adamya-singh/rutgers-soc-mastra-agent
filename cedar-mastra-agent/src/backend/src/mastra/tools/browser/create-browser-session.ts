import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createSession } from '../../../browser/browserService.js';
import { requireBrowserClientIdFromRuntime } from '../../../browser/runtimeContext.js';

export const CREATE_BROWSER_SESSION_DESCRIPTION = `Create a remote browser session for Degree Navigator.
Use when the user wants the assistant to operate Rutgers Degree Navigator through the embedded browser.`;

export const createBrowserSessionInputSchema = z.object({
  target: z.enum(['degree_navigator']).default('degree_navigator'),
});

export const createBrowserSessionOutputSchema = z.object({
  session: z.object({
    provider: z.literal('browserbase'),
    sessionId: z.string(),
    liveViewUrl: z.string().url(),
    target: z.enum(['degree_navigator']),
    status: z.enum(['created', 'awaiting_login', 'ready', 'error', 'closed']),
    ownerId: z.string(),
    createdAt: z.string(),
    lastHeartbeatAt: z.string(),
  }),
});

export const createBrowserSession = createTool({
  id: 'createBrowserSession',
  description: CREATE_BROWSER_SESSION_DESCRIPTION,
  inputSchema: createBrowserSessionInputSchema,
  outputSchema: createBrowserSessionOutputSchema,
  execute: async ({ context, runtimeContext }) => {
    const ownerId = requireBrowserClientIdFromRuntime(runtimeContext);
    const session = await createSession(context.target, ownerId);

    return { session };
  },
});
