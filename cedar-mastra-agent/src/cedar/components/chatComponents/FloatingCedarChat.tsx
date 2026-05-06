import { CollapsedButton } from '@/cedar/components/chatMessages/structural/CollapsedChatButton';
import Container3D from '@/cedar/components/containers/Container3D';
import { FloatingContainer } from '@/cedar/components/structural/FloatingContainer';
import { SocVercelChat } from '@/cedar/components/vercelChat/SocVercelChat';
import { useCedarStore } from 'cedar-os';
import { ChatThreadController } from '@/cedar/components/threads/ChatThreadController';
import { X } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import React from 'react';
interface FloatingCedarChatProps {
  side?: 'left' | 'right';
  title?: string;
  collapsedLabel?: string;
  companyLogo?: React.ReactNode;
  dimensions?: {
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
  };
  resizable?: boolean;
  showThreadController?: boolean;
  stream?: boolean;
}

export const FloatingCedarChat: React.FC<FloatingCedarChatProps> = ({
  side = 'right',
  title = 'Cedar Chat',
  collapsedLabel = 'How can I help you today?',
  companyLogo,
  dimensions = {
    minWidth: 350,
    minHeight: 400,
  },
  showThreadController = false,
  resizable = true,
}) => {
  const showChat = useCedarStore((state) => state.showChat);
  const setShowChat = useCedarStore((state) => state.setShowChat);

  return (
    <>
      <AnimatePresence mode="wait">
        {!showChat && (
          <CollapsedButton
            side={side}
            label={collapsedLabel}
            layoutId="cedar-floating-chat"
            position="fixed"
          />
        )}
      </AnimatePresence>

      <FloatingContainer
        isActive={showChat}
        position={side === 'left' ? 'bottom-left' : 'bottom-right'}
        dimensions={dimensions}
        resizable={resizable}
        className="cedar-floating-chat"
      >
        <Container3D className="flex h-full flex-col text-sm">
          <div className="z-20 flex min-w-0 flex-shrink-0 flex-row items-center justify-between border-b border-border-subtle px-3 py-2">
            <div className="flex min-w-0 flex-1 items-center">
              {companyLogo && (
                <div className="mr-2 h-5 w-5 flex-shrink-0">{companyLogo}</div>
              )}
              <span className="truncate text-sm font-medium text-foreground">{title}</span>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1">
              {showThreadController && <ChatThreadController />}
              <button
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                onClick={() => setShowChat(false)}
                aria-label="Close chat"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <SocVercelChat />
        </Container3D>
      </FloatingContainer>
    </>
  );
};
