'use client';

import React from 'react';
import Link from 'next/link';
import { z } from 'zod';
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
import { MoonStar, Sun } from 'lucide-react';
import { dispatchCedarPrompt } from '@/cedar/promptBridge';
import {
  addSectionToSchedule,
  clearLocalSchedules,
  dispatchScheduleUpdated,
  loadSchedule,
  removeSectionFromSchedule,
  saveSchedule,
} from '@/lib/scheduleStorage';
import { getClientIdentity } from '@/lib/clientIdentity';
import { buildMastraApiUrl } from '@/lib/mastraConfig';

type BrowserTarget = 'degree_navigator';
type BrowserSessionStatus = 'created' | 'awaiting_login' | 'ready' | 'error' | 'closed';
type BrowserPaneStatus = 'idle' | 'launching' | 'awaiting_login' | 'ready' | 'error';
type DegreeNavigatorReadiness = 'awaiting_login' | 'ready' | 'unknown';
type DegreeNavigatorSyncStatus =
  | 'idle'
  | 'launching'
  | 'waiting_for_login'
  | 'syncing'
  | 'synced'
  | 'error';
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

interface DegreeNavigatorReadinessResponse {
  readiness: DegreeNavigatorReadiness;
  urlHost?: string;
  urlPath?: string;
  title?: string;
  checkedAt: string;
}

interface PersistedBrowserSessionRecord {
  sessionId: string;
  userId: string;
  updatedAt: string;
}

const ACTIVE_BROWSER_SESSION_STORAGE_KEY = 'active_browser_session';
const HIDDEN_TIMEOUT_MS = 30_000;
const IDLE_TIMEOUT_MS = 60_000;
const DEGREE_NAVIGATOR_SYNC_POLL_MS = 2500;
const DEGREE_NAVIGATOR_SYNC_TIMEOUT_MS = 5 * 60_000;
const DEGREE_NAVIGATOR_SYNC_PROMPT =
  'Read my Degree Navigator information from the active browser session and sync it to the application. Extract my student profile, declared programs, audits, transcript terms, and run notes, then save it with saveDegreeNavigatorProfile.';

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

function getDegreeNavigatorSyncStatusLabel(status: DegreeNavigatorSyncStatus): string {
  switch (status) {
    case 'launching':
      return 'Launching secure browser';
    case 'waiting_for_login':
      return 'Waiting for Degree Navigator login';
    case 'syncing':
      return 'Syncing with assistant';
    case 'synced':
      return 'Sync started';
    case 'error':
      return 'Sync needs attention';
    case 'idle':
    default:
      return 'Ready to sync';
  }
}

function isUsableBrowserSession(
  session: BrowserSessionState | null,
): session is BrowserSessionState {
  return Boolean(session && session.status !== 'closed' && session.status !== 'error');
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
  const [degreeNavigatorSyncStatus, setDegreeNavigatorSyncStatus] =
    React.useState<DegreeNavigatorSyncStatus>('idle');
  const [degreeNavigatorSyncMessage, setDegreeNavigatorSyncMessage] = React.useState<string | null>(null);
  const browserSectionRef = React.useRef<HTMLElement | null>(null);
  const hiddenTimeoutRef = React.useRef<number | null>(null);
  const idleTimeoutRef = React.useRef<number | null>(null);
  const hiddenDeadlineRef = React.useRef<number | null>(null);
  const idleDeadlineRef = React.useRef<number | null>(null);
  const countdownIntervalRef = React.useRef<number | null>(null);
  const stopInFlightForSessionRef = React.useRef<string | null>(null);
  const degreeNavigatorSyncRunRef = React.useRef(0);
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
        | '/browser/session/degree-navigator-readiness'
        | '/browser/session/close'
        | '/browser/session/close-beacon',
      payload: object,
    ): Promise<BrowserSessionApiResponse | BrowserCloseApiResponse | DegreeNavigatorReadinessResponse> => {
      if (!accessToken) {
        throw new Error('Sign in before using browser sessions.');
      }

      const response = await fetch(buildMastraApiUrl(path), {
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
      const endpoint = buildMastraApiUrl('/browser/session/close-beacon');
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

  const ensureDegreeNavigatorSession = React.useCallback(async (): Promise<BrowserSessionState | null> => {
    if (isUsableBrowserSession(browserSession)) {
      setBrowserError(null);
      setBrowserPaneStatus(getBrowserPaneStatus(browserSession));
      if (userId) {
        persistActiveBrowserSession(browserSession, userId);
      }
      return browserSession;
    }

    if (isStoppingSession) {
      return null;
    }

    setBrowserError(null);
    setBrowserPaneStatus('launching');

    if (!userId) {
      setBrowserPaneStatus('error');
      const message = 'Sign in before launching Degree Navigator.';
      setBrowserError(message);
      throw new Error(message);
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
      return result.session;
    } catch (error) {
      setBrowserPaneStatus('error');
      setBrowserError(error instanceof Error ? error.message : 'Failed to create browser session.');
      throw error;
    }
  }, [
    browserSession,
    callBrowserSessionApi,
    isStoppingSession,
    persistActiveBrowserSession,
    userId,
  ]);

  const launchDegreeNavigatorSession = React.useCallback(async () => {
    try {
      await ensureDegreeNavigatorSession();
    } catch {
      // ensureDegreeNavigatorSession already surfaced the error in browserError.
    }
  }, [ensureDegreeNavigatorSession]);

  const closeDegreeNavigatorSession = React.useCallback(async () => {
    degreeNavigatorSyncRunRef.current += 1;
    if (
      degreeNavigatorSyncStatus === 'launching' ||
      degreeNavigatorSyncStatus === 'waiting_for_login' ||
      degreeNavigatorSyncStatus === 'syncing'
    ) {
      setDegreeNavigatorSyncStatus('error');
      setDegreeNavigatorSyncMessage('Degree Navigator sync stopped because the browser session was closed.');
    }

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
  }, [
    browserSession,
    clearActiveBrowserSessionRecord,
    closeBrowserSessionWithReason,
    degreeNavigatorSyncStatus,
  ]);

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

  const checkDegreeNavigatorReadiness = React.useCallback(
    async (sessionId: string): Promise<DegreeNavigatorReadinessResponse> => {
      return (await callBrowserSessionApi('/browser/session/degree-navigator-readiness', {
        sessionId,
      })) as DegreeNavigatorReadinessResponse;
    },
    [callBrowserSessionApi],
  );

  const syncFromDegreeNavigator = React.useCallback(async () => {
    const runId = degreeNavigatorSyncRunRef.current + 1;
    degreeNavigatorSyncRunRef.current = runId;
    setDegreeNavigatorSyncStatus('launching');
    setDegreeNavigatorSyncMessage('Opening Degree Navigator in the secure browser pane.');
    setBrowserError(null);

    try {
      const session = await ensureDegreeNavigatorSession();
      if (!session) {
        throw new Error('Unable to start a Degree Navigator browser session.');
      }

      setDegreeNavigatorSyncStatus('waiting_for_login');
      setDegreeNavigatorSyncMessage('Sign in inside the browser pane. Sync will start automatically after login.');

      const startedAt = Date.now();
      while (true) {
        if (degreeNavigatorSyncRunRef.current !== runId) {
          return;
        }

        const readiness = await checkDegreeNavigatorReadiness(session.sessionId);
        if (readiness.readiness === 'ready') {
          break;
        }

        if (Date.now() - startedAt > DEGREE_NAVIGATOR_SYNC_TIMEOUT_MS) {
          throw new Error('Timed out waiting for Degree Navigator login. Try Sync again after signing in.');
        }

        const location = readiness.urlHost ? ` Current page: ${readiness.urlHost}.` : '';
        setDegreeNavigatorSyncMessage(
          `Waiting for Degree Navigator to finish login.${location}`,
        );

        await new Promise((resolve) => {
          window.setTimeout(resolve, DEGREE_NAVIGATOR_SYNC_POLL_MS);
        });
      }

      if (degreeNavigatorSyncRunRef.current !== runId) {
        return;
      }

      setDegreeNavigatorSyncStatus('syncing');
      setDegreeNavigatorSyncMessage('Login detected. Asking the assistant to read and save your Degree Navigator data.');
      dispatchCedarPrompt(DEGREE_NAVIGATOR_SYNC_PROMPT);
      setDegreeNavigatorSyncStatus('synced');
      setDegreeNavigatorSyncMessage('Sync started in the assistant. You can watch progress in the chat.');
    } catch (error) {
      if (degreeNavigatorSyncRunRef.current !== runId) {
        return;
      }
      setDegreeNavigatorSyncStatus('error');
      setDegreeNavigatorSyncMessage(
        error instanceof Error ? error.message : 'Unable to sync from Degree Navigator.',
      );
    }
  }, [
    checkDegreeNavigatorReadiness,
    ensureDegreeNavigatorSession,
  ]);

  React.useEffect(() => {
    return () => {
      degreeNavigatorSyncRunRef.current += 1;
    };
  }, []);

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
      degreeNavigatorSyncRunRef.current += 1;
      setDegreeNavigatorSyncStatus('error');
      setDegreeNavigatorSyncMessage('Degree Navigator sync stopped because the live view disconnected.');
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
    name: 'ensureDegreeNavigatorSession',
    description:
      'Open or reuse the Browserbase Degree Navigator session displayed in the embedded browser pane.',
    argsSchema: z.object({}),
    execute: async () => {
      await ensureDegreeNavigatorSession();
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

  const hasResults = searchResults.length > 0;
  const isDegreeNavigatorSyncBusy =
    degreeNavigatorSyncStatus === 'launching' ||
    degreeNavigatorSyncStatus === 'waiting_for_login' ||
    degreeNavigatorSyncStatus === 'syncing';
  const degreeNavigatorSyncButtonLabel = (() => {
    switch (degreeNavigatorSyncStatus) {
      case 'launching':
        return 'Launching...';
      case 'waiting_for_login':
        return 'Waiting for login...';
      case 'syncing':
        return 'Starting sync...';
      case 'synced':
        return 'Sync from Degree Navigator again';
      default:
        return 'Sync from Degree Navigator';
    }
  })();

  const renderContent = () => (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background">
        <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between px-4 sm:px-6">
          <Link href="/" className="focus-ring -mx-1 inline-flex items-center gap-2 rounded px-1 py-1">
            <span aria-hidden="true" className="h-2 w-2 rounded-sm bg-primary" />
            <span className="text-sm font-semibold tracking-tight text-foreground">Rutgers SOC</span>
          </Link>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
            </button>
            {userEmail ? (
              <button
                type="button"
                onClick={() => setIsProfileOpen(true)}
                className="focus-ring inline-flex h-8 items-center gap-2 rounded px-2 text-xs font-medium text-foreground transition hover:bg-surface-2"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold uppercase text-primary">
                  {(userEmail[0] ?? '?').toUpperCase()}
                </span>
                <span className="max-w-[160px] truncate text-muted-foreground">{userEmail}</span>
              </button>
            ) : (
              <Link
                href="/login"
                className="focus-ring inline-flex h-8 items-center rounded bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                Sign in
              </Link>
            )}
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
        <DialogContent className="border border-border bg-surface-1 text-foreground sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Profile</DialogTitle>
            <DialogDescription>Signed in account</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground">
              {userEmail ?? 'Unknown email'}
            </div>
            <Link
              href="/profile"
              onClick={() => setIsProfileOpen(false)}
              className="focus-ring flex w-full items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              View full profile
            </Link>
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
                degreeNavigatorSyncRunRef.current += 1;
                setDegreeNavigatorSyncStatus('idle');
                setDegreeNavigatorSyncMessage(null);
                setIsProfileOpen(false);
              }}
              className="focus-ring w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm font-medium text-foreground transition hover:bg-surface-2"
            >
              Sign out
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-4 sm:px-6 sm:py-6">
        <section className="grid w-full grid-cols-1 items-stretch gap-4 sm:gap-6 lg:grid-cols-[minmax(320px,1fr)_minmax(0,1.8fr)] xl:grid-cols-[minmax(360px,1fr)_minmax(0,2fr)]">
          <div className="flex min-w-0 flex-col gap-4 lg:h-full">
            {hasResults && (
              <div className="max-h-[360px] min-h-0 flex-shrink-0 lg:max-h-[42%]">
                <SearchResults results={searchResults} onAddSection={handleAddSection} />
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-hidden">
              <div className="h-[min(640px,75vh)] min-h-0 overflow-hidden">
                <EmbeddedCedarChat title="Course Assistant" />
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <ScheduleGrid />
          </div>
        </section>

        {textLines.length > 0 && (
          <div className="mt-6 rounded-md border border-border bg-surface-1 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Assistant Notes
            </p>
            <div className="mt-2 space-y-1 text-sm text-foreground/85">
              {textLines.map((line, index) => (
                <div key={`${line}-${index}`}>{line}</div>
              ))}
            </div>
          </div>
        )}

        <section
          id="degree-navigator"
          ref={browserSectionRef}
          className="mt-10 scroll-mt-20 border-t border-border pt-8"
        >
          <div className="mb-4 flex flex-col gap-1">
            <h2 className="text-base font-semibold text-foreground">Degree Navigator</h2>
            <p className="text-sm text-muted-foreground">
              Launch a private browser session, sign in yourself, then let the assistant act inside it.
            </p>
          </div>

          <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4 shadow-elev-1">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-primary">
                  Degree data sync
                </p>
                <h3 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                  Sync from Degree Navigator
                </h3>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Opens the secure browser if needed, waits for you to finish Rutgers login, then asks the
                  assistant to read Degree Navigator and save your profile, audits, and transcript terms.
                </p>
                <p
                  className={`mt-3 text-sm ${
                    degreeNavigatorSyncStatus === 'error'
                      ? 'text-destructive'
                      : degreeNavigatorSyncStatus === 'synced'
                        ? 'text-success'
                        : 'text-muted-foreground'
                  }`}
                >
                  <span className="font-medium">
                    {getDegreeNavigatorSyncStatusLabel(degreeNavigatorSyncStatus)}.
                  </span>{' '}
                  {degreeNavigatorSyncMessage ?? 'Start when you are ready to sign in.'}
                </p>
              </div>
              <button
                type="button"
                onClick={syncFromDegreeNavigator}
                disabled={isDegreeNavigatorSyncBusy || isStoppingSession}
                className="focus-ring inline-flex min-h-14 shrink-0 items-center justify-center rounded-lg bg-primary px-6 py-4 text-base font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground lg:min-w-[260px]"
              >
                {degreeNavigatorSyncButtonLabel}
              </button>
            </div>
          </div>

          <div className="rounded-md border border-border bg-surface-1">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <StatusDot status={browserPaneStatus} />
                <span className="text-sm font-medium text-foreground">
                  {getBrowserStatusLabel(browserPaneStatus)}
                </span>
                {browserSession && (
                  <span className="ml-1 truncate text-xs text-muted-foreground">
                    · {browserSession.sessionId.slice(0, 12)}…
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={launchDegreeNavigatorSession}
                  disabled={browserPaneStatus === 'launching' || isStoppingSession}
                  className="focus-ring inline-flex h-8 items-center rounded bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                >
                  {browserSession ? 'Reconnect' : 'Launch session'}
                </button>
                <button
                  type="button"
                  onClick={() => refreshSessionStatus()}
                  disabled={!browserSession || browserPaneStatus === 'launching'}
                  className="focus-ring inline-flex h-8 items-center rounded border border-border bg-surface-1 px-3 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={closeDegreeNavigatorSession}
                  disabled={!browserSession || browserPaneStatus === 'launching' || isStoppingSession}
                  className="focus-ring inline-flex h-8 items-center rounded border border-border bg-surface-1 px-3 text-xs font-medium text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:text-muted-foreground"
                >
                  {isStoppingSession ? 'Stopping…' : 'Stop'}
                </button>
              </div>
            </div>

            {autoStopMessage && browserSession && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-warning/5 px-4 py-2 text-xs text-warning">
                <span>{autoStopMessage}</span>
                <button
                  type="button"
                  onClick={keepBrowserSessionAlive}
                  className="focus-ring rounded px-2 py-1 text-xs font-medium underline-offset-2 hover:underline"
                >
                  Keep alive
                </button>
              </div>
            )}

            {browserError && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-destructive/5 px-4 py-2 text-xs text-destructive">
                <span>{browserError}</span>
                {browserSession && (
                  <button
                    type="button"
                    onClick={closeDegreeNavigatorSession}
                    className="focus-ring rounded px-2 py-1 text-xs font-medium underline-offset-2 hover:underline"
                  >
                    Retry stop
                  </button>
                )}
              </div>
            )}

            {!browserSession ? (
              <div className="flex h-[min(620px,70vh)] flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No active session.{' '}
                  <button
                    type="button"
                    onClick={launchDegreeNavigatorSession}
                    disabled={browserPaneStatus === 'launching' || isStoppingSession}
                    className="focus-ring rounded font-medium text-primary underline-offset-2 transition hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Launch to begin.
                  </button>
                </p>
                <p className="text-xs text-muted-foreground">
                  Sign in inside the browser yourself; the assistant takes over from there.
                </p>
              </div>
            ) : (
              <iframe
                src={browserSession.liveViewUrl}
                title="Degree Navigator Browser Session"
                className="block h-[min(620px,70vh)] w-full"
                allow="fullscreen; clipboard-read; clipboard-write"
              />
            )}
          </div>
        </section>
      </main>
    </div>
  );

  return renderContent();
}

function StatusDot({ status }: { status: BrowserPaneStatus }) {
  const tone = (() => {
    switch (status) {
      case 'ready':
        return 'bg-success';
      case 'awaiting_login':
      case 'launching':
        return 'bg-warning';
      case 'error':
        return 'bg-destructive';
      case 'idle':
      default:
        return 'bg-muted-foreground/50';
    }
  })();

  const animate = status === 'launching' || status === 'awaiting_login' ? 'animate-pulse' : '';

  return <span className={`inline-block h-2 w-2 rounded-full ${tone} ${animate}`} />;
}
