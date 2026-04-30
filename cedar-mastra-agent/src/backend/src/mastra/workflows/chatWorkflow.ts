// ---------------------------------------------
// Workflows are a Mastra primitive to orchestrate agents and complex sequences of tasks
// Docs: https://mastra.ai/en/docs/workflows/overview
// ---------------------------------------------

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { RuntimeContext } from '@mastra/core/di';
import { z } from 'zod';
import { socAgent } from '../agents/soc-agent';
import { handleTextStream, streamJSONEvent } from '../../utils/streamUtils';
import { ActionSchema } from './chatWorkflowTypes';

export const ChatInputSchema = z.object({
  prompt: z.string(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  streamController: z.instanceof(ReadableStreamDefaultController).optional(),
  additionalContext: z.any().optional(),
  resourceId: z.string().optional(),
  threadId: z.string().optional(),
  authenticatedUserId: z.string().optional(),
});

export const ChatOutputSchema = z.object({
  content: z.string(),
  // TODO: Add any structured output fields your application needs
  object: ActionSchema.optional(),
  usage: z.any().optional(),
});

export type ChatOutput = z.infer<typeof ChatOutputSchema>;

type AdditionalContextEntry = {
  data?: unknown;
};

type AdditionalContextMap = Record<string, AdditionalContextEntry | AdditionalContextEntry[] | unknown>;

const MODEL_VISIBLE_CONTEXT_KEYS = ['mainText', 'browserClientId', 'browserSession', 'activeSchedule'] as const;

function readAdditionalContextValue(entry: unknown): unknown {
  if (!entry) {
    return undefined;
  }

  const first = Array.isArray(entry) ? entry[0] : entry;
  if (!first || typeof first !== 'object') {
    return first;
  }

  const record = first as AdditionalContextEntry;
  return record.data ?? first;
}

export function buildModelVisibleAdditionalContext(additionalContext: unknown): Record<string, unknown> {
  if (!additionalContext || typeof additionalContext !== 'object') {
    return {};
  }

  const context = additionalContext as AdditionalContextMap;
  const compactContext: Record<string, unknown> = {};

  for (const key of MODEL_VISIBLE_CONTEXT_KEYS) {
    const value = readAdditionalContextValue(context[key]);
    if (value !== undefined) {
      compactContext[key] = value;
    }
  }

  return compactContext;
}

const callAgent = createStep({
  id: 'callAgent',
  description: 'Invoke the chat agent with the user prompt using stream',
  inputSchema: ChatInputSchema,
  outputSchema: ChatOutputSchema,
  execute: async ({ inputData }) => {
    const {
      prompt,
      temperature,
      maxTokens,
      streamController,
      additionalContext,
      resourceId,
      threadId,
      authenticatedUserId,
    } = inputData;

    if (!streamController) {
      throw new Error('Stream controller is required');
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('Chat workflow received request', {
        promptLength: prompt.length,
        hasAdditionalContext: Boolean(additionalContext),
        resourceId,
        threadId,
      });
    }

    // Create runtime context with additionalContext and streamController
    const runtimeContext = new RuntimeContext();
    runtimeContext.set('additionalContext', additionalContext);
    runtimeContext.set('streamController', streamController);
    runtimeContext.set('authenticatedUserId', authenticatedUserId);

    const modelVisibleAdditionalContext = buildModelVisibleAdditionalContext(additionalContext);
    const messages = [
      'User message: ' + prompt,
      'Additional context (for background knowledge): ' + JSON.stringify(modelVisibleAdditionalContext),
    ];

    let responseText = '';
    /**
     * Using Mastra stream for enhanced streaming capabilities.
     * stream returns a stream result that we can iterate over to get chunks
     * and properly handle different event types such as text-delta, tool calls, etc.
     */
    const streamResult = await socAgent.stream(messages, {
      maxSteps: 50,
      modelSettings: {
        temperature,
        maxOutputTokens: maxTokens,
      },
      runtimeContext,
      ...(threadId && resourceId
        ? {
            memory: {
              thread: threadId,
              resource: resourceId,
            },
          }
        : {}),
    });

    for await (const chunk of streamResult.fullStream) {
      if (chunk.type === 'text-delta') {
        await handleTextStream(chunk.payload.text, streamController);
        responseText += chunk.payload.text;
      } else if (chunk.type === 'tool-result' || chunk.type === 'tool-call') {
        streamJSONEvent(streamController, chunk.type, chunk);
      }
    }

    const usage = await streamResult.usage;

    if (process.env.NODE_ENV !== 'production') {
      console.log('Chat workflow result', {
        contentLength: responseText.length,
        usage,
      });
    }

    return {
      content: responseText,
      usage: usage,
    };
  },
});

export const chatWorkflow = createWorkflow({
  id: 'chatWorkflow',
  description: 'Chat workflow that handles agent interactions with optional streaming support',
  inputSchema: ChatInputSchema,
  outputSchema: ChatOutputSchema,
})
  .then(callAgent)
  .commit();
