import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  askUserQuestion,
  askUserQuestionInputSchema,
  runAskUserQuestion,
  type AskUserQuestionEventPayload,
} from '../mastra/tools/ask-user-question.js';

type CapturedEvent = {
  eventType: string;
  eventData: unknown;
  options?: { transient?: boolean };
};

function makeRuntimeContext(
  events: CapturedEvent[],
  options: { supportsHiddenAnswers?: boolean } = {},
) {
  return {
    get: (key: string) => {
      if (key === 'supportsHiddenAskUserQuestionAnswers') {
        return options.supportsHiddenAnswers ?? false;
      }
      if (key === 'streamController') {
        return {
          writeDataEvent: (
            eventType: string,
            eventData: unknown,
            options?: { transient?: boolean },
          ) => {
            events.push({ eventType, eventData, options });
          },
        };
      }
      return undefined;
    },
  };
}

const VALID_INPUT = {
  questions: [
    {
      question: 'Which schedule footprint should I focus on?',
      header: 'Footprint',
      multiSelect: false,
      options: [
        {
          label: 'MWF mornings',
          description: 'Mostly Monday/Wednesday/Friday 8-12.',
        },
        {
          label: 'Tue/Thu only',
          description: 'Compress classes into two long days.',
        },
      ],
    },
  ],
};

describe('askUserQuestion tool', () => {
  it('exposes a Mastra tool with the expected id and schemas', () => {
    assert.equal(askUserQuestion.id, 'askUserQuestion');
    assert.ok(askUserQuestion.inputSchema);
    assert.ok(askUserQuestion.outputSchema);
  });

  it('accepts a well-formed question payload', () => {
    const parsed = askUserQuestionInputSchema.safeParse(VALID_INPUT);
    assert.equal(parsed.success, true);
  });

  it('rejects more than 4 questions', () => {
    const tooMany = {
      questions: Array.from({ length: 5 }, (_, i) => ({
        question: `Which option should I use for question ${i}?`,
        header: `H${i}`,
        options: [
          { label: 'A', description: 'Use option A.' },
          { label: 'B', description: 'Use option B.' },
        ],
      })),
    };
    const result = askUserQuestionInputSchema.safeParse(tooMany);
    assert.equal(result.success, false);
  });

  it('rejects headers longer than 12 characters', () => {
    const result = askUserQuestionInputSchema.safeParse({
      questions: [
        {
          question: 'Which option should I pick?',
          header: 'this-header-is-way-too-long',
          options: [
            { label: 'A', description: 'Use option A.' },
            { label: 'B', description: 'Use option B.' },
          ],
        },
      ],
    });
    assert.equal(result.success, false);
  });

  it('rejects questions with fewer than 2 options', () => {
    const result = askUserQuestionInputSchema.safeParse({
      questions: [
        {
          question: 'Which option should I pick?',
          header: 'pick',
          options: [{ label: 'A', description: 'Use option A.' }],
        },
      ],
    });
    assert.equal(result.success, false);
  });

  it('rejects questions with more than 4 options', () => {
    const result = askUserQuestionInputSchema.safeParse({
      questions: [
        {
          question: 'Which option should I pick?',
          header: 'pick',
          options: [
            { label: 'A', description: 'Use option A.' },
            { label: 'B', description: 'Use option B.' },
            { label: 'C', description: 'Use option C.' },
            { label: 'D', description: 'Use option D.' },
            { label: 'E', description: 'Use option E.' },
          ],
        },
      ],
    });
    assert.equal(result.success, false);
  });

  it('rejects question text that does not end with a question mark', () => {
    const result = askUserQuestionInputSchema.safeParse({
      questions: [
        {
          question: 'Choose a schedule footprint',
          header: 'Footprint',
          options: [
            { label: 'A', description: 'Use option A.' },
            { label: 'B', description: 'Use option B.' },
          ],
        },
      ],
    });
    assert.equal(result.success, false);
  });

  it('requires option descriptions', () => {
    const result = askUserQuestionInputSchema.safeParse({
      questions: [
        {
          question: 'Which option should I pick?',
          header: 'Choice',
          options: [{ label: 'A' }, { label: 'B' }],
        },
      ],
    });
    assert.equal(result.success, false);
  });

  it('allows free-text-only questions when Other is enabled', () => {
    const result = askUserQuestionInputSchema.safeParse({
      questions: [
        {
          question: 'What project name should I use?',
          header: 'Name',
          isOther: true,
        },
      ],
    });
    assert.equal(result.success, true);
  });

  it('rejects questions with no answer path', () => {
    const result = askUserQuestionInputSchema.safeParse({
      questions: [
        {
          question: 'What project name should I use?',
          header: 'Name',
          isOther: false,
        },
      ],
    });
    assert.equal(result.success, false);
  });

  it('emits a non-transient ask_user_question event and returns asked', async () => {
    const events: CapturedEvent[] = [];
    const runtimeContext = makeRuntimeContext(events);

    const result = await runAskUserQuestion(VALID_INPUT, runtimeContext);

    assert.equal(result.status, 'asked');
    assert.equal(typeof result.questionId, 'string');
    assert.ok(result.questionId.length > 0);
    assert.match(result.instruction, /End your turn/);

    assert.equal(events.length, 1);
    const [event] = events;
    assert.equal(event.eventType, 'ask_user_question');
    assert.deepEqual(event.options, { transient: false });

    const data = event.eventData as AskUserQuestionEventPayload;
    assert.equal(data.questionId, result.questionId);
    assert.equal(data.questions.length, 1);
    assert.equal(data.questions[0].id, 'q1');
    assert.equal(data.questions[0].header, 'Footprint');
    assert.equal(data.questions[0].isOther, true);
    assert.equal(data.questions[0].isSecret, false);
    assert.equal(data.questions[0].options?.length, 2);
  });

  it('preserves caller-provided question ids', async () => {
    const events: CapturedEvent[] = [];
    const runtimeContext = makeRuntimeContext(events);

    await runAskUserQuestion(
      {
        questions: [
          {
            ...VALID_INPUT.questions[0],
            id: 'priority',
          },
        ],
      },
      runtimeContext,
    );

    const data = events[0].eventData as AskUserQuestionEventPayload;
    assert.equal(data.questions[0].id, 'priority');
  });

  it('rejects duplicate normalized question ids', async () => {
    const events: CapturedEvent[] = [];
    const runtimeContext = makeRuntimeContext(events);

    await assert.rejects(
      runAskUserQuestion(
        {
          questions: [
            { ...VALID_INPUT.questions[0], id: 'q2' },
            { ...VALID_INPUT.questions[0], header: 'Second' },
          ],
        },
        runtimeContext,
      ),
      /Duplicate askUserQuestion question id/,
    );
  });

  it('rejects secret questions without hidden answer transport', async () => {
    const events: CapturedEvent[] = [];
    const runtimeContext = makeRuntimeContext(events);

    await assert.rejects(
      runAskUserQuestion(
        {
          questions: [
            {
              id: 'token',
              question: 'What API token should I use?',
              header: 'Token',
              isSecret: true,
            },
          ],
        },
        runtimeContext,
      ),
      /hidden answer transport/i,
    );
    assert.equal(events.length, 0);
  });

  it('emits secret questions when hidden answer transport is available', async () => {
    const events: CapturedEvent[] = [];
    const runtimeContext = makeRuntimeContext(events, { supportsHiddenAnswers: true });

    await runAskUserQuestion(
      {
        questions: [
          {
            id: 'token',
            question: 'What API token should I use?',
            header: 'Token',
            isSecret: true,
          },
        ],
      },
      runtimeContext,
    );

    const data = events[0].eventData as AskUserQuestionEventPayload;
    assert.equal(data.questions[0].id, 'token');
    assert.equal(data.questions[0].isSecret, true);
    assert.equal(data.questions[0].options, undefined);
  });

  it('generates a fresh questionId on each call', async () => {
    const events: CapturedEvent[] = [];
    const runtimeContext = makeRuntimeContext(events);

    const first = await runAskUserQuestion(VALID_INPUT, runtimeContext);
    const second = await runAskUserQuestion(VALID_INPUT, runtimeContext);

    assert.notEqual(first.questionId, second.questionId);
    assert.equal(events.length, 2);
    assert.notEqual(
      (events[0].eventData as AskUserQuestionEventPayload).questionId,
      (events[1].eventData as AskUserQuestionEventPayload).questionId,
    );
  });

  it('throws a clear error when no stream controller is bound', async () => {
    const runtimeContext = { get: () => undefined };
    await assert.rejects(
      runAskUserQuestion(VALID_INPUT, runtimeContext),
      /stream controller/i,
    );
  });
});
