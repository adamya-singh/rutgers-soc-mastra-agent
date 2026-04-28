import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { runObserve } from '../../../browser/browserService.js';
import {
  requireBrowserClientIdFromRuntime,
  requireBrowserSessionIdFromRuntime,
} from '../../../browser/runtimeContext.js';

export const BROWSER_OBSERVE_DESCRIPTION = `Observe the current page in the active remote browser session.
Use to gather context before any action. If sessionId is omitted, the current embedded browserSession from context is used.`;

export const browserObserveInputSchema = z.object({
  sessionId: z.string().min(1).optional(),
  instruction: z.string().optional(),
});

export const browserObserveOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.unknown().optional(),
});

export const browserObserve = createTool({
  id: 'browserObserve',
  description: BROWSER_OBSERVE_DESCRIPTION,
  inputSchema: browserObserveInputSchema,
  outputSchema: browserObserveOutputSchema,
  execute: async ({ context, runtimeContext }) => {
    const ownerId = requireBrowserClientIdFromRuntime(runtimeContext);
    const sessionId = requireBrowserSessionIdFromRuntime(runtimeContext, context.sessionId);
    return runObserve(sessionId, ownerId, context.instruction);
  },
});
