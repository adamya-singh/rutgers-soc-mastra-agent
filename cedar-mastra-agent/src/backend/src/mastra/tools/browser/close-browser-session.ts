import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { closeSession } from '../../../browser/browserService.js';
import { requireBrowserClientIdFromRuntime } from '../../../browser/runtimeContext.js';

export const CLOSE_BROWSER_SESSION_DESCRIPTION = `Close an existing remote browser session.
Use when the user is done with Degree Navigator automation.`;

export const closeBrowserSessionInputSchema = z.object({
  sessionId: z.string().min(1),
});

export const closeBrowserSessionOutputSchema = z.object({
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

export const closeBrowserSessionTool = createTool({
  id: 'closeBrowserSession',
  description: CLOSE_BROWSER_SESSION_DESCRIPTION,
  inputSchema: closeBrowserSessionInputSchema,
  outputSchema: closeBrowserSessionOutputSchema,
  execute: async ({ context, runtimeContext }) => {
    const ownerId = requireBrowserClientIdFromRuntime(runtimeContext);
    const session = await closeSession(context.sessionId, ownerId);

    return { session };
  },
});
