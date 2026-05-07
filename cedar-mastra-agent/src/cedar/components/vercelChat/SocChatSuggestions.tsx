import React from 'react';
import { cn } from 'cedar-os';

interface SocChatSuggestionsProps {
  suggestions: string[];
  isLoading: boolean;
  disabled?: boolean;
  onSelect: (prompt: string) => void;
  className?: string;
}

export const SocChatSuggestions: React.FC<SocChatSuggestionsProps> = ({
  suggestions,
  isLoading,
  disabled = false,
  onSelect,
  className,
}) => {
  if (suggestions.length === 0 && !isLoading) {
    return null;
  }

  if (suggestions.length === 0 && isLoading) {
    return (
      <div
        className={cn('mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2', className)}
        aria-hidden="true"
      >
        <div className="h-10 animate-pulse rounded-xl border border-border-subtle bg-surface-1/60" />
        <div className="h-10 animate-pulse rounded-xl border border-border-subtle bg-surface-1/60" />
      </div>
    );
  }

  const visible = suggestions.slice(0, 2);

  return (
    <div
      className={cn('mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2', className)}
      aria-label="Suggested follow-up prompts"
    >
      {visible.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onSelect(prompt)}
          disabled={disabled}
          className={cn(
            'rounded-xl border border-border-subtle bg-surface-1 px-3 py-2.5 text-left text-sm text-foreground/90 shadow-elev-1',
            'transition-colors hover:border-border hover:bg-surface-2 hover:text-foreground',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-1 disabled:hover:border-border-subtle',
          )}
          title={prompt}
        >
          <span className="line-clamp-2 break-words">{prompt}</span>
        </button>
      ))}
    </div>
  );
};
