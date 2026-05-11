'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { cn } from 'cedar-os';

import { dispatchCedarPrompt } from '@/cedar/promptBridge';
import MarkdownRenderer from './MarkdownRenderer';

export interface AskUserQuestionOption {
  label: string;
  description?: string;
  preview?: {
    format: 'markdown' | 'html';
    content: string;
  };
}

export interface AskUserQuestionItem {
  id?: string;
  question: string;
  header: string;
  multiSelect?: boolean;
  isOther?: boolean;
  isSecret?: boolean;
  options?: AskUserQuestionOption[];
}

export interface AskUserQuestionPayload {
  questionId: string;
  questions: AskUserQuestionItem[];
}

interface AskUserQuestionCardProps {
  payload: AskUserQuestionPayload;
}

interface QuestionState {
  selected: string[];
  otherActive: boolean;
  otherText: string;
}

type NormalizedAskUserQuestionItem = AskUserQuestionItem & {
  id: string;
  isOther: boolean;
  isSecret: boolean;
};

const OTHER_LABEL = 'Other…';
const SECRET_LABEL = '[secret provided]';

function defaultStateFor(question: NormalizedAskUserQuestionItem): QuestionState {
  return {
    selected: [],
    otherActive:
      question.isSecret || (!question.options || question.options.length === 0),
    otherText: '',
  };
}

function summarizeSelected(
  question: NormalizedAskUserQuestionItem,
  state: QuestionState,
): string[] {
  const values = [...state.selected];
  if (state.otherActive && state.otherText.trim().length > 0) {
    values.push(state.otherText.trim());
  }
  return values;
}

function formatHumanSummary(
  questions: NormalizedAskUserQuestionItem[],
  perQuestion: Map<number, string[]>,
): string {
  const summary = questions
    .map((q, idx) => {
      const values = perQuestion.get(idx) ?? [];
      if (values.length === 0) {
        return `${q.header} -> (skipped)`;
      }
      const displayValues = q.isSecret ? [SECRET_LABEL] : values;
      return `${q.header} -> ${displayValues.join(', ')}`;
    })
    .join('; ');
  return `User answered: ${summary}`;
}

interface AskUserQuestionAnswerPayload {
  questionId: string;
  questions: Array<{ id: string; header: string; question: string }>;
  answers: Record<string, { answers: string[] }>;
}

function formatMachineBlock(
  questionId: string,
  questions: NormalizedAskUserQuestionItem[],
  perQuestion: Map<number, string[]>,
): string {
  const answerPayload: AskUserQuestionAnswerPayload = {
    questionId,
    questions: questions.map((q) => ({
      id: q.id,
      header: q.header,
      question: q.question,
    })),
    answers: Object.fromEntries(
      questions.map((q, idx) => [
        q.id,
        { answers: perQuestion.get(idx) ?? [] },
      ]),
    ),
  };
  return `[AskUserQuestion answers] ${JSON.stringify(answerPayload)}`;
}

function isRecommendedOption(
  question: NormalizedAskUserQuestionItem,
  option: AskUserQuestionOption,
) {
  return (
    question.options?.[0]?.label === option.label &&
    option.label.endsWith('(Recommended)')
  );
}

function isUnsafeHtmlPreview(content: string): boolean {
  return /<\s*(script|style)\b/i.test(content) || /<!doctype/i.test(content);
}

const OptionPreview: React.FC<{ option: AskUserQuestionOption }> = ({ option }) => {
  if (!option.preview) return null;

  if (option.preview.format === 'markdown') {
    return (
      <div className="mt-2 rounded-md border border-border bg-surface-1 px-2 py-1.5 text-xs text-muted-foreground">
        <MarkdownRenderer content={option.preview.content} />
      </div>
    );
  }

  if (isUnsafeHtmlPreview(option.preview.content)) {
    return (
      <div className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-warning">
        HTML preview rejected because it contains unsafe tags.
      </div>
    );
  }

  return (
    <div
      className="mt-2 rounded-md border border-border bg-surface-1 px-2 py-1.5 text-xs text-muted-foreground"
      dangerouslySetInnerHTML={{ __html: option.preview.content }}
    />
  );
};

const ANSWERED_STORAGE_KEY = 'ask_user_question:answered';

function loadAnsweredIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(ANSWERED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((value): value is string => typeof value === 'string'));
    }
  } catch {
    // ignore
  }
  return new Set();
}

function persistAnsweredId(questionId: string) {
  if (typeof window === 'undefined') return;
  try {
    const current = loadAnsweredIds();
    current.add(questionId);
    window.sessionStorage.setItem(
      ANSWERED_STORAGE_KEY,
      JSON.stringify(Array.from(current)),
    );
  } catch {
    // ignore
  }
}

export const AskUserQuestionCard: React.FC<AskUserQuestionCardProps> = ({ payload }) => {
  const { questionId } = payload;
  const questions = React.useMemo<NormalizedAskUserQuestionItem[]>(
    () =>
      payload.questions.map((question, index) => ({
        ...question,
        id: question.id ?? `q${index + 1}`,
        isOther: question.isOther ?? true,
        isSecret: question.isSecret ?? false,
      })),
    [payload.questions],
  );
  const [states, setStates] = React.useState<QuestionState[]>(() =>
    questions.map(defaultStateFor),
  );
  const [answered, setAnswered] = React.useState<boolean>(() =>
    loadAnsweredIds().has(questionId),
  );
  const [submittedSummary, setSubmittedSummary] = React.useState<string | null>(null);

  const updateState = React.useCallback(
    (index: number, mutate: (state: QuestionState) => QuestionState) => {
      setStates((prev) => {
        const next = prev.slice();
        next[index] = mutate(prev[index]);
        return next;
      });
    },
    [],
  );

  const handleToggle = React.useCallback(
    (qIdx: number, label: string) => {
      if (answered) return;
      const question = questions[qIdx];
      updateState(qIdx, (state) => {
        if (question.multiSelect) {
          const exists = state.selected.includes(label);
          return {
            ...state,
            selected: exists
              ? state.selected.filter((value) => value !== label)
              : [...state.selected, label],
          };
        }
        return { ...state, selected: [label], otherActive: false };
      });
    },
    [answered, questions, updateState],
  );

  const handleToggleOther = React.useCallback(
    (qIdx: number) => {
      if (answered) return;
      if (!questions[qIdx]?.isOther && !questions[qIdx]?.isSecret) return;
      updateState(qIdx, (state) => {
        const otherActive = !state.otherActive;
        return {
          ...state,
          otherActive,
          selected: otherActive && !questions[qIdx].multiSelect ? [] : state.selected,
        };
      });
    },
    [answered, questions, updateState],
  );

  const handleOtherText = React.useCallback(
    (qIdx: number, value: string) => {
      if (answered) return;
      updateState(qIdx, (state) => ({ ...state, otherText: value }));
    },
    [answered, updateState],
  );

  const allAnsweredLocally = React.useMemo(() => {
    return states.every((state, idx) => {
      const summary = summarizeSelected(questions[idx], state);
      return summary.length > 0;
    });
  }, [questions, states]);

  const handleSubmit = React.useCallback(() => {
    if (answered) return;
    const perQuestion = new Map<number, string[]>();
    questions.forEach((q, idx) => {
      perQuestion.set(idx, summarizeSelected(q, states[idx]));
    });

    const human = formatHumanSummary(questions, perQuestion);
    const hiddenModelContext = formatMachineBlock(questionId, questions, perQuestion);

    setSubmittedSummary(human);
    setAnswered(true);
    persistAnsweredId(questionId);
    dispatchCedarPrompt(human, hiddenModelContext);
  }, [answered, questionId, questions, states]);

  return (
    <div className="w-full rounded-lg border border-border bg-surface-1 px-4 py-3 shadow-elev-1">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Question for you
        </span>
        {answered && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
            <Check className="h-3 w-3" />
            Submitted
          </span>
        )}
      </div>

      <div className="space-y-4">
        {questions.map((question, qIdx) => {
          const state = states[qIdx];
          const options = question.options ?? [];
          const showOtherToggle = question.isOther && !question.isSecret && options.length > 0;
          const showFreeTextInput =
            question.isSecret || state.otherActive || options.length === 0;
          return (
            <fieldset key={question.id} className="space-y-2" disabled={answered}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="inline-flex items-center rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {question.header}
                </span>
                <legend className="text-sm font-medium text-foreground">
                  {question.question}
                </legend>
                {question.multiSelect && (
                  <span className="text-[11px] text-muted-foreground">(choose any)</span>
                )}
              </div>

              <div className="space-y-1.5">
                {options.map((option) => {
                  const isSelected = state.selected.includes(option.label);
                  const isRecommended = isRecommendedOption(question, option);
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => handleToggle(qIdx, option.label)}
                      disabled={answered}
                      className={cn(
                        'focus-ring flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition',
                        isSelected
                          ? 'border-primary/50 bg-primary/10 text-foreground'
                          : isRecommended
                            ? 'border-primary/30 bg-primary/5 hover:bg-primary/10 text-foreground'
                            : 'border-border bg-surface-0 hover:bg-surface-2 text-foreground',
                        answered && 'cursor-default opacity-80',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center border',
                          question.multiSelect ? 'rounded-sm' : 'rounded-full',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-surface-0',
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
                          {option.label}
                          {isRecommended && (
                            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                              Default
                            </span>
                          )}
                        </span>
                        {option.description && (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        )}
                        <OptionPreview option={option} />
                      </span>
                    </button>
                  );
                })}

                {showOtherToggle && (
                  <button
                    type="button"
                    onClick={() => handleToggleOther(qIdx)}
                    disabled={answered}
                    className={cn(
                      'focus-ring flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition',
                      state.otherActive
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-border bg-surface-0 hover:bg-surface-2',
                      answered && 'cursor-default opacity-80',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center border',
                        question.multiSelect ? 'rounded-sm' : 'rounded-full',
                        state.otherActive
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-surface-0',
                      )}
                    >
                      {state.otherActive && <Check className="h-3 w-3" />}
                    </span>
                    <span className="font-medium text-foreground">{OTHER_LABEL}</span>
                  </button>
                )}

                {showFreeTextInput && (
                  <div className="space-y-1">
                    {question.isSecret && (
                      <span className="text-[11px] text-muted-foreground">
                        Secret input is redacted from the visible chat transcript.
                      </span>
                    )}
                    <input
                      type={question.isSecret ? 'password' : 'text'}
                      value={state.otherText}
                      onChange={(event) => handleOtherText(qIdx, event.target.value)}
                      placeholder={
                        question.isSecret ? 'Enter secret value' : 'Type your answer'
                      }
                      disabled={answered}
                      autoComplete={question.isSecret ? 'off' : undefined}
                      className="focus-ring w-full rounded-md border border-border bg-surface-0 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                )}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {!answered && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allAnsweredLocally}
            className="focus-ring inline-flex h-8 items-center justify-center rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            Submit
          </button>
        )}
        {answered && submittedSummary && (
          <span className="text-xs text-muted-foreground">{submittedSummary}</span>
        )}
      </div>
    </div>
  );
};

export default AskUserQuestionCard;
