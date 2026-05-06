import React from 'react';
import { cn } from 'cedar-os';

interface MessageRowProps {
  role: 'user' | 'assistant' | 'system';
  isFirstInGroup: boolean;
  className?: string;
  children: React.ReactNode;
}

export const MessageRow: React.FC<MessageRowProps> = ({
  role,
  isFirstInGroup,
  className,
  children,
}) => {
  const isUser = role === 'user';
  return (
    <div
      className={cn(
        'group/message flex w-full',
        isUser ? 'justify-end' : 'justify-start',
        isFirstInGroup ? 'mt-6 first:mt-0' : 'mt-2',
        className,
      )}
    >
      {isUser ? (
        <div className="ml-auto max-w-[80%] rounded-2xl border border-border-subtle bg-surface-3 px-3.5 py-2 text-sm text-foreground whitespace-pre-wrap break-words shadow-elev-1">
          {children}
        </div>
      ) : (
        <div className="w-full min-w-0 text-sm text-foreground">{children}</div>
      )}
    </div>
  );
};

export default MessageRow;
