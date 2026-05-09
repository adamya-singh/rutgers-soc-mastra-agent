import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCedarStore } from 'cedar-os';

import { buildMastraApiUrl } from '@/lib/mastraConfig';
import { supabaseClient } from '@/lib/supabaseClient';
import {
  buildAnonymousChatAuthorization,
  getAnonymousChatToken,
  type AnonymousChatQuota,
} from '@/lib/anonymousChatClient';

type CedarFrontendToolEvent = {
  type: 'frontendTool';
  toolName: string;
  args?: unknown;
};

type CedarSetStateEvent = {
  type: 'setState';
  stateKey: string;
  setterKey: string;
  args?: unknown;
};

type SocChatDataParts = {
  frontendTool: CedarFrontendToolEvent;
  setState: CedarSetStateEvent;
};

export type SocChatMessage = UIMessage<unknown, SocChatDataParts>;

interface UseSocChatOptions {
  threadId: string | null;
  initialMessages?: SocChatMessage[];
  onThreadActivity?: () => void | Promise<void>;
}

function isFrontendToolEvent(data: unknown): data is CedarFrontendToolEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as CedarFrontendToolEvent).type === 'frontendTool' &&
    typeof (data as CedarFrontendToolEvent).toolName === 'string'
  );
}

function isSetStateEvent(data: unknown): data is CedarSetStateEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as CedarSetStateEvent).type === 'setState' &&
    typeof (data as CedarSetStateEvent).stateKey === 'string' &&
    typeof (data as CedarSetStateEvent).setterKey === 'string'
  );
}

async function dispatchCedarDataEvent(part: { type: string; data: unknown }) {
  const cedarStore = useCedarStore.getState();

  if (part.type === 'data-frontendTool' && isFrontendToolEvent(part.data)) {
    await cedarStore.executeTool(part.data.toolName, part.data.args);
    return;
  }

  if (part.type === 'data-setState' && isSetStateEvent(part.data)) {
    cedarStore.executeStateSetter({
      key: part.data.stateKey,
      setterKey: part.data.setterKey,
      args: part.data.args,
    });
  }
}

export function useSocChat({
  threadId,
  initialMessages = [],
  onThreadActivity,
}: UseSocChatOptions = { threadId: null }) {
  const setIsProcessing = useCedarStore((state) => state.setIsProcessing);
  const [anonymousQuotaError, setAnonymousQuotaError] =
    useState<AnonymousChatQuota | null>(null);

  const fetchWithAuth = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const { data } = await supabaseClient.auth.getSession();
    const headers = new Headers(init?.headers);

    if (data.session?.access_token) {
      headers.set('Authorization', `Bearer ${data.session.access_token}`);
    } else {
      const anonymousToken = getAnonymousChatToken();
      if (anonymousToken) {
        headers.set('Authorization', buildAnonymousChatAuthorization(anonymousToken));
      }
    }

    const response = await fetch(input, {
      ...init,
      headers,
    });

    if (response.status === 429) {
      try {
        const body = (await response.clone().json()) as { quota?: AnonymousChatQuota };
        setAnonymousQuotaError(body.quota ?? null);
      } catch {
        setAnonymousQuotaError(null);
      }
    }

    return response;
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<SocChatMessage>({
        api: buildMastraApiUrl('/chat/ui'),
        fetch: fetchWithAuth,
      }),
    [fetchWithAuth],
  );

  const chat = useChat<SocChatMessage>({
    id: threadId ?? 'pending-chat-thread',
    transport,
    onData: (part) => {
      void dispatchCedarDataEvent(part);
    },
  });
  const setChatMessages = (chat as typeof chat & {
    setMessages?: (messages: SocChatMessage[]) => void;
  }).setMessages;
  const setChatMessagesRef = useRef(setChatMessages);

  useEffect(() => {
    setChatMessagesRef.current = setChatMessages;
  }, [setChatMessages]);

  useEffect(() => {
    setChatMessagesRef.current?.(initialMessages);
  }, [initialMessages, threadId]);

  useEffect(() => {
    setIsProcessing(chat.status === 'submitted' || chat.status === 'streaming');
  }, [chat.status, setIsProcessing]);

  const sendSocMessage = useCallback(
    async ({ text, files }: { text: string; files?: FileList }) => {
      if (!threadId) {
        throw new Error('Create or select a chat before sending a message.');
      }
      setAnonymousQuotaError(null);
      const additionalContext = useCedarStore.getState().additionalContext;
      await chat.sendMessage(
        files && files.length > 0
          ? {
              text,
              files,
            }
          : {
              text,
            },
        {
          body: {
            threadId,
            additionalContext,
          },
        },
      );
      await onThreadActivity?.();
    },
    [chat, onThreadActivity, threadId],
  );

  return {
    ...chat,
    isThreadReady: Boolean(threadId),
    anonymousQuotaError,
    sendSocMessage,
  };
}
