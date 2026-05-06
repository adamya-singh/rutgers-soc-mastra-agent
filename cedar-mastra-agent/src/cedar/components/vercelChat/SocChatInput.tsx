import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Mic, Paperclip, Square, X } from 'lucide-react';
import { useVoice, cn } from 'cedar-os';

import { VoiceIndicator } from '@/cedar/components/voice/VoiceIndicator';
import {
  CEDAR_SUBMIT_PROMPT_EVENT,
  type CedarSubmitPromptDetail,
} from '@/cedar/promptBridge';

interface SocChatInputProps {
  disabled?: boolean;
  /** Retained for backwards compatibility; prompt suggestions now live in SocVercelChat. */
  isEmptyThread?: boolean;
  onSubmit: (input: { text: string; files?: FileList }) => Promise<void>;
  onStop?: () => void;
  className?: string;
}

const MAX_TEXTAREA_HEIGHT = 220;

export const SocChatInput: React.FC<SocChatInputProps> = ({
  disabled = false,
  onSubmit,
  onStop,
  className,
}) => {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<FileList | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const voice = useVoice();

  const hasFiles = Boolean(files && files.length > 0);
  const canSubmit = !disabled && (input.trim().length > 0 || hasFiles);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT);
    el.style.height = `${next}px`;
  }, []);

  useLayoutEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  const handleVoiceToggle = useCallback(async () => {
    if (!voice.checkVoiceSupport()) {
      console.error('Voice features are not supported in this browser');
      return;
    }

    if (voice.voicePermissionStatus === 'prompt') {
      await voice.requestVoicePermission();
    }

    if (voice.voicePermissionStatus === 'granted') {
      voice.toggleVoice();
    } else if (voice.voicePermissionStatus === 'denied') {
      console.error('Microphone access denied');
    }
  }, [voice]);

  const submit = useCallback(
    async (textOverride?: string) => {
      const textToSend = textOverride ?? input;
      if (disabled || (!textToSend.trim() && !hasFiles)) return;

      await onSubmit({
        text: textToSend.trim() || 'Please analyze the attached image.',
        files,
      });

      setInput('');
      setFiles(undefined);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [disabled, files, hasFiles, input, onSubmit],
  );

  useEffect(() => {
    const handleExternalPrompt = (event: Event) => {
      const { prompt } = (event as CustomEvent<CedarSubmitPromptDetail>).detail ?? {};
      if (typeof prompt === 'string' && prompt.trim().length > 0) {
        setInput(prompt);
        requestAnimationFrame(() => {
          void submit(prompt);
        });
      }
    };

    window.addEventListener(CEDAR_SUBMIT_PROMPT_EVENT, handleExternalPrompt);
    return () => {
      window.removeEventListener(CEDAR_SUBMIT_PROMPT_EVENT, handleExternalPrompt);
    };
  }, [submit]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.getAttribute('contenteditable') === 'true' ||
        target.closest('[contenteditable="true"]') !== null;

      if (
        (event.key === 'm' || event.key === 'M') &&
        !isTyping &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        void handleVoiceToggle();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleVoiceToggle]);

  const micDisabled =
    voice.voicePermissionStatus === 'denied' ||
    voice.voicePermissionStatus === 'not-supported';

  const micButtonClass = (() => {
    if (voice.isListening) {
      return 'text-accent animate-pulse';
    }
    if (voice.isSpeaking) {
      return 'text-success';
    }
    if (micDisabled) {
      return 'text-muted-foreground/50 cursor-not-allowed';
    }
    return 'text-muted-foreground hover:text-foreground';
  })();

  if (voice.isListening || voice.isSpeaking) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-border bg-surface-1 p-3 shadow-elev-1',
          className,
        )}
      >
        <VoiceIndicator
          voiceState={{
            isListening: voice.isListening,
            isSpeaking: voice.isSpeaking,
            voiceError: voice.voiceError,
            voicePermissionStatus: voice.voicePermissionStatus,
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group/input flex flex-col gap-2 rounded-2xl border border-border bg-surface-1 p-2.5 shadow-elev-1',
        'transition-colors focus-within:border-accent/40 focus-within:shadow-glow',
        disabled && 'opacity-90',
        className,
      )}
    >
      {hasFiles && (
        <div className="flex flex-wrap gap-2">
          {Array.from(files ?? []).map((file) => (
            <div
              key={`${file.name}-${file.lastModified}`}
              className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-2 px-2 py-1 text-xs text-foreground"
            >
              <Paperclip className="h-3 w-3 text-muted-foreground" />
              <span className="max-w-44 truncate">{file.name}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setFiles(undefined);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
        rows={1}
        className="w-full resize-none bg-transparent px-1 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/80"
        placeholder="Ask about courses, schedules, or attach an image..."
        disabled={disabled}
      />

      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors',
              'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
            )}
            onClick={() => fileInputRef.current?.click()}
            title="Attach image"
            aria-label="Attach image"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              setFiles(event.target.files ?? undefined);
            }}
          />
          <button
            type="button"
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors',
              !micDisabled && 'hover:bg-surface-2',
              micButtonClass,
            )}
            onClick={handleVoiceToggle}
            disabled={micDisabled}
            title="Start voice chat (M)"
            aria-label="Start voice chat"
          >
            <Mic className="h-4 w-4" />
          </button>
        </div>

        {disabled && onStop ? (
          <button
            type="button"
            onClick={onStop}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-full',
              'border border-border bg-surface-2 text-foreground',
              'transition-colors hover:bg-surface-3',
            )}
            title="Stop generating"
            aria-label="Stop generating"
          >
            <Square className="h-3.5 w-3.5" fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-full transition-all',
              canSubmit
                ? 'bg-accent text-accent-foreground shadow-elev-1 hover:brightness-110'
                : 'cursor-not-allowed bg-surface-3 text-muted-foreground',
            )}
            title="Send"
            aria-label="Send message"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
};
