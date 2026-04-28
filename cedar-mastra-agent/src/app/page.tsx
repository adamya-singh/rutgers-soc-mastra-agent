'use client';

import React from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { AnimatePresence, motion } from 'motion/react';
import {
  useRegisterState,
  useRegisterFrontendTool,
  useSubscribeStateToAgentContext,
  useCedarStore,
} from 'cedar-os';
import { supabaseClient } from '@/lib/supabaseClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/cedar/components/ui/dialog';

import {
  SearchResults,
  type SearchResultItem,
  type SearchResultSection,
} from '@/components/search/SearchResults';
import { ScheduleGrid } from '@/components/schedule/ScheduleGrid';
import { EmbeddedCedarChat } from '@/cedar/components/chatComponents/EmbeddedCedarChat';
import { DebuggerPanel } from '@/cedar/components/debugger';
import {
  addSectionToSchedule,
  clearLocalSchedules,
  dispatchScheduleUpdated,
  loadSchedule,
  removeSectionFromSchedule,
  saveSchedule,
} from '@/lib/scheduleStorage';
import { getClientIdentity } from '@/lib/clientIdentity';

type BrowserTarget = 'degree_navigator';
type BrowserSessionStatus = 'created' | 'awaiting_login' | 'ready' | 'error' | 'closed';
type BrowserPaneStatus = 'idle' | 'launching' | 'awaiting_login' | 'ready' | 'error';
type BrowserCloseReason =
  | 'manual_stop'
  | 'pagehide'
  | 'beforeunload'
  | 'hidden_timeout'
  | 'idle_timeout'
  | 'startup_cleanup'
  | 'reaper';

interface BrowserSessionState {
  provider: 'browserbase';
  sessionId: string;
  liveViewUrl: string;
  target: BrowserTarget;
  status: BrowserSessionStatus;
  ownerId: string;
  createdAt: string;
  lastHeartbeatAt: string;
}

interface BrowserSessionApiResponse {
  session: BrowserSessionState;
}

interface BrowserCloseApiResponse {
  accepted: boolean;
  terminated: boolean;
  terminationMethod?: string;
  terminationVerified?: boolean;
  providerStillRunning?: boolean;
  session?: BrowserSessionState | null;
}

interface PersistedBrowserSessionRecord {
  sessionId: string;
  userId: string;
  updatedAt: string;
}

const MASTRA_BASE_URL = process.env.NEXT_PUBLIC_MASTRA_URL || 'http://localhost:4111';
const ACTIVE_BROWSER_SESSION_STORAGE_KEY = 'active_browser_session';
const HIDDEN_TIMEOUT_MS = 30_000;
const IDLE_TIMEOUT_MS = 60_000;

function getBrowserPaneStatus(session: BrowserSessionState | null): BrowserPaneStatus {
  if (!session) {
    return 'idle';
  }

  if (session.status === 'ready') {
    return 'ready';
  }

  if (session.status === 'error') {
    return 'error';
  }

  return 'awaiting_login';
}

function getBrowserStatusLabel(status: BrowserPaneStatus): string {
  switch (status) {
    case 'idle':
      return 'Idle';
    case 'launching':
      return 'Launching session';
    case 'awaiting_login':
      return 'Awaiting Rutgers login';
    case 'ready':
      return 'Ready';
    case 'error':
      return 'Error';
    default:
      return 'Idle';
  }
}

export default function HomePage() {
  const [theme, setTheme] = React.useState<'light' | 'dark'>('dark');

  const [mainText, setMainText] = React.useState('');
  const [textLines, setTextLines] = React.useState<string[]>([]);
  const [searchResults, setSearchResults] = React.useState<SearchResultItem[]>([]);
  const [userEmail, setUserEmail] = React.useState<string | null>(null);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [accessToken, setAccessToken] = React.useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);

  const [browserClientId, setBrowserClientId] = React.useState<string>(() => getClientIdentity().browserClientId);
  const [browserSession, setBrowserSession] = React.useState<BrowserSessionState | null>(null);
  const [browserPaneStatus, setBrowserPaneStatus] = React.useState<BrowserPaneStatus>('idle');
  const [browserError, setBrowserError] = React.useState<string | null>(null);
  const [isStoppingSession, setIsStoppingSession] = React.useState(false);
  const [autoStopMessage, setAutoStopMessage] = React.useState<string | null>(null);
  const [isDesktopLayout, setIsDesktopLayout] = React.useState(false);
  const [isBrowserSectionInView, setIsBrowserSectionInView] = React.useState(false);

  const browserSectionRef = React.useRef<HTMLElement | null>(null);
  const hiddenTimeoutRef = React.useRef<number | null>(null);
  const idleTimeoutRef = React.useRef<number | null>(null);
  const hiddenDeadlineRef = React.useRef<number | null>(null);
  const idleDeadlineRef = React.useRef<number | null>(null);
  const countdownIntervalRef = React.useRef<number | null>(null);
  const stopInFlightForSessionRef = React.useRef<string | null>(null);
  const unloadStopSentForSessionRef = React.useRef<string | null>(null);
  const startupCleanupRanRef = React.useRef(false);

  const setShowChat = useCedarStore((state) => state.setShowChat);

  React.useEffect(() => {
    setShowChat(true);
  }, [setShowChat]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const identity = getClientIdentity();
    setBrowserClientId(identity.browserClientId);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(min-width: 1280px)');
    const updateDesktopLayout = () => setIsDesktopLayout(mediaQuery.matches);

    updateDesktopLayout();
    mediaQuery.addEventListener('change', updateDesktopLayout);

    return () => {
      mediaQuery.removeEventListener('change', updateDesktopLayout);
    };
  }, []);

  React.useEffect(() => {
    const sectionElement = browserSectionRef.current;
    if (!sectionElement) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsBrowserSectionInView(entry?.isIntersecting ?? false);
      },
      {
        root: null,
        threshold: 0.35,
      },
    );

    observer.observe(sectionElement);

    return () => {
      observer.disconnect();
    };
  }, [browserSectionRef]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedTheme = window.localStorage.getItem('theme');
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const nextTheme =
      storedTheme === 'light' || storedTheme === 'dark'
        ? storedTheme
        : prefersDark
          ? 'dark'
          : 'light';
    setTheme(nextTheme);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem('theme', theme);
  }, [theme]);

  React.useEffect(() => {
    let isMounted = true;
    supabaseClient.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) {
        console.warn('Failed to read auth state', error);
        setUserEmail(null);
        setUserId(null);
        setAccessToken(null);
        return;
      }
      setUserEmail(data.session?.user?.email ?? null);
      setUserId(data.session?.user?.id ?? null);
      setAccessToken(data.session?.access_token ?? null);
    });

    const { data: authListener } = supabaseClient.auth.onAuthStateChange(
      (_event, session) => {
        setUserEmail(session?.user?.email ?? null);
        setUserId(session?.user?.id ?? null);
        setAccessToken(session?.access_token ?? null);
      },
    );

    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const callBrowserSessionApi = React.useCallback(
    async (
      path:
        | '/browser/session/create'
        | '/browser/session/status'
        | '/browser/session/close'
        | '/browser/session/close-beacon',
      payload: object,
    ): Promise<BrowserSessionApiResponse | BrowserCloseApiResponse> => {
      if (!accessToken) {
        throw new Error('Sign in before using browser sessions.');
      }

      const response = await fetch(`${MASTRA_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      const json = text ? (JSON.parse(text) as { error?: string }) : {};
      if (!response.ok) {
        throw new Error(json.error ?? `Browser API request failed (${response.status})`);
      }

      return json as BrowserSessionApiResponse | BrowserCloseApiResponse;
    },
    [accessToken],
  );

  const persistActiveBrowserSession = React.useCallback((session: BrowserSessionState, authenticatedUserId: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    const record: PersistedBrowserSessionRecord = {
      sessionId: session.sessionId,
      userId: authenticatedUserId,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(ACTIVE_BROWSER_SESSION_STORAGE_KEY, JSON.stringify(record));
  }, []);

  const clearActiveBrowserSessionRecord = React.useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.removeItem(ACTIVE_BROWSER_SESSION_STORAGE_KEY);
  }, []);

  const sendCloseBeacon = React.useCallback(
    (record: { sessionId: string }, reason: BrowserCloseReason) => {
      if (!accessToken) {
        return;
      }

      const payload = {
        sessionId: record.sessionId,
        reason,
        allowUntracked: true,
        accessToken,
      };
      const endpoint = `${MASTRA_BASE_URL}/browser/session/close-beacon`;
      const body = JSON.stringify(payload);
      const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });

      let sent = false;
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        sent = navigator.sendBeacon(endpoint, blob);
      }

      if (!sent) {
        void fetch(endpoint, {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'text/plain;charset=UTF-8',
          },
          body,
        }).catch(() => undefined);
      }
    },
    [accessToken],
  );

  const closeSessionByIds = React.useCallback(
    async (options: {
      sessionId: string;
      reason: BrowserCloseReason;
      allowUntracked?: boolean;
      silent?: boolean;
    }): Promise<BrowserCloseApiResponse> => {
      const result = (await callBrowserSessionApi('/browser/session/close', {
        sessionId: options.sessionId,
        reason: options.reason,
        allowUntracked: options.allowUntracked ?? false,
      })) as BrowserCloseApiResponse;

      if (process.env.NODE_ENV !== 'production') {
        console.info('[browser-ui] close result', {
          sessionId: options.sessionId,
          reason: options.reason,
          silent: options.silent ?? false,
          accepted: result.accepted,
          terminated: result.terminated,
          terminationMethod: result.terminationMethod,
          terminationVerified: result.terminationVerified,
          providerStillRunning: result.providerStillRunning,
        });
      }

      return result;
    },
    [callBrowserSessionApi],
  );

  const closeBrowserSessionWithReason = React.useCallback(
    async (options: {
      reason: BrowserCloseReason;
      allowUntracked?: boolean;
      silent?: boolean;
      sessionId?: string;
    }): Promise<boolean> => {
      const sessionId = options.sessionId ?? browserSession?.sessionId;

      if (!sessionId) {
        return false;
      }

      if (stopInFlightForSessionRef.current === sessionId) {
        return false;
      }
      stopInFlightForSessionRef.current = sessionId;

      if (!options.silent) {
        setIsStoppingSession(true);
        setBrowserPaneStatus('launching');
      }
      setBrowserError(null);

      try {
        const result = await closeSessionByIds({
          sessionId,
          reason: options.reason,
          allowUntracked: options.allowUntracked ?? false,
          silent: options.silent,
        });

        if (result.terminated) {
          if (browserSession?.sessionId === sessionId) {
            setBrowserSession(null);
            setBrowserPaneStatus('idle');
            setAutoStopMessage(null);
          }
          clearActiveBrowserSessionRecord();
          return true;
        }

        if (!options.silent && browserSession?.sessionId === sessionId) {
          setBrowserPaneStatus('error');
          setBrowserError('Stop request did not terminate provider session. Retry Stop Session.');
        }

        return false;
      } catch (error) {
        if (!options.silent) {
          setBrowserPaneStatus('error');
          setBrowserError(error instanceof Error ? error.message : 'Failed to stop browser session.');
        }
        return false;
      } finally {
        if (!options.silent) {
          setIsStoppingSession(false);
        }
        stopInFlightForSessionRef.current = null;
      }
    },
    [
      browserSession,
      clearActiveBrowserSessionRecord,
      closeSessionByIds,
    ],
  );

  const launchDegreeNavigatorSession = React.useCallback(async () => {
    if (isStoppingSession) {
      return;
    }

    setBrowserError(null);
    setBrowserPaneStatus('launching');

    if (!userId) {
      setBrowserPaneStatus('error');
      setBrowserError('Sign in before launching Degree Navigator.');
      return;
    }

    try {
      const result = (await callBrowserSessionApi('/browser/session/create', {
        target: 'degree_navigator',
      })) as BrowserSessionApiResponse;

      if (process.env.NODE_ENV !== 'production') {
        console.info('[browser-ui] launch success', {
          sessionId: result.session.sessionId,
          userId,
        });
      }

      setBrowserSession(result.session);
      setBrowserPaneStatus(getBrowserPaneStatus(result.session));
      persistActiveBrowserSession(result.session, userId);
    } catch (error) {
      setBrowserPaneStatus('error');
      setBrowserError(error instanceof Error ? error.message : 'Failed to create browser session.');
    }
  }, [callBrowserSessionApi, isStoppingSession, persistActiveBrowserSession, userId]);

  const closeDegreeNavigatorSession = React.useCallback(async () => {
    if (!browserSession) {
      setBrowserSession(null);
      setBrowserPaneStatus('idle');
      setBrowserError(null);
      clearActiveBrowserSessionRecord();
      return;
    }

    await closeBrowserSessionWithReason({
      reason: 'manual_stop',
      allowUntracked: false,
    });
  }, [browserSession, clearActiveBrowserSessionRecord, closeBrowserSessionWithReason]);

  const refreshSessionStatus = React.useCallback(
    async (options?: { silent?: boolean }) => {
      if (!browserSession) {
        return;
      }

      setBrowserError(null);
      if (!options?.silent) {
        setBrowserPaneStatus('launching');
      }

      try {
        const result = (await callBrowserSessionApi('/browser/session/status', {
          sessionId: browserSession.sessionId,
        })) as BrowserSessionApiResponse;

        if (result.session.status === 'closed') {
          setBrowserSession(null);
          setBrowserPaneStatus('idle');
          clearActiveBrowserSessionRecord();
          return;
        }

        setBrowserSession(result.session);
        setBrowserPaneStatus(getBrowserPaneStatus(result.session));
        if (userId) {
          persistActiveBrowserSession(result.session, userId);
        }
      } catch (error) {
        setBrowserPaneStatus('error');
        setBrowserError(error instanceof Error ? error.message : 'Failed to refresh browser session status.');
      }
    },
    [
      browserSession,
      callBrowserSessionApi,
      clearActiveBrowserSessionRecord,
      persistActiveBrowserSession,
      userId,
    ],
  );

  const keepBrowserSessionAlive = React.useCallback(() => {
    if (!browserSession) {
      return;
    }

    setBrowserError(null);
    void refreshSessionStatus({ silent: true });
  }, [browserSession, refreshSessionStatus]);

  React.useEffect(() => {
    if (!browserSession) {
      return;
    }

    const interval = window.setInterval(() => {
      refreshSessionStatus({ silent: true }).catch(() => undefined);
    }, 20000);

    return () => {
      window.clearInterval(interval);
    };
  }, [browserSession, refreshSessionStatus]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !browserSession) {
      return;
    }

    const handleBrowserbaseMessage = (event: MessageEvent) => {
      if (event.data !== 'browserbase-disconnected') {
        return;
      }

      setBrowserSession(null);
      setBrowserPaneStatus('idle');
      setBrowserError('Browserbase live view disconnected. Launch a new session to continue.');
      clearActiveBrowserSessionRecord();
    };

    window.addEventListener('message', handleBrowserbaseMessage);
    return () => {
      window.removeEventListener('message', handleBrowserbaseMessage);
    };
  }, [browserSession, clearActiveBrowserSessionRecord]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (startupCleanupRanRef.current) {
      return;
    }
    startupCleanupRanRef.current = true;

    const raw = window.localStorage.getItem(ACTIVE_BROWSER_SESSION_STORAGE_KEY);
    if (!raw) {
      return;
    }

    let parsed: PersistedBrowserSessionRecord | null = null;
    try {
      parsed = JSON.parse(raw) as PersistedBrowserSessionRecord;
    } catch {
      window.localStorage.removeItem(ACTIVE_BROWSER_SESSION_STORAGE_KEY);
      return;
    }

    if (!parsed?.sessionId || !parsed?.userId) {
      window.localStorage.removeItem(ACTIVE_BROWSER_SESSION_STORAGE_KEY);
      return;
    }

    if (!userId || parsed.userId !== userId) {
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.info('[browser-ui] startup cleanup candidate', {
        sessionId: parsed.sessionId,
        userId: parsed.userId,
      });
    }

    void (async () => {
      const result = await closeSessionByIds({
        reason: 'startup_cleanup',
        allowUntracked: true,
        silent: true,
        sessionId: parsed.sessionId,
      });

      if (result.terminated) {
        clearActiveBrowserSessionRecord();
      }
    })();
  }, [clearActiveBrowserSessionRecord, closeSessionByIds, userId]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !browserSession) {
      unloadStopSentForSessionRef.current = null;
      return;
    }

    const sendForReason = (reason: BrowserCloseReason) => {
      if (unloadStopSentForSessionRef.current === browserSession.sessionId) {
        return;
      }
      unloadStopSentForSessionRef.current = browserSession.sessionId;

      sendCloseBeacon(
        {
          sessionId: browserSession.sessionId,
        },
        reason,
      );
    };

    const onPageHide = () => sendForReason('pagehide');
    const onBeforeUnload = () => sendForReason('beforeunload');

    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [browserSession, sendCloseBeacon]);

  React.useEffect(() => {
    const clearHiddenTimeout = () => {
      if (hiddenTimeoutRef.current) {
        window.clearTimeout(hiddenTimeoutRef.current);
        hiddenTimeoutRef.current = null;
      }
      hiddenDeadlineRef.current = null;
    };

    const clearIdleTimeout = () => {
      if (idleTimeoutRef.current) {
        window.clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
      idleDeadlineRef.current = null;
    };

    if (!browserSession) {
      clearHiddenTimeout();
      clearIdleTimeout();
      if (countdownIntervalRef.current) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      setAutoStopMessage(null);
      return;
    }

    const startHiddenTimeout = () => {
      clearHiddenTimeout();
      hiddenDeadlineRef.current = Date.now() + HIDDEN_TIMEOUT_MS;
      hiddenTimeoutRef.current = window.setTimeout(() => {
        void closeBrowserSessionWithReason({
          reason: 'hidden_timeout',
          allowUntracked: true,
        });
      }, HIDDEN_TIMEOUT_MS);
    };

    const startIdleTimeout = () => {
      clearIdleTimeout();
      idleDeadlineRef.current = Date.now() + IDLE_TIMEOUT_MS;
      idleTimeoutRef.current = window.setTimeout(() => {
        void closeBrowserSessionWithReason({
          reason: 'idle_timeout',
          allowUntracked: true,
        });
      }, IDLE_TIMEOUT_MS);
    };

    const handleUserActivity = () => {
      if (!browserSession) {
        return;
      }
      startIdleTimeout();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        startHiddenTimeout();
      } else {
        clearHiddenTimeout();
      }
      handleUserActivity();
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'touchstart',
      'scroll',
      'mousemove',
    ];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleUserActivity, { passive: true });
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);
    handleUserActivity();
    if (document.visibilityState === 'hidden') {
      startHiddenTimeout();
    }

    countdownIntervalRef.current = window.setInterval(() => {
      const now = Date.now();
      const hiddenLeftMs = hiddenDeadlineRef.current ? Math.max(0, hiddenDeadlineRef.current - now) : null;
      const idleLeftMs = idleDeadlineRef.current ? Math.max(0, idleDeadlineRef.current - now) : null;

      if (hiddenLeftMs !== null) {
        setAutoStopMessage(`Auto-stop in ${Math.ceil(hiddenLeftMs / 1000)}s because tab is hidden.`);
      } else if (idleLeftMs !== null) {
        setAutoStopMessage(`Auto-stop in ${Math.ceil(idleLeftMs / 1000)}s due to inactivity.`);
      } else {
        setAutoStopMessage(null);
      }
    }, 1000);

    return () => {
      clearHiddenTimeout();
      clearIdleTimeout();
      if (countdownIntervalRef.current) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleUserActivity);
      });
      setAutoStopMessage(null);
    };
  }, [browserSession, closeBrowserSessionWithReason]);

  useRegisterState({
    key: 'mainText',
    description: 'The main text that can be modified by Cedar',
    value: mainText,
    setValue: setMainText,
    stateSetters: {
      changeText: {
        name: 'changeText',
        description: 'Change the main text to a new value',
        argsSchema: z.object({
          newText: z.string().min(1, 'Text cannot be empty').describe('The new text to display'),
        }),
        execute: (
          _currentText: string,
          setValue: (newValue: string) => void,
          args: { newText: string },
        ) => {
          setValue(args.newText);
        },
      },
    },
  });

  useRegisterState({
    key: 'browserClientId',
    description: 'Browser client identity used to enforce session ownership',
    value: browserClientId,
    setValue: setBrowserClientId,
  });

  const BrowserSessionSchema = z.object({
    provider: z.literal('browserbase'),
    sessionId: z.string().min(1),
    liveViewUrl: z.string().url(),
    target: z.enum(['degree_navigator']),
    status: z.enum(['created', 'awaiting_login', 'ready', 'error', 'closed']),
    ownerId: z.string().min(1),
    createdAt: z.string().min(1),
    lastHeartbeatAt: z.string().min(1),
  });

  useRegisterState({
    key: 'browserSession',
    description: 'Current Browserbase session metadata for embedded Degree Navigator automation',
    value: browserSession,
    setValue: setBrowserSession,
    stateSetters: {
      setBrowserSession: {
        name: 'setBrowserSession',
        description: 'Set browser session details for the embedded browser pane',
        argsSchema: z.object({
          session: BrowserSessionSchema.nullable(),
        }),
        execute: (
          _currentValue: BrowserSessionState | null,
          setValue: (newValue: BrowserSessionState | null) => void,
          args: { session: BrowserSessionState | null },
        ) => {
          setValue(args.session);
        },
      },
      clearBrowserSession: {
        name: 'clearBrowserSession',
        description: 'Clear browser session state from the UI',
        argsSchema: z.object({}),
        execute: (
          _currentValue: BrowserSessionState | null,
          setValue: (newValue: BrowserSessionState | null) => void,
        ) => {
          setValue(null);
        },
      },
    },
  });

  const SearchResultMeetingTimeSchema = z.object({
    day: z.string().optional(),
    startTimeMilitary: z.string().optional(),
    endTimeMilitary: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    building: z.string().optional(),
    room: z.string().optional(),
    campus: z.string().optional(),
    mode: z.string().optional(),
    isOnline: z.boolean().optional(),
  });

  const SearchResultSectionSchema = z.object({
    indexNumber: z.string().min(1, 'Index number is required'),
    sectionId: z.number().optional(),
    courseString: z.string().optional(),
    courseTitle: z.string().optional(),
    credits: z.number().optional(),
    sectionNumber: z.string().optional(),
    instructors: z.array(z.string()).optional(),
    isOpen: z.boolean().optional(),
    meetingTimes: z.array(SearchResultMeetingTimeSchema).optional(),
    isOnline: z.boolean().optional(),
    sessionDates: z.string().optional(),
  });

  const SearchResultMiscSchema = z.object({
    body: z.string().optional(),
    fields: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
        }),
      )
      .optional(),
    href: z.string().optional(),
  });

  const SearchResultItemSchema = z.object({
    id: z.string().min(1, 'ID is required'),
    type: z.enum(['section', 'course', 'misc']).optional(),
    title: z.string().min(1, 'Title is required'),
    subtitle: z.string().optional(),
    summary: z.string().optional(),
    badges: z.array(z.string()).optional(),
    details: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
        }),
      )
      .optional(),
    section: SearchResultSectionSchema.optional(),
    misc: SearchResultMiscSchema.optional(),
    termYear: z.number().optional(),
    termCode: z.string().optional(),
    campus: z.string().optional(),
  });

  type AddSectionPayload = {
    section: SearchResultSection;
    termYear?: number;
    termCode?: string;
    campus?: string;
  };

  const applyAddSection = React.useCallback((args: AddSectionPayload) => {
    const schedule = loadSchedule();
    const hasSections = schedule.sections.length > 0;

    if (args.termYear && args.termYear !== schedule.termYear && hasSections) {
      throw new Error(`Schedule is for ${schedule.termYear}. Clear it before adding a new term.`);
    }
    if (args.termCode && args.termCode !== schedule.termCode && hasSections) {
      throw new Error(`Schedule is for term ${schedule.termCode}. Clear it before adding a new term.`);
    }
    if (args.campus && args.campus !== schedule.campus && hasSections) {
      throw new Error(`Schedule is for campus ${schedule.campus}. Clear it before adding a new campus.`);
    }

    const nextSchedule = {
      ...schedule,
      termYear: args.termYear ?? schedule.termYear,
      termCode: args.termCode ?? schedule.termCode,
      campus: args.campus ?? schedule.campus,
    };

    const { schedule: updated } = addSectionToSchedule(nextSchedule, args.section);
    saveSchedule(updated);
    dispatchScheduleUpdated();
  }, []);

  const handleAddSection = React.useCallback(
    async (payload: AddSectionPayload) => {
      try {
        applyAddSection(payload);
      } catch (error) {
        console.error('Failed to add section from search results', error);
      }
    },
    [applyAddSection],
  );

  useRegisterState({
    key: 'searchResults',
    description: 'Search results panel controlled by the agent',
    value: searchResults,
    setValue: setSearchResults,
    stateSetters: {
      clearSearchResults: {
        name: 'clearSearchResults',
        description: 'Clear all search results from the panel',
        argsSchema: z.object({}),
        execute: (
          _currentValue: SearchResultItem[],
          setValue: (newValue: SearchResultItem[]) => void,
        ) => {
          setValue([]);
        },
      },
      setSearchResults: {
        name: 'setSearchResults',
        description: 'Replace search results with a new list of result cards',
        argsSchema: z.object({
          results: z.array(SearchResultItemSchema),
        }),
        execute: (
          _currentValue: SearchResultItem[],
          setValue: (newValue: SearchResultItem[]) => void,
          args: { results: SearchResultItem[] },
        ) => {
          setValue(args.results);
        },
      },
      appendSearchResults: {
        name: 'appendSearchResults',
        description: 'Append one or more result cards to the search results panel',
        argsSchema: z.object({
          results: z.array(SearchResultItemSchema),
        }),
        execute: (
          currentValue: SearchResultItem[],
          setValue: (newValue: SearchResultItem[]) => void,
          args: { results: SearchResultItem[] },
        ) => {
          setValue([...currentValue, ...args.results]);
        },
      },
    },
  });

  useSubscribeStateToAgentContext('mainText', (mainText) => ({ mainText }), {
    showInChat: true,
    color: '#4F46E5',
  });

  useSubscribeStateToAgentContext(
    'browserClientId',
    (browserClientId) => ({ browserClientId }),
    {
      showInChat: false,
      color: '#0EA5E9',
    },
  );

  useSubscribeStateToAgentContext(
    'browserSession',
    (browserSession) => ({
      browserSession,
    }),
    {
      showInChat: false,
      color: '#0284C7',
    },
  );

  useRegisterFrontendTool({
    name: 'addNewTextLine',
    description: 'Add a new line of text to the screen via frontend tool',
    argsSchema: z.object({
      text: z.string().min(1, 'Text cannot be empty').describe('The text to add to the screen'),
      style: z
        .enum(['normal', 'bold', 'italic', 'highlight'])
        .optional()
        .describe('Text style to apply'),
    }),
    execute: async (args: { text: string; style?: 'normal' | 'bold' | 'italic' | 'highlight' }) => {
      const styledText =
        args.style === 'bold'
          ? `**${args.text}**`
          : args.style === 'italic'
            ? `*${args.text}*`
            : args.style === 'highlight'
              ? `🌟 ${args.text} 🌟`
              : args.text;
      setTextLines((prev) => [...prev, styledText]);
    },
  });

  useRegisterFrontendTool({
    name: 'addSectionToSchedule',
    description: 'Add a course section to the current schedule',
    argsSchema: z.object({
      section: z.object({
        indexNumber: z.string().min(1, 'Index number is required'),
        sectionId: z.number().optional(),
        courseString: z.string().optional(),
        courseTitle: z.string().optional(),
        credits: z.number().optional(),
        sectionNumber: z.string().optional(),
        instructors: z.array(z.string()).optional(),
        isOpen: z.boolean().optional(),
        meetingTimes: z
          .array(
            z.object({
              day: z.string().optional(),
              startTimeMilitary: z.string().optional(),
              endTimeMilitary: z.string().optional(),
              startTime: z.string().optional(),
              endTime: z.string().optional(),
              building: z.string().optional(),
              room: z.string().optional(),
              campus: z.string().optional(),
              mode: z.string().optional(),
              isOnline: z.boolean().optional(),
            }),
          )
          .optional(),
        isOnline: z.boolean().optional(),
        sessionDates: z.string().optional(),
      }),
      termYear: z.number().optional(),
      termCode: z.string().optional(),
      campus: z.string().optional(),
    }),
    execute: async (args) => {
      applyAddSection(args);
    },
  });

  useRegisterFrontendTool({
    name: 'removeSectionFromSchedule',
    description: 'Remove a course section from the current schedule by index number',
    argsSchema: z.object({
      indexNumber: z.string().min(1, 'Index number is required'),
    }),
    execute: async (args) => {
      const schedule = loadSchedule();
      const { schedule: updated } = removeSectionFromSchedule(
        schedule,
        args.indexNumber,
      );
      saveSchedule(updated);
      dispatchScheduleUpdated();
    },
  });

  useRegisterFrontendTool({
    name: 'launchDegreeNavigatorSession',
    description: 'Launch a Browserbase session and load Degree Navigator in the embedded browser pane.',
    argsSchema: z.object({}),
    execute: async () => {
      await launchDegreeNavigatorSession();
    },
  });

  useRegisterFrontendTool({
    name: 'closeDegreeNavigatorSession',
    description: 'Close the active Browserbase session for Degree Navigator.',
    argsSchema: z.object({}),
    execute: async () => {
      await closeDegreeNavigatorSession();
    },
  });

  useRegisterFrontendTool({
    name: 'refreshSessionStatus',
    description: 'Refresh status for the active Browserbase session.',
    argsSchema: z.object({}),
    execute: async () => {
      await refreshSessionStatus();
    },
  });

  const shouldDockChatToBrowser = isBrowserSectionInView && isDesktopLayout;
  const shouldRenderBrowserSectionChat = shouldDockChatToBrowser || (!isDesktopLayout && isBrowserSectionInView);

  const renderContent = () => (
    <div className="relative h-screen w-full overflow-hidden bg-background text-foreground">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -bottom-40 right-[-120px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(90,120,160,0.2),transparent_70%)] blur-3xl" />
      </div>

      <header className="pointer-events-none absolute left-0 right-0 top-0 z-20">
        <div className="mx-6 mt-6 flex items-center justify-between rounded-xl border border-border bg-surface-1 px-5 py-3 shadow-elev-1">
          <div className="flex items-center gap-6">
            <div className="pointer-events-auto text-xs uppercase tracking-[0.28em] text-muted-foreground">
              Rutgers SOC
            </div>
          </div>
          <div className="pointer-events-auto">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                className="rounded-full border border-border bg-surface-1 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground shadow-elev-1 transition hover:border-border-subtle hover:bg-surface-2"
              >
                {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
              {userEmail ? (
                <button
                  type="button"
                  onClick={() => setIsProfileOpen(true)}
                  className="rounded-full border border-border bg-surface-2/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground shadow-elev-1 transition hover:border-border-subtle hover:bg-surface-3"
                >
                  Profile
                </button>
              ) : (
                <Link
                  href="/login"
                  className="rounded-full border border-border bg-surface-2/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground shadow-elev-1 transition hover:border-border-subtle hover:bg-surface-3"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="fixed inset-0 z-50 pointer-events-none">
        <DebuggerPanel
          initialPosition={
            typeof window !== 'undefined'
              ? { x: window.innerWidth - 80, y: 120 }
              : undefined
          }
        />
      </div>

      <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <DialogContent className="border border-border bg-surface-2 text-foreground shadow-elev-2 sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Profile</DialogTitle>
            <DialogDescription>Signed in account</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-surface-1 px-4 py-3 text-sm text-foreground/80">
              {userEmail ?? 'Unknown email'}
            </div>
            <button
              type="button"
              onClick={async () => {
                await closeBrowserSessionWithReason({
                  reason: 'manual_stop',
                  allowUntracked: false,
                  silent: true,
                });
                await supabaseClient.auth.signOut();
                clearActiveBrowserSessionRecord();
                clearLocalSchedules();
                setBrowserSession(null);
                setBrowserPaneStatus('idle');
                setBrowserError(null);
                setIsProfileOpen(false);
              }}
              className="w-full rounded-lg border border-border bg-surface-1 px-4 py-2 text-sm font-semibold text-foreground shadow-elev-1 transition hover:border-border-subtle hover:bg-surface-2"
            >
              Sign out
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex h-full flex-col pt-24">
        <div className="flex-1 overflow-y-auto px-6 pb-10">
          <div className="mx-auto max-w-[1600px] space-y-8">
            <div className="grid w-full grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <ScheduleGrid />
              </div>

              <div className="min-w-0 space-y-6">
                <div className="min-h-[350px]">
                  <SearchResults results={searchResults} onAddSection={handleAddSection} />
                </div>
                <div className="h-[600px]">
                  <AnimatePresence initial={false} mode="wait">
                    {!shouldRenderBrowserSectionChat ? (
                      <motion.div
                        key="top-chat"
                        layoutId="course-assistant-chat-dock"
                        className="h-full"
                        initial={{ opacity: 0.85, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0.65, y: -12 }}
                        transition={{ duration: 0.24, ease: 'easeOut' }}
                      >
                        <EmbeddedCedarChat title="Course Assistant" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="top-chat-placeholder"
                        className="flex h-full items-center justify-center rounded-xl border border-dashed border-border bg-surface-2/35 text-center text-sm text-muted-foreground"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        Chat is docked with the browser assistant while this section is in view.
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {textLines.length > 0 && (
              <div className="rounded-xl border border-border bg-surface-1/80 p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Assistant Notes</p>
                <div className="mt-2 space-y-1 text-sm text-foreground/85">
                  {textLines.map((line, index) => (
                    <div key={`${line}-${index}`}>{line}</div>
                  ))}
                </div>
              </div>
            )}

            <section ref={browserSectionRef} className="space-y-4 pb-8">
              <div className="rounded-2xl border border-border bg-surface-1/90 p-5 shadow-elev-1">
                <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Degree Navigator Browser Assistant</p>
                <h2 className="mt-2 text-2xl font-semibold text-foreground">Student-controlled login, agent-assisted navigation</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Start a browser session, sign in to Degree Navigator in the embedded view, then let the assistant observe and act within that same session.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
                <div className="rounded-2xl border border-border bg-surface-2/75 p-5 shadow-elev-1 backdrop-blur">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Session Status</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{getBrowserStatusLabel(browserPaneStatus)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={launchDegreeNavigatorSession}
                        disabled={browserPaneStatus === 'launching' || isStoppingSession}
                        className="rounded-full border border-border bg-surface-1 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-foreground transition hover:border-border-subtle hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Launch Session
                      </button>
                      <button
                        type="button"
                        onClick={() => refreshSessionStatus()}
                        disabled={!browserSession || browserPaneStatus === 'launching'}
                        className="rounded-full border border-border bg-surface-1 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-foreground transition hover:border-border-subtle hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Refresh
                      </button>
                      <button
                        type="button"
                        onClick={closeDegreeNavigatorSession}
                        disabled={!browserSession || browserPaneStatus === 'launching' || isStoppingSession}
                        className="rounded-full border border-destructive/70 bg-destructive/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-destructive transition hover:border-destructive hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isStoppingSession ? 'Stopping...' : 'Stop Session'}
                      </button>
                    </div>
                  </div>

                  <div className="mb-4 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive/90">
                    Stop Session ends the Browserbase run and stops billing immediately.
                  </div>

                  {autoStopMessage && browserSession && (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      <span className="text-amber-200">{autoStopMessage}</span>
                      <button
                        type="button"
                        onClick={keepBrowserSessionAlive}
                        className="rounded-full border border-amber-300/40 bg-amber-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100 transition hover:border-amber-200/60 hover:bg-amber-500/25"
                      >
                        Keep Alive
                      </button>
                    </div>
                  )}

                  {browserError && (
                    <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      <div>{browserError}</div>
                      {browserSession && (
                        <button
                          type="button"
                          onClick={closeDegreeNavigatorSession}
                          className="mt-3 rounded-full border border-destructive/60 bg-destructive/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-destructive transition hover:border-destructive hover:bg-destructive/20"
                        >
                          Retry Stop Session
                        </button>
                      )}
                    </div>
                  )}

                  {!browserSession ? (
                    <div className="flex min-h-[560px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-1 px-8 py-8 text-center">
                      <p className="text-sm font-medium text-foreground">No active browser session</p>
                      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                        Click <strong>Launch Session</strong> to create a Browserbase session. Then sign in inside the browser pane. The agent can help only after your manual login.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-xs text-muted-foreground">
                        Session ID: <span className="font-mono text-foreground">{browserSession.sessionId}</span>
                      </div>
                      <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
                        <iframe
                          src={browserSession.liveViewUrl}
                          title="Degree Navigator Browser Session"
                          className="h-[620px] w-full"
                          allow="fullscreen; clipboard-read; clipboard-write"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <AnimatePresence initial={false} mode="wait">
                    {shouldRenderBrowserSectionChat ? (
                      <motion.div
                        key="browser-chat"
                        layoutId={isDesktopLayout ? 'course-assistant-chat-dock' : undefined}
                        className="h-[620px]"
                        initial={{ opacity: 0.85, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0.6, y: -14 }}
                        transition={{ duration: 0.24, ease: 'easeOut' }}
                      >
                        <EmbeddedCedarChat title="Course Assistant" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="browser-chat-hint"
                        className="flex h-[620px] items-center justify-center rounded-xl border border-border bg-surface-2/50 p-6 text-center text-sm text-muted-foreground"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        Scroll this section into view to dock chat beside the browser assistant.
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );

  return renderContent();
}
