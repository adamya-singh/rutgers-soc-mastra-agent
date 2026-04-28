import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { runExtract } from '../../../browser/browserService.js';
import {
  requireBrowserClientIdFromRuntime,
  requireBrowserSessionIdFromRuntime,
} from '../../../browser/runtimeContext.js';

export const BROWSER_EXTRACT_DESCRIPTION = `Extract structured information from the current page in the active remote browser session. If sessionId is omitted, the current embedded browserSession from context is used.`;

export const browserExtractInputSchema = z.object({
  sessionId: z.string().min(1).optional(),
  instruction: z.string().min(1),
});

export const browserExtractOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.unknown().optional(),
});

export const browserExtract = createTool({
  id: 'browserExtract',
  description: BROWSER_EXTRACT_DESCRIPTION,
  inputSchema: browserExtractInputSchema,
  outputSchema: browserExtractOutputSchema,
  execute: async ({ context, runtimeContext }) => {
    const ownerId = requireBrowserClientIdFromRuntime(runtimeContext);
    const sessionId = requireBrowserSessionIdFromRuntime(runtimeContext, context.sessionId);
    return runExtract(sessionId, ownerId, context.instruction);
  },
});
