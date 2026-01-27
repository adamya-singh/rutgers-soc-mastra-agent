import { useVoice, cn, useCedarStore, HumanInTheLoopMessage, useThreadMessages } from 'cedar-os';

import { CedarEditorContent as EditorContent } from 'cedar-os';
import { Code, Image, Mic, SendHorizonal } from 'lucide-react';
import { motion } from 'motion/react';
import React, { useCallback, useEffect, useRef } from 'react';

import './ChatInput.css';
import { ContextBadgeRow } from '@/cedar/components/chatInput/ContextBadgeRow';
import { useCedarEditor } from 'cedar-os';
import Container3DButton from '@/cedar/components/containers/Container3DButton';
import { VoiceIndicator } from '@/cedar/components/voice/VoiceIndicator';
import { KeyboardShortcut } from '@/cedar/components/ui/KeyboardShortcut';
import { HumanInTheLoopIndicator } from '@/cedar/components/chatInput/HumanInTheLoopIndicator';
import { PromptSuggestions } from '@/cedar/components/chatInput/PromptSuggestions';
import { EXAMPLE_PROMPTS } from '@/cedar/config/examplePrompts';

// ChatContainer component with position options
export type ChatContainerPosition = 'bottom-center' | 'embedded' | 'custom';

// Inlined mention items removed; using external suggestion module

export const ChatInput: React.FC<{
  handleFocus?: () => void;
  handleBlur?: () => void;
  isInputFocused?: boolean;
  className?: string; // Additional classes for the container
  stream?: boolean; // Whether to use streaming for responses
}> = ({ handleFocus, handleBlur, isInputFocused, className = '', stream = true }) => {
  const [isFocused, setIsFocused] = React.useState(false);

  const { editor, isEditorEmpty, handleSubmit } = useCedarEditor({
    onFocus: () => {
      setIsFocused(true);
      handleFocus?.();
    },
    onBlur: () => {
      setIsFocused(false);
      handleBlur?.();
    },
    stream,
  });

  // Initialize voice functionality
  const voice = useVoice();

  // Get latest message to check for human-in-the-loop state
  const messages = useCedarStore((state) => state.messages);
  const latestMessage = messages[messages.length - 1];
  const isHumanInTheLoopSuspended =
    latestMessage?.type === 'humanInTheLoop' &&
    (latestMessage as HumanInTheLoopMessage).state === 'suspended';

  // Thread messages for empty-state suggestions
  const { messages: threadMessages } = useThreadMessages();
  const shouldShowPromptSuggestions = threadMessages.length === 0;

  // Handle voice toggle
  const handleVoiceToggle = useCallback(async () => {
    // Check if voice is supported
    if (!voice.checkVoiceSupport()) {
      console.error('Voice features are not supported in this browser');
      return;
    }

    // Request permission if needed
    if (voice.voicePermissionStatus === 'prompt') {
      await voice.requestVoicePermission();
    }

    // Toggle voice if permission is granted
    if (voice.voicePermissionStatus === 'granted') {
      voice.toggleVoice();
    } else if (voice.voicePermissionStatus === 'denied') {
      console.error('Microphone access denied');
    }
  }, [voice]);

  // Get mic button appearance based on voice state
  const getMicButtonClass = () => {
    if (voice.isListening) {
      return 'p-1 text-accent hover:text-accent/90 cursor-pointer animate-pulse';
    }
    if (voice.isSpeaking) {
      return 'p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer';
    }
    if (voice.voicePermissionStatus === 'denied') {
      return 'p-1 text-muted-foreground/60 cursor-not-allowed';
    }
    return 'p-1 text-muted-foreground hover:text-foreground cursor-pointer';
  };

  // Focus the editor when isInputFocused changes to allow for controlled focusing
  useEffect(() => {
    if (isInputFocused && editor) {
      editor.commands.focus();
    }
  }, [isInputFocused, editor]);

  // Handle tab key to focus the editor and escape to unfocus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (editor) {
          editor.commands.focus();
          setIsFocused(true);
        }
      } else if (e.key === 'Escape') {
        if (isFocused && editor) {
          editor.commands.blur();
          setIsFocused(false);
        }
      }
    };

    // Add the event listener
    window.addEventListener('keydown', handleKeyDown);

    // Clean up
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [editor, isFocused]);

  // Handle global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Check if user is currently typing in an input, textarea, or contenteditable element
      const target = e.target as HTMLElement;
      const isTypingInInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.getAttribute('contenteditable') === 'true' ||
        target.closest('[contenteditable="true"]') !== null;

      // Handle M key for microphone (only when not typing)
      if (e.key === 'm' || e.key === 'M') {
        if (!isTypingInInput && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          handleVoiceToggle();
          return;
        }
      }
    };

    // Add the event listener
    window.addEventListener('keydown', handleGlobalKeyDown);

    // Clean up
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [handleVoiceToggle]);

  const handleSubmitRef = useRef(handleSubmit);
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit]);

  const pendingPromptRef = useRef<string | null>(null);
  const forceUpdateRef = useRef(false);

  useEffect(() => {
    if (!pendingPromptRef.current) return;
    if (!editor) return;
    if (isEditorEmpty) {
      const currentText = editor.getText().trim();
      if (!forceUpdateRef.current && currentText === pendingPromptRef.current.trim()) {
        forceUpdateRef.current = true;
        editor.commands.setContent(pendingPromptRef.current, true);
      }
      return;
    }
    const currentText = editor.getText().trim();
    if (currentText !== pendingPromptRef.current.trim()) return;
    requestAnimationFrame(() => {
      handleSubmitRef.current?.();
      pendingPromptRef.current = null;
      forceUpdateRef.current = false;
    });
  }, [editor, isEditorEmpty]);

  const handlePromptSelect = useCallback(
    (prompt: string) => {
      if (!editor) return;
      pendingPromptRef.current = prompt;
      editor.commands.setContent(prompt, true);
      editor.commands.focus();
    },
    [editor],
  );

  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-surface-2/85 p-3 text-sm text-foreground shadow-elev-1 backdrop-blur',
        className,
      )}
    >
      {/* Input context row showing selected context nodes */}
      <ContextBadgeRow editor={editor} />

      {/* Chat editor row */}
      <div className="relative w-full h-fit" id="cedar-chat-input">
        {voice.isListening || voice.isSpeaking ? (
          <div className="py-2 items-center justify-center w-full">
            <VoiceIndicator
              voiceState={{
                isListening: voice.isListening,
                isSpeaking: voice.isSpeaking,
                voiceError: voice.voiceError,
                voicePermissionStatus: voice.voicePermissionStatus,
              }}
            />
          </div>
        ) : isHumanInTheLoopSuspended ? (
          <div className="py-2 items-center justify-center w-full">
            <HumanInTheLoopIndicator state={(latestMessage as HumanInTheLoopMessage).state} />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {shouldShowPromptSuggestions && (
              <PromptSuggestions
                prompts={EXAMPLE_PROMPTS}
                count={2}
                onSelect={handlePromptSelect}
                isVisible={shouldShowPromptSuggestions}
              />
            )}
            <div className="flex items-center gap-2">
              {!isFocused && (
                <KeyboardShortcut
                  shortcut="⇥"
                  className="text-muted-foreground border-muted-foreground/30 flex-shrink-0"
                />
              )}
              <motion.div layoutId="chatInput" className="flex-1 justify-center py-3" aria-label="Message input">
                <EditorContent
                  editor={editor}
                  className="prose prose-sm max-w-none text-foreground focus:outline-none outline-none focus:ring-0 ring-0 [&_*]:focus:outline-none [&_*]:outline-none [&_*]:focus:ring-0 [&_*]:ring-0 [&_.ProseMirror]:p-0 [&_.ProseMirror]:outline-none [&_.ProseMirror]:break-words [&_.ProseMirror]:overflow-wrap-anywhere [&_.ProseMirror]:word-break-break-word"
                />
              </motion.div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom rows. Contains tools and send chat button */}
      <div id="input-tools" className="flex items-center  space-x-2  justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={getMicButtonClass()}
            onClick={handleVoiceToggle}
            disabled={
              voice.voicePermissionStatus === 'denied' ||
              voice.voicePermissionStatus === 'not-supported'
            }
            title={
              voice.isListening
                ? 'Stop recording'
                : voice.isSpeaking
                  ? 'Speaking...'
                  : voice.voicePermissionStatus === 'denied'
                    ? 'Microphone access denied'
                    : voice.voicePermissionStatus === 'not-supported'
                      ? 'Voice not supported'
                      : 'Start voice chat (M)'
            }
          >
            <Mic className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <Image className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <Code className="w-4 h-4" />
          </button>
        </div>
        <Container3DButton
          id="send-chat"
          motionProps={{
            layoutId: 'send-chat',
            animate: {
              opacity: isEditorEmpty ? 0.5 : 1,
              backgroundColor: isEditorEmpty ? 'transparent' : 'rgba(194, 59, 58, 0.2)',
            },
            transition: { type: 'spring', stiffness: 300, damping: 20 },
          }}
          onClick={() => handleSubmit()}
          color={isEditorEmpty ? undefined : '#c23b3a'}
          className="flex items-center flex-shrink-0 ml-auto -mt-0.5 rounded-full border border-border bg-surface-1"
          childClassName="p-1.5"
        >
          <motion.div
            animate={{ rotate: isEditorEmpty ? 0 : -90 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            <SendHorizonal className="w-4 h-4" />
          </motion.div>
        </Container3DButton>
      </div>
    </div>
  );
};
