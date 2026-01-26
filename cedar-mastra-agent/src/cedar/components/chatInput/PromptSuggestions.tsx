import React, { useEffect, useMemo, useState } from 'react';
import Flat3dButton from '@/cedar/components/containers/Flat3dButton';

interface PromptSuggestionsProps {
  prompts: string[];
  count?: number;
  onSelect: (prompt: string) => void;
  isVisible?: boolean;
}

const pickRandomPrompts = (prompts: string[], count: number) => {
  const pool = [...prompts];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
};

export const PromptSuggestions: React.FC<PromptSuggestionsProps> = ({
  prompts,
  count = 2,
  onSelect,
  isVisible = true,
}) => {
  const [suggestions, setSuggestions] = useState<string[]>(() =>
    pickRandomPrompts(prompts, count),
  );

  useEffect(() => {
    if (isVisible) {
      setSuggestions(pickRandomPrompts(prompts, count));
    }
  }, [count, isVisible, prompts]);

  const buttonRows = useMemo(() => suggestions.slice(0, count), [suggestions, count]);

  if (!isVisible || buttonRows.length === 0) return null;

  return (
    <div className="mb-2 flex flex-col gap-2">
      {buttonRows.map((prompt) => (
        <Flat3dButton
          key={prompt}
          onClick={() => onSelect(prompt)}
          className="rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-left text-slate-700 hover:border-slate-300 hover:bg-white"
        >
          <span className="text-sm font-medium">{prompt}</span>
        </Flat3dButton>
      ))}
    </div>
  );
};
