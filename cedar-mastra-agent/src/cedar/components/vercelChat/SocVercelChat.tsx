import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';

import { SocChatInput } from './SocChatInput';
import { SocChatMessages } from './SocChatMessages';
import { useSocChat } from './useSocChat';
import { EXAMPLE_PROMPTS } from '@/cedar/config/examplePrompts';
import { cn } from 'cedar-os';

interface SocVercelChatProps {
  className?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  showHero?: boolean;
}

const HERO_SUGGESTION_COUNT = 4;

function pickPrompts(prompts: readonly string[], count: number): string[] {
  const pool = [...prompts];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export const SocVercelChat: React.FC<SocVercelChatProps> = ({
  className = '',
  heroTitle = 'How can I help with Rutgers SOC?',
  heroSubtitle = 'Ask about courses, prereqs, schedules, or attach a transcript image.',
  showHero = true,
}) => {
  const { messages, status, sendSocMessage, stop, regenerate } = useSocChat();
  const isBusy = status === 'submitted' || status === 'streaming';
  const isEmptyThread = messages.length === 0;

  const initialPrompts = useMemo(
    () => EXAMPLE_PROMPTS.slice(0, HERO_SUGGESTION_COUNT),
    [],
  );
  const [heroPrompts, setHeroPrompts] = useState<string[]>(initialPrompts);

  useEffect(() => {
    if (isEmptyThread) {
      setHeroPrompts(pickPrompts(EXAMPLE_PROMPTS, HERO_SUGGESTION_COUNT));
    }
  }, [isEmptyThread]);

  const handleRetry = async () => {
    try {
      await regenerate();
    } catch (error) {
      console.error('Failed to regenerate response', error);
    }
  };

  return (
    <div className={cn('flex h-full min-h-0 w-full flex-col', className)}>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {showHero && isEmptyThread && !isBusy ? (
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Sparkles className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                {heroTitle}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">{heroSubtitle}</p>
              <div className="mt-6 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {heroPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      void sendSocMessage({ text: prompt });
                    }}
                    className={cn(
                      'rounded-xl border border-border-subtle bg-surface-1 px-3 py-2.5 text-left text-sm text-foreground/90 shadow-elev-1',
                      'transition-colors hover:border-border hover:bg-surface-2 hover:text-foreground',
                    )}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <SocChatMessages
            messages={messages}
            status={status}
            onRetry={handleRetry}
          />
        )}
      </div>
      <div className="flex-shrink-0 px-4 pb-3 pt-2">
        <div className="mx-auto w-full max-w-3xl">
          <SocChatInput
            disabled={isBusy}
            isEmptyThread={isEmptyThread}
            onSubmit={sendSocMessage}
            onStop={() => void stop()}
          />
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground/70">
            Replies may be inaccurate. Verify against the official Rutgers Schedule of Classes.
          </p>
        </div>
      </div>
    </div>
  );
};
