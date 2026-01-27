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
import {
  addSectionToSchedule,
  dispatchScheduleUpdated,
  loadSchedule,
  removeSectionFromSchedule,
  saveSchedule,
} from '@/lib/scheduleStorage';

type ChatMode = 'sidepanel';

export default function HomePage() {
  // Cedar-OS chat components with mode selector
  // Choose between caption, floating, or side panel chat modes
  const [chatMode] = React.useState<ChatMode>('sidepanel');
  const [theme, setTheme] = React.useState<'light' | 'dark'>('dark');

  // Cedar state for the main text that can be changed by the agent
  const [mainText, setMainText] = React.useState('tell Cedar to change me');

  // Cedar state for dynamically added text lines
  const [textLines, setTextLines] = React.useState<string[]>([]);
  const [searchResults, setSearchResults] = React.useState<SearchResultItem[]>([]);
  const [userEmail, setUserEmail] = React.useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);

  // Get setShowChat from Cedar store to open chat by default
  const setShowChat = useCedarStore((state) => state.setShowChat);

  // Open chat by default when page loads
  React.useEffect(() => {
    setShowChat(true);
  }, [setShowChat]);

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
    supabaseClient.auth.getUser().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) {
        console.warn('Failed to read auth state', error);
        setUserEmail(null);
        return;
      }
      setUserEmail(data.user?.email ?? null);
    });

    const { data: authListener } = supabaseClient.auth.onAuthStateChange(
      (_event, session) => {
        setUserEmail(session?.user?.email ?? null);
      },
    );

    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []);

  // Register the main text as Cedar state with a state setter
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
          currentText: string,
          setValue: (newValue: string) => void,
          args: { newText: string },
        ) => {
          setValue(args.newText);
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

    const { schedule: updated, added } = addSectionToSchedule(nextSchedule, args.section);
    saveSchedule(updated);
    dispatchScheduleUpdated();

    return { added, totalSections: updated.sections.length };
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

  // Subscribe the main text state to the backend
  useSubscribeStateToAgentContext('mainText', (mainText) => ({ mainText }), {
    showInChat: true,
    color: '#4F46E5',
  });

  // Register frontend tool for adding text lines
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
      return applyAddSection(args);
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
      const { schedule: updated, removed } = removeSectionFromSchedule(
        schedule,
        args.indexNumber,
      );
      saveSchedule(updated);
      dispatchScheduleUpdated();
      return { removed, totalSections: updated.sections.length };
    },
  });

  const renderContent = () => (
    <div className="relative h-screen w-full overflow-hidden bg-background text-foreground">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -bottom-40 right-[-120px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(90,120,160,0.2),transparent_70%)] blur-3xl" />
      </div>
      {/* Header */}
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
                await supabaseClient.auth.signOut();
                setIsProfileOpen(false);
              }}
              className="w-full rounded-lg border border-border bg-surface-1 px-4 py-2 text-sm font-semibold text-foreground shadow-elev-1 transition hover:border-border-subtle hover:bg-surface-2"
            >
              Sign out
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Main content area */}
      <div className="flex h-full flex-col pt-24">
        <div className="flex-1 overflow-y-auto px-6 pb-8">
          <div className="mx-auto h-full max-w-[1600px]">
            <div className="grid h-full w-full grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              {/* Schedule Grid */}
              <div className="min-w-0">
                <ScheduleGrid />
              </div>

              {/* Search Results & Embedded Chat (for sidepanel mode) */}
              <div className="min-w-0 space-y-6">
                <div className="min-h-[350px]">
                  <SearchResults results={searchResults} onAddSection={handleAddSection} />
                </div>
                <div className="h-[520px]">
                  <EmbeddedCedarChat title="Cedarling Chat" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return renderContent();
}
