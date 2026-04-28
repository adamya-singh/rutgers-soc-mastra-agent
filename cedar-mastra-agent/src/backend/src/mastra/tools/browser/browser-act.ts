import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { runAct } from '../../../browser/browserService.js';
import {
  requireBrowserClientIdFromRuntime,
  requireBrowserSessionIdFromRuntime,
} from '../../../browser/runtimeContext.js';
import {
  consumeActionConfirmation,
  createActionConfirmation,
} from '../../../browser/actionConfirmation.js';

export const BROWSER_ACT_DESCRIPTION = `Perform an action in the active remote browser session.
Sensitive actions require explicit confirmationToken. If sessionId is omitted, the current embedded browserSession from context is used.`;

export const SENSITIVE_ACTION_PATTERN = /\b(submit|confirm|register|drop)\b/i;

export const browserActInputSchema = z.object({
  sessionId: z.string().min(1).optional(),
  action: z.string().min(1),
  confirmationToken: z.string().optional(),
});

export const browserActOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.unknown().optional(),
  needsConfirmation: z.boolean().optional(),
  confirmationRequiredFor: z.string().optional(),
  confirmationToken: z.string().optional(),
  confirmationExpiresAt: z.string().optional(),
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
    const ownerId = requireBrowserClientIdFromRuntime(runtimeContext);
    const sessionId = requireBrowserSessionIdFromRuntime(runtimeContext, context.sessionId);
    if (requiresConfirmation(context.action)) {
      if (!context.confirmationToken) {
        const confirmation = createActionConfirmation({
          userId: ownerId,
          sessionId,
          action: context.action,
        });

        return {
          success: false,
          needsConfirmation: true,
          confirmationRequiredFor: context.action,
          confirmationToken: confirmation.token,
          confirmationExpiresAt: confirmation.expiresAt,
          message:
            'This action may submit or alter records. Ask the user for explicit confirmation and pass confirmationToken before retrying.',
        };
      }

      consumeActionConfirmation({
        token: context.confirmationToken,
        userId: ownerId,
        sessionId,
        action: context.action,
      });
    }

    return runAct(sessionId, ownerId, context.action);
  },
});
