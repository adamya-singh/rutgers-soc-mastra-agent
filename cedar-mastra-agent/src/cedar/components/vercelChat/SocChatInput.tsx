import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Code, Image as ImageIcon, Mic, SendHorizonal, X } from 'lucide-react';
import { useVoice, cn } from 'cedar-os';

import Container3DButton from '@/cedar/components/containers/Container3DButton';
import { VoiceIndicator } from '@/cedar/components/voice/VoiceIndicator';
import { PromptSuggestions } from '@/cedar/components/chatInput/PromptSuggestions';
import { EXAMPLE_PROMPTS } from '@/cedar/config/examplePrompts';
import {
  CEDAR_SUBMIT_PROMPT_EVENT,
  type CedarSubmitPromptDetail,
} from '@/cedar/promptBridge';

interface SocChatInputProps {
  disabled?: boolean;
  isEmptyThread?: boolean;
  onSubmit: (input: { text: string; files?: FileList }) => Promise<void>;
  onStop?: () => void;
}

export const SocChatInput: React.FC<SocChatInputProps> = ({
  disabled = false,
  isEmptyThread = false,
  onSubmit,
  onStop,
}) => {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<FileList | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const voice = useVoice();

  const hasFiles = Boolean(files && files.length > 0);
  const canSubmit = !disabled && (input.trim().length > 0 || hasFiles);

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

  const getMicButtonClass = () => {
    if (voice.isListening) {
      return 'p-1 text-accent hover:text-accent/90 cursor-pointer animate-pulse';
    }
    if (voice.isSpeaking) {
      return 'p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer';
    }
    if (
      voice.voicePermissionStatus === 'denied' ||
      voice.voicePermissionStatus === 'not-supported'
    ) {
      return 'p-1 text-muted-foreground/60 cursor-not-allowed';
    }
    return 'p-1 text-muted-foreground hover:text-foreground cursor-pointer';
  };

  return (
    <div className="rounded-2xl border border-border bg-surface-2/85 p-3 text-sm text-foreground shadow-elev-1 backdrop-blur">
      {voice.isListening || voice.isSpeaking ? (
        <div className="py-2">
          <VoiceIndicator
            voiceState={{
              isListening: voice.isListening,
              isSpeaking: voice.isSpeaking,
              voiceError: voice.voiceError,
              voicePermissionStatus: voice.voicePermissionStatus,
            }}
          />
        </div>
      ) : (
        <>
          {isEmptyThread && (
            <PromptSuggestions
              prompts={EXAMPLE_PROMPTS}
              count={2}
              onSelect={(prompt) => {
                setInput(prompt);
                void submit(prompt);
              }}
              isVisible={isEmptyThread}
            />
          )}
          {hasFiles && (
            <div className="mb-2 flex flex-wrap gap-2">
              {Array.from(files ?? []).map((file) => (
                <div
                  key={`${file.name}-${file.lastModified}`}
                  className="flex items-center gap-2 rounded-md border border-border bg-surface-1 px-2 py-1 text-xs"
                >
                  <span className="max-w-44 truncate">{file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
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
            rows={2}
            className="min-h-12 w-full resize-none bg-transparent py-2 text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Ask about courses, schedules, or attach an image..."
            disabled={disabled}
          />
        </>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={getMicButtonClass()}
            onClick={handleVoiceToggle}
            disabled={
              voice.voicePermissionStatus === 'denied' ||
              voice.voicePermissionStatus === 'not-supported'
            }
            title="Start voice chat (M)"
          >
            <Mic className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="cursor-pointer p-1 text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            title="Attach image"
          >
            <ImageIcon className="h-4 w-4" />
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
            className="cursor-pointer p-1 text-muted-foreground hover:text-foreground"
            title="Code"
          >
            <Code className="h-4 w-4" />
          </button>
        </div>
        {disabled && onStop ? (
          <button
            type="button"
            onClick={onStop}
            className="rounded-full border border-border bg-surface-1 px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Stop
          </button>
        ) : (
          <Container3DButton
            id="send-chat"
            onClick={() => void submit()}
            color={canSubmit ? '#c23b3a' : undefined}
            className={cn(
              'ml-auto -mt-0.5 flex flex-shrink-0 items-center rounded-full border border-border bg-surface-1',
              !canSubmit && 'opacity-50',
            )}
            childClassName="p-1.5"
          >
            <SendHorizonal className={cn('h-4 w-4', canSubmit && '-rotate-90')} />
          </Container3DButton>
        )}
      </div>
    </div>
  );
};
