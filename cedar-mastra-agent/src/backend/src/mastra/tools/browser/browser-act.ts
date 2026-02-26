import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { runAct } from '../../../browser/browserService.js';
import { requireBrowserClientIdFromRuntime } from '../../../browser/runtimeContext.js';

export const BROWSER_ACT_DESCRIPTION = `Perform an action in the active remote browser session.
Sensitive actions require explicit confirmationToken.`;

export const SENSITIVE_ACTION_PATTERN = /\b(submit|confirm|register|drop)\b/i;

export const browserActInputSchema = z.object({
  sessionId: z.string().min(1),
  action: z.string().min(1),
  confirmationToken: z.string().optional(),
});

export const browserActOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.unknown().optional(),
  needsConfirmation: z.boolean().optional(),
  confirmationRequiredFor: z.string().optional(),
});

export function requiresConfirmation(action: string): boolean {
  return SENSITIVE_ACTION_PATTERN.test(action);
}

export const browserAct = createTool({
  id: 'browserAct',
  description: BROWSER_ACT_DESCRIPTION,
  inputSchema: browserActInputSchema,
  outputSchema: browserActOutputSchema,
  execute: async ({ context, runtimeContext }) => {
    if (requiresConfirmation(context.action) && !context.confirmationToken) {
      return {
        success: false,
        needsConfirmation: true,
        confirmationRequiredFor: context.action,
        message:
          'This action may submit or alter records. Ask the user for explicit confirmation and pass confirmationToken before retrying.',
      };
    }

    const ownerId = requireBrowserClientIdFromRuntime(runtimeContext);
    return runAct(context.sessionId, ownerId, context.action);
  },
});
