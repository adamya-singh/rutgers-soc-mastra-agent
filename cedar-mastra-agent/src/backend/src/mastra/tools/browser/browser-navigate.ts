import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { runNavigate } from '../../../browser/browserService.js';
import {
  requireBrowserClientIdFromRuntime,
  requireBrowserSessionIdFromRuntime,
} from '../../../browser/runtimeContext.js';

export const BROWSER_NAVIGATE_DESCRIPTION = `Navigate the existing remote browser session to a URL.
Use for explicit page navigation inside Degree Navigator session. If sessionId is omitted, the current embedded browserSession from context is used.`;

export const browserNavigateInputSchema = z.object({
  sessionId: z.string().min(1).optional(),
  url: z.string().url(),
});

export const browserNavigateOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.unknown().optional(),
});

export const browserNavigate = createTool({
  id: 'browserNavigate',
  description: BROWSER_NAVIGATE_DESCRIPTION,
  inputSchema: browserNavigateInputSchema,
  outputSchema: browserNavigateOutputSchema,
  execute: async ({ context, runtimeContext }) => {
    const ownerId = requireBrowserClientIdFromRuntime(runtimeContext);
    const sessionId = requireBrowserSessionIdFromRuntime(runtimeContext, context.sessionId);
    return runNavigate(sessionId, ownerId, context.url);
  },
});
