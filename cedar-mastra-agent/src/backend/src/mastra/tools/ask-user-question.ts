import { createTool } from '@mastra/core/tools';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { streamJSONEvent } from '../../utils/streamUtils.js';

/**
 * AskUserQuestion - Structured clarification tool
 *
 * Mirrors Claude Code `AskUserQuestion` and Codex `request_user_input` while
 * preserving this app's two-turn chat architecture. Each tool call asks 1-4
 * structured questions. Each emitted question has a stable id, short header,
 * user-facing question text, optional multi-select, optional free-text Other,
 * optional secret input, and optional 2-4 label+description choices.
 *
 * Behavior contract:
 * - This is a TWO-TURN tool. Calling it emits an `ask_user_question` UI event
 *   into the Cedar chat and returns IMMEDIATELY with `{ status: "asked" }`.
 * - The agent MUST end its turn after calling. The user's selection arrives
 *   as the next user message. The user-visible transcript is concise, while a
 *   model-only context message carries structured answers keyed by question id.
 */
export const ASK_USER_QUESTION_DESCRIPTION = `Ask the user 1-4 structured questions when user input would materially affect the answer, plan, or next action.

When to use:
- Multiple valid approaches and the user should choose between meaningful trade-offs.
- Confirming an important assumption that cannot be resolved through non-mutating exploration.
- Collecting product intent, preference, or missing context that materially changes what you do.

When NOT to use:
- Do not ask questions that can be answered from the repo, system, activeSchedule, saved profile, docs, configs, schemas, types, constants, or chat history. Explore first, ask second.
- Do not ask for plan approval, "Should I proceed?", or questions referring to hidden plan content.
- Do not ask trivial yes/no questions when the user has effectively already answered.
- Do not use this for Rutgers passwords or credentials.
- Do not call this in non-interactive contexts.

Constraints:
- 1-4 questions per call; prefer 1-2 unless batching avoids repeated interruptions.
- Each question needs a stable id (optional; q1/q2 are generated if omitted), header <= 12 chars, and clear user-facing question text ending with "?".
- If options are present, provide 2-4 plausible, actionable, meaningfully different choices. No filler, joke, fake, or obviously inferior options.
- Every option must include a concise label and one-sentence description explaining consequence/trade-off.
- If you recommend/default an option, put it first and append "(Recommended)" to the label.
- Use multiSelect only when multiple answers can legitimately apply.
- Do NOT manually include an "Other" option. Use isOther (default true) to enable custom text; custom text is returned as the answer value.
- Use isSecret only for sensitive free-text input when absolutely necessary. Secret values are redacted in visible transcript and sent only through model-only context.
- After calling this tool you MUST end your turn. Do not generate text or call other tools.
- The user's next message will include a visible summary. Model-only context may include an [AskUserQuestion answers] JSON block keyed by per-question id; use that as authoritative.`;

const questionIdSchema = z
  .string()
  .min(1, 'Question id cannot be empty')
  .max(48, 'Question id must be 48 characters or fewer')
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_-]*$/,
    'Question id must start with a letter and contain only letters, numbers, "_" or "-".',
  );

const previewSchema = z.object({
  format: z
    .enum(['markdown', 'html'])
    .describe('Preview format. HTML is sanitized/rejected by the frontend before rendering.'),
  content: z
    .string()
    .min(1, 'Preview content cannot be empty')
    .max(4000, 'Preview content must be 4000 characters or fewer'),
});

const optionSchema = z.object({
  label: z
    .string()
    .min(1, 'Option label cannot be empty')
    .max(60, 'Option label must be 60 characters or fewer')
    .describe('Short, specific choice label shown to the user (1-5 words).'),
  description: z
    .string()
    .min(1, 'Option description cannot be empty')
    .max(200, 'Option description must be 200 characters or fewer')
    .describe(
      'One concise sentence explaining what this option means or its trade-off.',
    ),
  preview: previewSchema.optional(),
});

const questionSchema = z
  .object({
    id: questionIdSchema.optional().describe('Stable per-question id used as answer key.'),
    question: z
      .string()
      .min(1, 'Question text cannot be empty')
      .max(300, 'Question text must be 300 characters or fewer')
      .regex(/\?$/, 'Question text must end with "?".')
      .describe('Full user-facing question text shown above the option list. Must end with "?".'),
    header: z
      .string()
      .min(1, 'Header cannot be empty')
      .max(12, 'Header must be 12 characters or fewer')
      .describe(
        'Short label (<=12 chars) shown as a chip above the question. Example: "Backend", "Storage", "Scope".',
      ),
    multiSelect: z
      .boolean()
      .optional()
      .describe(
        'When true, the user can pick multiple options. Use only when options are not mutually exclusive.',
      ),
    isOther: z
      .boolean()
      .optional()
      .describe('When true, show a free-text custom answer path. Defaults to true.'),
    isSecret: z
      .boolean()
      .optional()
      .describe('When true, collect sensitive free text with visible transcript redaction.'),
    options: z
      .array(optionSchema)
      .min(2, 'Each question with options needs at least 2 options')
      .max(4, 'Each question can have at most 4 options')
      .optional(),
  })
  .superRefine((question, ctx) => {
    const isOther = question.isOther ?? true;
    const isSecret = question.isSecret ?? false;
    const hasOptions = Array.isArray(question.options) && question.options.length > 0;

    if (!hasOptions && !isOther && !isSecret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message:
          'Provide 2-4 options, or enable isOther/isSecret for free-text input.',
      });
    }

    if (isSecret && hasOptions) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isSecret'],
        message: 'Secret questions must use free text, not multiple-choice options.',
      });
    }

    if (isSecret && question.multiSelect) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['multiSelect'],
        message: 'Secret free-text questions cannot be multi-select.',
      });
    }
  });

export const askUserQuestionInputSchema = z.object({
  questions: z
    .array(questionSchema)
    .min(1, 'Provide at least 1 question')
    .max(4, 'Provide at most 4 questions per call'),
});

export const askUserQuestionOutputSchema = z.object({
  status: z.literal('asked'),
  questionId: z.string(),
  instruction: z.string(),
});

type StreamControllerLike =
  | ReadableStreamDefaultController<Uint8Array>
  | {
      writeDataEvent: (eventType: string, eventData: unknown) => void;
    };

type RuntimeContextLike = {
  get: (key: string) => unknown;
};

function getStreamController(
  runtimeContext: RuntimeContextLike,
): StreamControllerLike | null {
  const controller = runtimeContext.get('streamController');
  if (!controller) {
    return null;
  }
  return controller as StreamControllerLike;
}

export type AskUserQuestionInput = z.infer<typeof askUserQuestionInputSchema>;
export type AskUserQuestionOutput = z.infer<typeof askUserQuestionOutputSchema>;
export type AskUserQuestionOption = z.infer<typeof optionSchema>;
export type AskUserQuestionQuestion = z.infer<typeof questionSchema>;

export interface NormalizedAskUserQuestionQuestion {
  id: string;
  question: string;
  header: string;
  multiSelect?: boolean;
  isOther: boolean;
  isSecret: boolean;
  options?: AskUserQuestionOption[];
}

export interface AskUserQuestionEventPayload {
  questionId: string;
  questions: NormalizedAskUserQuestionQuestion[];
}

function normalizeQuestionIds(
  questions: AskUserQuestionInput['questions'],
): NormalizedAskUserQuestionQuestion[] {
  const seenIds = new Set<string>();

  return questions.map((question, index) => {
    const id = question.id ?? `q${index + 1}`;
    if (seenIds.has(id)) {
      throw new Error(`Duplicate askUserQuestion question id "${id}".`);
    }
    seenIds.add(id);

    return {
      id,
      question: question.question,
      header: question.header,
      multiSelect: question.multiSelect,
      isOther: question.isOther ?? true,
      isSecret: question.isSecret ?? false,
      options: question.options,
    };
  });
}

function requireSecretAnswerSupport(
  normalizedQuestions: NormalizedAskUserQuestionQuestion[],
  runtimeContext: RuntimeContextLike,
) {
  if (!normalizedQuestions.some((question) => question.isSecret)) {
    return;
  }

  if (runtimeContext.get('supportsHiddenAskUserQuestionAnswers') === true) {
    return;
  }

  throw new Error(
    'askUserQuestion secret input requires hidden answer transport support. Do not ask for secrets in this context.',
  );
}

export async function runAskUserQuestion(
  input: AskUserQuestionInput,
  runtimeContext: RuntimeContextLike,
): Promise<AskUserQuestionOutput> {
  const controller = getStreamController(runtimeContext);
  if (!controller) {
    throw new Error(
      'askUserQuestion requires a Cedar stream controller. This tool only works inside an active chat stream.',
    );
  }

  const questionId = randomUUID();
  const normalizedQuestions = normalizeQuestionIds(input.questions);
  requireSecretAnswerSupport(normalizedQuestions, runtimeContext);

  const payload: AskUserQuestionEventPayload = {
    questionId,
    questions: normalizedQuestions,
  };

  streamJSONEvent(controller, 'ask_user_question', payload, { transient: false });

  return {
    status: 'asked' as const,
    questionId,
    instruction:
      'Question shown to the user. End your turn now and do not generate any more text or tool calls. The next user turn will include a visible summary, with structured answers available in model-only context keyed by per-question id.',
  };
}

export const askUserQuestion = createTool({
  id: 'askUserQuestion',
  description: ASK_USER_QUESTION_DESCRIPTION,
  inputSchema: askUserQuestionInputSchema,
  outputSchema: askUserQuestionOutputSchema,
  execute: async ({ context, runtimeContext }) =>
    runAskUserQuestion(context, runtimeContext as RuntimeContextLike),
});
