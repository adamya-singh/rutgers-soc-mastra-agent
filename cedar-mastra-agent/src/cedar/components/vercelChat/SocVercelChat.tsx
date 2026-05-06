import React from 'react';

import { SocChatInput } from './SocChatInput';
import { SocChatMessages } from './SocChatMessages';
import { useSocChat } from './useSocChat';

interface SocVercelChatProps {
  className?: string;
}

export const SocVercelChat: React.FC<SocVercelChatProps> = ({ className = '' }) => {
  const { messages, status, sendSocMessage, stop } = useSocChat();
  const isBusy = status === 'submitted' || status === 'streaming';

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      <div className="min-h-0 flex-1 overflow-hidden">
        <SocChatMessages messages={messages} status={status} />
      </div>
      <div className="flex-shrink-0 p-3">
        <SocChatInput
          disabled={isBusy}
          isEmptyThread={messages.length === 0}
          onSubmit={sendSocMessage}
          onStop={() => void stop()}
        />
      </div>
    </div>
  );
};
