import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { cn } from 'cedar-os';

import MarkdownRenderer from '@/cedar/components/chatMessages/MarkdownRenderer';
import AskUserQuestionCard, {
  type AskUserQuestionPayload,
} from '@/cedar/components/chatMessages/AskUserQuestion';
import { ShimmerText } from '@/cedar/components/text/ShimmerText';
import { MessageRow } from './parts/MessageRow';
import { ToolPart, type ToolPartLike } from './parts/ToolPart';
import { ReasoningPart } from './parts/ReasoningPart';
import { SourcesRow, type SourceLike } from './parts/SourcesRow';
import { FilePart, type FilePartLike } from './parts/FilePart';
import { MessageActions } from './parts/MessageActions';
import type { SocChatMessage } from './useSocChat';

function isAskUserQuestionPayload(value: unknown): value is AskUserQuestionPayload {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<AskUserQuestionPayload>;
  return (
    typeof candidate.questionId === 'string' &&
    Array.isArray(candidate.questions) &&
    candidate.questions.every((question) => {
      if (typeof question !== 'object' || question === null) return false;
      const q = question as Partial<AskUserQuestionPayload['questions'][number]>;
      return (
        (q.id === undefined || typeof q.id === 'string') &&
        typeof q.question === 'string' &&
        typeof q.header === 'string' &&
        (q.isOther === undefined || typeof q.isOther === 'boolean') &&
        (q.isSecret === undefined || typeof q.isSecret === 'boolean') &&
        (q.options === undefined ||
          (Array.isArray(q.options) &&
            q.options.every((option) =>
              typeof option === 'object' &&
              option !== null &&
              typeof (option as { label?: unknown }).label === 'string' &&
              ((option as { description?: unknown }).description === undefined ||
                typeof (option as { description?: unknown }).description === 'string'),
            )))
      );
    })
  );
}

interface SocChatMessagesProps {
  messages: SocChatMessage[];
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  onRetry?: () => void | Promise<void>;
  className?: string;
}

type AnyPart = SocChatMessage['parts'][number];

const StreamingCaret: React.FC = () => (
  <span
    aria-hidden
    className="ml-0.5 inline-block h-4 w-[2px] translate-y-[2px] animate-pulse bg-foreground/70 align-middle"
  />
);

function getMessageText(message: SocChatMessage): string {
  return message.parts
    .filter((part): part is Extract<AnyPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function getCollapsedUserPromptLabel(text: string): string | null {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('Use Schedule Builder mode.')) {
    return 'used schedule builder';
  }
  if (trimmed.startsWith('Read the Degree Navigator extraction run ')) {
    return 'used degree navigator sync';
  }
  return null;
}

function isToolLikePart(part: AnyPart): part is AnyPart & ToolPartLike {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

interface AssistantBodyProps {
  message: SocChatMessage;
  isLastMessage: boolean;
  isStreaming: boolean;
}

const AssistantBody: React.FC<AssistantBodyProps> = ({
  message,
  isLastMessage,
  isStreaming,
}) => {
  const sources: SourceLike[] = [];
  const lastTextIndex = (() => {
    for (let i = message.parts.length - 1; i >= 0; i -= 1) {
      if (message.parts[i].type === 'text') return i;
    }
    return -1;
  })();
  const showCaretOnLastText = isLastMessage && isStreaming;

  const nodes: React.ReactNode[] = [];

  message.parts.forEach((part, index) => {
    if (part.type === 'text') {
      const isLastTextPart = index === lastTextIndex;
      nodes.push(
        <div
          key={`p-${index}`}
          className="text-[15px] leading-relaxed text-foreground [&>*+*]:mt-3"
        >
          <MarkdownRenderer content={part.text} processPrefix />
          {showCaretOnLastText && isLastTextPart && <StreamingCaret />}
        </div>,
      );
      return;
    }

    if (part.type === 'reasoning') {
      const reasoningPart = part as Extract<AnyPart, { type: 'reasoning' }>;
      nodes.push(
        <ReasoningPart
          key={`p-${index}`}
          text={reasoningPart.text}
          streaming={
            (reasoningPart.state ?? (isLastMessage && isStreaming ? 'streaming' : 'done')) ===
            'streaming'
          }
        />,
      );
      return;
    }

    if (part.type === 'file') {
      nodes.push(<FilePart key={`p-${index}`} part={part as FilePartLike} />);
      return;
    }

    if (part.type === 'source-url' || part.type === 'source-document') {
      sources.push(part as SourceLike);
      return;
    }

    if (isToolLikePart(part)) {
      nodes.push(<ToolPart key={`p-${index}`} part={part as ToolPartLike} />);
      return;
    }

    if (part.type === 'data-ask_user_question') {
      const data = (part as { data?: unknown }).data;
      if (isAskUserQuestionPayload(data)) {
        nodes.push(<AskUserQuestionCard key={`p-${index}`} payload={data} />);
      }
      return;
    }

    // step-start, other data-* and unknown parts are intentionally ignored.
  });

  // If we only have the streaming caret and nothing else (i.e. assistant just
  // started but no text yet), surface a Thinking shimmer so the row isn't blank.
  const hasVisibleContent = nodes.length > 0;
  if (!hasVisibleContent && isLastMessage && isStreaming) {
    nodes.push(
      <div key="thinking" className="py-1">
        <ShimmerText text="Thinking..." state="thinking" />
      </div>,
    );
  }

  return (
    <div className="space-y-2">
      {nodes}
      {sources.length > 0 && <SourcesRow sources={sources} />}
    </div>
  );
};

interface UserBodyProps {
  message: SocChatMessage;
}

interface CollapsedUserPromptCardProps {
  text: string;
  label: string;
}

const CollapsedUserPromptCard: React.FC<CollapsedUserPromptCardProps> = ({ text, label }) => {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="rounded-xl border border-action/30 bg-action/10 text-left shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm',
          'text-foreground transition-colors hover:bg-action/10',
        )}
      >
        <ChevronRight
          className={cn('h-3.5 w-3.5 flex-shrink-0 transition-transform', open && 'rotate-90')}
          strokeWidth={2.25}
        />
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-action/15 text-action">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
        <span className="font-medium">{label}</span>
      </button>
      {open && (
        <div className="border-t border-action/20 px-3 pb-3 pt-2">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border-subtle bg-surface-1/80 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
};

const UserBody: React.FC<UserBodyProps> = ({ message }) => {
  return (
    <div className="space-y-2">
      {message.parts.map((part, index) => {
        if (part.type === 'text') {
          const collapsedLabel = getCollapsedUserPromptLabel(part.text);
          if (collapsedLabel) {
            return (
              <CollapsedUserPromptCard
                key={index}
                text={part.text}
                label={collapsedLabel}
              />
            );
          }

          return (
            <div key={index} className="whitespace-pre-wrap break-words">
              {part.text}
            </div>
          );
        }
        if (part.type === 'file') {
          return <FilePart key={index} part={part as FilePartLike} />;
        }
        return null;
      })}
    </div>
  );
};

export const SocChatMessages: React.FC<SocChatMessagesProps> = ({
  messages,
  status,
  onRetry,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isWaiting = status === 'submitted';
  const isStreaming = status === 'streaming';

  useLayoutEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, isWaiting, isStreaming]);

  const lastMessageId = messages[messages.length - 1]?.id;
  const lastAssistantId = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'assistant') return messages[i].id;
    }
    return undefined;
  })();

  return (
    <div
      ref={containerRef}
      className={cn(
        'h-full w-full overflow-x-hidden overflow-y-auto',
        className,
      )}
      style={{ contain: 'paint layout', scrollbarColor: 'rgba(126, 138, 153, 0.6) transparent' }}
    >
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-6">
        <AnimatePresence initial={false}>
          {messages.map((message, messageIndex) => {
            const previousMessage = messages[messageIndex - 1];
            const isFirstInGroup = previousMessage?.role !== message.role;
            const isLastMessage = message.id === lastMessageId;
            const isLastAssistant = message.id === lastAssistantId;
            const role = message.role === 'system' ? 'assistant' : message.role;

            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <MessageRow role={role} isFirstInGroup={isFirstInGroup}>
                  {role === 'user' ? (
                    <UserBody message={message} />
                  ) : (
                    <>
                      <AssistantBody
                        message={message}
                        isLastMessage={isLastMessage}
                        isStreaming={isStreaming}
                      />
                      {!(isLastMessage && isStreaming) && isLastAssistant && (
                        <MessageActions
                          text={getMessageText(message)}
                          onRetry={onRetry}
                        />
                      )}
                    </>
                  )}
                </MessageRow>
              </motion.div>
            );
          })}

          {isWaiting && (
            <motion.div
              key="pending-assistant"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <MessageRow role="assistant" isFirstInGroup>
                <div className="py-1">
                  <ShimmerText text="Thinking..." state="thinking" />
                </div>
              </MessageRow>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
