import React, { useState } from 'react';
import { Check, Copy, RotateCcw } from 'lucide-react';
import { cn } from 'cedar-os';

interface MessageActionsProps {
  text: string;
  onRetry?: () => void | Promise<void>;
  className?: string;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  text,
  onRetry,
  className,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard errors silently
    }
  };

  return (
    <div
      className={cn(
        'mt-1 flex items-center gap-1 text-muted-foreground',
        'opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] hover:bg-surface-2 hover:text-foreground"
        aria-label="Copy message"
        title="Copy"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
      {onRetry && (
        <button
          type="button"
          onClick={() => void onRetry()}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] hover:bg-surface-2 hover:text-foreground"
          aria-label="Regenerate response"
          title="Retry"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};

export default MessageActions;
