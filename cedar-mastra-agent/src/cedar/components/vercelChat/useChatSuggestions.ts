import { useEffect, useRef, useState } from 'react';

import { fetchChatSuggestions } from '@/lib/chatSuggestionsClient';

import type { SocChatMessage } from './useSocChat';

type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error';

interface UseChatSuggestionsOptions {
  threadId: string | null;
  messages: SocChatMessage[];
  status: ChatStatus;
}

interface UseChatSuggestionsResult {
  suggestions: string[];
  isLoading: boolean;
}

function countAssistantMessages(messages: SocChatMessage[]): number {
  let count = 0;
  for (const message of messages) {
    if (message.role === 'assistant') count += 1;
  }
  return count;
}

function countUserMessages(messages: SocChatMessage[]): number {
  let count = 0;
  for (const message of messages) {
    if (message.role === 'user') count += 1;
  }
  return count;
}

export function useChatSuggestions({
  threadId,
  messages,
  status,
}: UseChatSuggestionsOptions): UseChatSuggestionsResult {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const cacheRef = useRef<Map<string, string[]>>(new Map());
  const inFlightControllerRef = useRef<AbortController | null>(null);
  const inFlightKeyRef = useRef<string | null>(null);

  const assistantCount = countAssistantMessages(messages);
  const userCount = countUserMessages(messages);
  const messageCount = messages.length;

  useEffect(() => {
    if (!threadId) {
      inFlightControllerRef.current?.abort();
      inFlightControllerRef.current = null;
      inFlightKeyRef.current = null;
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    if (status !== 'ready' || assistantCount === 0 || userCount === 0) {
      if (status === 'submitted' || status === 'streaming') {
        inFlightControllerRef.current?.abort();
        inFlightControllerRef.current = null;
        inFlightKeyRef.current = null;
        setSuggestions([]);
        setIsLoading(false);
      }
      return;
    }

    const cacheKey = `${threadId}:${messageCount}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setSuggestions(cached);
      setIsLoading(false);
      return;
    }

    if (inFlightKeyRef.current === cacheKey) {
      return;
    }

    inFlightControllerRef.current?.abort();
    const controller = new AbortController();
    inFlightControllerRef.current = controller;
    inFlightKeyRef.current = cacheKey;
    setIsLoading(true);

    void (async () => {
      try {
        const next = await fetchChatSuggestions(threadId, { signal: controller.signal });
        if (controller.signal.aborted) return;
        cacheRef.current.set(cacheKey, next);
        setSuggestions(next);
      } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') return;
        console.warn('Failed to fetch chat suggestions', error);
        if (controller.signal.aborted) return;
        setSuggestions([]);
      } finally {
        if (inFlightControllerRef.current === controller) {
          inFlightControllerRef.current = null;
          inFlightKeyRef.current = null;
          setIsLoading(false);
        }
      }
    })();
  }, [assistantCount, messageCount, status, threadId, userCount]);

  useEffect(() => {
    cacheRef.current = new Map();
  }, [threadId]);

  useEffect(() => {
    return () => {
      inFlightControllerRef.current?.abort();
      inFlightControllerRef.current = null;
      inFlightKeyRef.current = null;
    };
  }, []);

  return { suggestions, isLoading };
}
