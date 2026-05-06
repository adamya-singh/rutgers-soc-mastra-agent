import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';

import MarkdownRenderer from '@/cedar/components/chatMessages/MarkdownRenderer';
import { ShimmerText } from '@/cedar/components/text/ShimmerText';
import { cn } from 'cedar-os';
import type { SocChatMessage } from './useSocChat';

interface SocChatMessagesProps {
  messages: SocChatMessage[];
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  className?: string;
}

function renderPart(part: SocChatMessage['parts'][number], index: number) {
  if (part.type === 'text') {
    return <MarkdownRenderer key={index} content={part.text} />;
  }

  if (part.type === 'file' && part.mediaType.startsWith('image/')) {
    return (
      <Image
        key={index}
        src={part.url}
        alt={part.filename ?? 'Uploaded image'}
        width={512}
        height={256}
        unoptimized
        className="mt-2 max-h-64 max-w-full rounded-lg border border-border object-contain"
      />
    );
  }

  if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
    const label = part.type === 'dynamic-tool' ? part.toolName : part.type.replace(/^tool-/, '');
    return (
      <div key={index} className="mt-2 rounded-md border border-border bg-surface-1 px-3 py-2 text-xs text-muted-foreground">
        Agent tool: {label}
      </div>
    );
  }

  if (part.type.startsWith('data-')) {
    return null;
  }

  return null;
}

export const SocChatMessages: React.FC<SocChatMessagesProps> = ({
  messages,
  status,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isProcessing = status === 'submitted' || status === 'streaming';

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
  }, [messages]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'h-full w-full overflow-x-hidden overflow-y-auto px-3 pb-3',
        className,
      )}
      style={{ contain: 'paint layout', scrollbarColor: 'rgba(126, 138, 153, 0.6) transparent' }}
    >
      <div className="relative z-20 px-1 py-1">
        <AnimatePresence initial={false}>
          {messages.map((message, messageIndex) => {
            const previousMessage = messages[messageIndex - 1];
            const isConsecutive = previousMessage?.role === message.role;
            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} ${
                  isConsecutive ? 'mt-1' : 'mt-2'
                }`}
              >
                <div
                  className={cn(
                    'max-w-[92%] rounded-2xl border px-3 py-2 text-sm shadow-elev-1',
                    message.role === 'user'
                      ? 'border-accent/20 bg-accent/10 text-foreground'
                      : 'border-border bg-surface-1 text-foreground',
                  )}
                >
                  {message.parts.map(renderPart)}
                </div>
              </motion.div>
            );
          })}
          {isProcessing && (
            <div className="py-2">
              <ShimmerText text="Thinking..." state="thinking" />
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
