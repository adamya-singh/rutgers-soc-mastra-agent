import React, { useState } from 'react';
import { Brain, ChevronRight } from 'lucide-react';
import { cn } from 'cedar-os';

interface ReasoningPartProps {
  text: string;
  streaming?: boolean;
}

export const ReasoningPart: React.FC<ReasoningPartProps> = ({ text, streaming = false }) => {
  const [open, setOpen] = useState(false);
  const trimmed = text?.trim() ?? '';
  if (!trimmed && !streaming) return null;

  return (
    <div className="my-2 rounded-lg border border-border-subtle bg-surface-2/60">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs',
          'text-muted-foreground transition-colors hover:text-foreground',
        )}
      >
        <ChevronRight
          className={cn('h-3 w-3 transition-transform', open && 'rotate-90')}
        />
        <Brain className="h-3 w-3" />
        {streaming ? (
          <span className="animate-pulse">Thinking</span>
        ) : (
          <span>Thought process</span>
        )}
      </button>
      {open && trimmed && (
        <div className="border-t border-border-subtle px-3 py-2">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {trimmed}
          </p>
        </div>
      )}
    </div>
  );
};

export default ReasoningPart;
