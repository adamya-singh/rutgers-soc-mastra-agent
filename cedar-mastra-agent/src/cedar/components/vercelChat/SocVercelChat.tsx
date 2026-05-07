import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronUp,
  Loader2,
  LogOut,
  MessageSquarePlus,
  MoonStar,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Sun,
  Trash2,
  UserCircle,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

import { SocChatInput } from './SocChatInput';
import { SocChatMessages } from './SocChatMessages';
import { useSocChat, type SocChatMessage } from './useSocChat';
import { EXAMPLE_PROMPTS } from '@/cedar/config/examplePrompts';
import { cn } from 'cedar-os';
import {
  createChatThread,
  deleteChatThread,
  listChatThreads,
  loadChatThread,
  renameChatThread,
  type ChatThread,
} from '@/lib/chatHistoryClient';
import { supabaseClient } from '@/lib/supabaseClient';

interface SocVercelChatProps {
  className?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  showHero?: boolean;
  userEmail?: string | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onSignOut?: () => Promise<void> | void;
}

const HERO_SUGGESTION_COUNT = 4;

function pickPrompts(prompts: readonly string[], count: number): string[] {
  const pool = [...prompts];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export const SocVercelChat: React.FC<SocVercelChatProps> = ({
  className = '',
  heroTitle = 'How can I help with Rutgers SOC?',
  heroSubtitle = 'Ask about courses, prereqs, schedules, or attach a transcript image.',
  showHero = true,
  userEmail = null,
  theme,
  onToggleTheme,
  onSignOut,
}) => {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [hydratedMessages, setHydratedMessages] = useState<SocChatMessage[]>([]);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpenState] = useState(false);
  // Tracks a freshly-created thread that the user has not yet sent any messages
  // in. If they navigate away from it, we delete it so empty chats don't pile up.
  const pristineThreadIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('soc-chat-sidebar-open');
      if (stored === 'true') {
        setIsSidebarOpenState(true);
      }
    } catch {
      // ignore storage access errors (private mode, etc.)
    }
  }, []);

  const setIsSidebarOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setIsSidebarOpenState((prev) => {
        const value = typeof next === 'function' ? next(prev) : next;
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem('soc-chat-sidebar-open', value ? 'true' : 'false');
          } catch {
            // ignore storage access errors
          }
        }
        return value;
      });
    },
    [],
  );

  const refreshThreads = useCallback(async () => {
    const nextThreads = await listChatThreads();
    setThreads(nextThreads);
    return nextThreads;
  }, []);

  const openThread = useCallback(async (threadId: string) => {
    setHistoryError(null);
    setIsThreadLoading(true);
    try {
      const { thread, messages } = await loadChatThread(threadId);
      setActiveThreadId(thread.id);
      setHydratedMessages(messages as SocChatMessage[]);
      setThreads((current) => {
        const withoutThread = current.filter((item) => item.id !== thread.id);
        return [thread, ...withoutThread];
      });
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Failed to load chat.');
    } finally {
      setIsThreadLoading(false);
    }
  }, []);

  const initializeHistory = useCallback(async () => {
    setHistoryError(null);
    setIsHistoryLoading(true);
    try {
      const existingThreads = await listChatThreads();
      if (existingThreads.length > 0) {
        setThreads(existingThreads);
        await openThread(existingThreads[0].id);
        return;
      }

      const thread = await createChatThread();
      pristineThreadIdRef.current = thread.id;
      setThreads([thread]);
      setActiveThreadId(thread.id);
      setHydratedMessages([]);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Failed to initialize saved chats.');
      setThreads([]);
      setActiveThreadId(null);
      setHydratedMessages([]);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [openThread]);

  useEffect(() => {
    let isMounted = true;
    supabaseClient.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setIsSignedIn(Boolean(data.session));
      setIsAuthReady(true);
    });

    const { data: authListener } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(Boolean(session));
      setIsAuthReady(true);
    });

    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }
    if (!isSignedIn) {
      pristineThreadIdRef.current = null;
      setThreads([]);
      setActiveThreadId(null);
      setHydratedMessages([]);
      setHistoryError(null);
      return;
    }
    void initializeHistory();
  }, [initializeHistory, isAuthReady, isSignedIn]);

  const handleThreadActivity = useCallback(async () => {
    try {
      await refreshThreads();
    } catch (error) {
      console.error('Failed to refresh chat history', error);
    }
  }, [refreshThreads]);

  const { messages, status, sendSocMessage, stop, regenerate } = useSocChat({
    threadId: activeThreadId,
    initialMessages: hydratedMessages,
    onThreadActivity: handleThreadActivity,
  });
  const isBusy = status === 'submitted' || status === 'streaming';
  const isEmptyThread = messages.length === 0;
  const isChatUnavailable =
    !isSignedIn || isHistoryLoading || isThreadLoading || !activeThreadId;

  // Once the active thread has any messages, it's no longer pristine.
  useEffect(() => {
    if (
      pristineThreadIdRef.current !== null &&
      pristineThreadIdRef.current === activeThreadId &&
      messages.length > 0
    ) {
      pristineThreadIdRef.current = null;
    }
  }, [activeThreadId, messages.length]);

  // If the active thread is the most recent untouched "New chat" with no
  // messages, delete it server-side and remove it from the sidebar.
  const discardPristineThreadIfUntouched = useCallback(async () => {
    const pristineId = pristineThreadIdRef.current;
    if (!pristineId) return;
    if (pristineId !== activeThreadId) {
      pristineThreadIdRef.current = null;
      return;
    }
    if (messages.length > 0) {
      pristineThreadIdRef.current = null;
      return;
    }
    pristineThreadIdRef.current = null;
    try {
      await deleteChatThread(pristineId);
      setThreads((current) => current.filter((thread) => thread.id !== pristineId));
    } catch (error) {
      console.error('Failed to discard untouched chat', error);
    }
  }, [activeThreadId, messages.length]);

  const initialPrompts = useMemo(
    () => EXAMPLE_PROMPTS.slice(0, HERO_SUGGESTION_COUNT),
    [],
  );
  const [heroPrompts, setHeroPrompts] = useState<string[]>(initialPrompts);

  useEffect(() => {
    if (isEmptyThread) {
      setHeroPrompts(pickPrompts(EXAMPLE_PROMPTS, HERO_SUGGESTION_COUNT));
    }
  }, [isEmptyThread]);

  const handleRetry = async () => {
    try {
      await regenerate();
    } catch (error) {
      console.error('Failed to regenerate response', error);
    }
  };

  const handleCreateThread = async () => {
    setHistoryError(null);
    setIsThreadLoading(true);
    try {
      await discardPristineThreadIfUntouched();
      const thread = await createChatThread();
      pristineThreadIdRef.current = thread.id;
      setThreads((current) => [thread, ...current.filter((item) => item.id !== thread.id)]);
      setActiveThreadId(thread.id);
      setHydratedMessages([]);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Failed to create chat.');
    } finally {
      setIsThreadLoading(false);
    }
  };

  const handleSelectThread = async (threadId: string) => {
    if (!threadId || threadId === activeThreadId) {
      return;
    }
    await discardPristineThreadIfUntouched();
    await openThread(threadId);
  };

  const handleRenameThread = useCallback(
    async (threadId: string) => {
      const currentTitle = threads.find((thread) => thread.id === threadId)?.title ?? 'New chat';
      const nextTitle = window.prompt('Rename chat', currentTitle)?.trim();
      if (!nextTitle || nextTitle === currentTitle) {
        return;
      }

      setHistoryError(null);
      try {
        const updated = await renameChatThread(threadId, nextTitle);
        setThreads((current) => current.map((thread) => (thread.id === updated.id ? updated : thread)));
      } catch (error) {
        setHistoryError(error instanceof Error ? error.message : 'Failed to rename chat.');
      }
    },
    [threads],
  );

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      const currentTitle = threads.find((thread) => thread.id === threadId)?.title ?? 'this chat';
      if (!window.confirm(`Delete "${currentTitle}"?`)) {
        return;
      }

      const wasActive = threadId === activeThreadId;
      if (pristineThreadIdRef.current === threadId) {
        pristineThreadIdRef.current = null;
      }
      setHistoryError(null);
      setIsThreadLoading(true);
      try {
        await deleteChatThread(threadId);
        const remainingThreads = await refreshThreads();
        if (!wasActive) {
          return;
        }
        if (remainingThreads.length > 0) {
          await openThread(remainingThreads[0].id);
          return;
        }
        const replacement = await createChatThread();
        pristineThreadIdRef.current = replacement.id;
        setThreads([replacement]);
        setActiveThreadId(replacement.id);
        setHydratedMessages([]);
      } catch (error) {
        setHistoryError(error instanceof Error ? error.message : 'Failed to delete chat.');
      } finally {
        setIsThreadLoading(false);
      }
    },
    [activeThreadId, openThread, refreshThreads, threads],
  );

  return (
    <div className={cn('flex h-full min-h-0 w-full', className)}>
      <aside
        className={cn(
          'relative flex h-full flex-shrink-0 flex-col overflow-hidden border-r border-border bg-surface-2 transition-[width] duration-200 ease-out',
          isSidebarOpen ? 'w-64' : 'w-14',
        )}
      >
        <div className={cn('flex flex-shrink-0 flex-col gap-0.5', isSidebarOpen ? 'px-2 pt-2' : 'px-1 pt-2')}>
          {isSidebarOpen ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void handleCreateThread()}
                disabled={!isSignedIn || isHistoryLoading || isThreadLoading}
                className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 text-sm font-medium text-foreground transition hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="New chat"
                title="New chat"
              >
                <Plus className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">New chat</span>
              </button>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-1 hover:text-foreground"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="inline-flex h-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-1 hover:text-foreground"
                aria-label="Open sidebar"
                title="Open sidebar"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void handleCreateThread()}
                disabled={!isSignedIn || isHistoryLoading || isThreadLoading}
                className="inline-flex h-9 items-center justify-center rounded-md text-foreground transition hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="New chat"
                title="New chat"
              >
                <MessageSquarePlus className="h-4 w-4" />
              </button>
            </>
          )}
          <div
            aria-disabled="true"
            className={cn(
              'flex h-9 cursor-default items-center gap-2.5 rounded-md text-sm font-medium text-muted-foreground/80',
              isSidebarOpen ? 'px-2' : 'justify-center px-0',
            )}
            title="Search chats (coming soon)"
          >
            <Search className="h-4 w-4 flex-shrink-0" />
            {isSidebarOpen && <span className="truncate">Search chats</span>}
          </div>
        </div>

        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overflow-x-hidden',
            isSidebarOpen ? 'px-2 pt-3' : 'px-1 pt-3',
          )}
        >
          {isSidebarOpen ? (
            !isSignedIn ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">
                Sign in to view saved chats.
              </p>
            ) : isHistoryLoading && threads.length === 0 ? (
              <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading...
              </div>
            ) : threads.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">No chats yet.</p>
            ) : (
              <>
                <p className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground">
                  Recents
                </p>
                <ul className="space-y-0.5">
                  {threads.map((thread) => {
                    const isActive = thread.id === activeThreadId;
                    const title = thread.title || 'New chat';
                    return (
                      <li key={thread.id}>
                        <div
                          className={cn(
                            'group relative flex w-full items-center rounded-md text-sm transition',
                            isActive
                              ? 'bg-surface-1 text-foreground'
                              : 'text-muted-foreground hover:bg-surface-1 hover:text-foreground',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => void handleSelectThread(thread.id)}
                            className="min-w-0 flex-1 truncate px-2 py-1.5 text-left"
                            title={title}
                          >
                            {title}
                          </button>
                          <div
                            className={cn(
                              'absolute right-1 flex items-center gap-0.5 rounded-md bg-surface-1 pl-1.5 pr-1',
                              isActive ? '' : 'opacity-0 group-hover:opacity-100',
                            )}
                          >
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleRenameThread(thread.id);
                              }}
                              disabled={isThreadLoading}
                              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label="Rename chat"
                              title="Rename chat"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDeleteThread(thread.id);
                              }}
                              disabled={isThreadLoading}
                              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label="Delete chat"
                              title="Delete chat"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )
          ) : null}
        </div>

        <div className="mt-auto flex-shrink-0 border-t border-border-subtle p-2">
          {userEmail ? (
            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md text-left transition hover:bg-surface-1',
                    isSidebarOpen ? 'px-2 py-1.5' : 'justify-center p-1',
                  )}
                  aria-label="Account menu"
                  title={userEmail}
                >
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold uppercase text-primary">
                    {userEmail.charAt(0).toUpperCase()}
                  </span>
                  {isSidebarOpen && (
                    <>
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                        {userEmail}
                      </span>
                      <ChevronUp className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    </>
                  )}
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="start"
                  side="top"
                  sideOffset={6}
                  className="z-50 min-w-[220px] rounded-xl border border-border bg-surface-2 p-1 text-sm shadow-elev-2 animate-fade-up"
                >
                  <div className="border-b border-border-subtle px-3 py-2 text-xs text-muted-foreground">
                    <p className="truncate text-foreground">{userEmail}</p>
                  </div>
                  <DropdownMenu.Item asChild>
                    <Link
                      href="/profile"
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground outline-none transition hover:bg-surface-1"
                    >
                      <UserCircle className="h-4 w-4" />
                      View full profile
                    </Link>
                  </DropdownMenu.Item>
                  {onToggleTheme && (
                    <DropdownMenu.Item
                      onSelect={(event) => {
                        event.preventDefault();
                        onToggleTheme();
                      }}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground outline-none transition hover:bg-surface-1"
                    >
                      {theme === 'dark' ? (
                        <Sun className="h-4 w-4" />
                      ) : (
                        <MoonStar className="h-4 w-4" />
                      )}
                      {theme === 'dark' ? 'Light theme' : 'Dark theme'}
                    </DropdownMenu.Item>
                  )}
                  {onSignOut && (
                    <>
                      <DropdownMenu.Separator className="my-1 h-px bg-border-subtle" />
                      <DropdownMenu.Item
                        onSelect={() => {
                          void onSignOut();
                        }}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive outline-none transition hover:bg-destructive/10"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </DropdownMenu.Item>
                    </>
                  )}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : (
            <Link
              href="/login"
              className={cn(
                'flex items-center gap-2 rounded-md text-sm font-medium text-foreground transition hover:bg-surface-1',
                isSidebarOpen ? 'px-2 py-1.5' : 'justify-center p-1',
              )}
              aria-label="Sign in"
              title="Sign in"
            >
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface-1 text-muted-foreground">
                <UserCircle className="h-4 w-4" />
              </span>
              {isSidebarOpen && <span className="truncate">Sign in</span>}
            </Link>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {historyError && (
          <div className="border-b border-border-subtle bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {historyError}
          </div>
        )}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {!isAuthReady || isHistoryLoading || isThreadLoading ? (
            <div className="absolute inset-0 flex items-center justify-center px-4 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading saved chats...
            </div>
          ) : !isSignedIn ? (
            <div className="absolute inset-0 flex items-center justify-center px-4 text-center">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-foreground">Sign in to save chats</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Saved chat history is available for authenticated users.
                </p>
              </div>
            </div>
          ) : showHero && isEmptyThread && !isBusy ? (
            <div className="absolute inset-0 flex items-center justify-center px-4">
              <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  {heroTitle}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">{heroSubtitle}</p>
                <div className="mt-6 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                  {heroPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => {
                        void sendSocMessage({ text: prompt });
                      }}
                      className={cn(
                        'rounded-xl border border-border-subtle bg-surface-1 px-3 py-2.5 text-left text-sm text-foreground/90 shadow-elev-1',
                        'transition-colors hover:border-border hover:bg-surface-2 hover:text-foreground',
                      )}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <SocChatMessages
              messages={messages}
              status={status}
              onRetry={handleRetry}
            />
          )}
        </div>
        <div className="flex-shrink-0 px-4 pb-3 pt-2">
          <div className="mx-auto w-full max-w-3xl">
            <SocChatInput
              disabled={isBusy || isChatUnavailable}
              isEmptyThread={isEmptyThread}
              onSubmit={sendSocMessage}
              onStop={() => void stop()}
            />
            <p className="mt-1.5 text-center text-[11px] text-muted-foreground/70">
              Replies may be inaccurate. Verify against the official Rutgers Schedule of Classes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
