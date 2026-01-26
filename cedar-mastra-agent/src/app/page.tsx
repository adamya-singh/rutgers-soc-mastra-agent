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

import { ChatModeSelector } from '@/components/ChatModeSelector';
import { SearchResults, type SearchResultItem } from '@/components/search/SearchResults';
import { ScheduleGrid } from '@/components/schedule/ScheduleGrid';
import { CedarCaptionChat } from '@/cedar/components/chatComponents/CedarCaptionChat';
import { FloatingCedarChat } from '@/cedar/components/chatComponents/FloatingCedarChat';
import { SidePanelCedarChat } from '@/cedar/components/chatComponents/SidePanelCedarChat';
import { DebuggerPanel } from '@/cedar/components/debugger';
import {
  addSectionToSchedule,
  dispatchScheduleUpdated,
  loadSchedule,
  removeSectionFromSchedule,
  saveSchedule,
} from '@/lib/scheduleStorage';

type ChatMode = 'floating' | 'sidepanel' | 'caption';

export default function HomePage() {
  // Cedar-OS chat components with mode selector
  // Choose between caption, floating, or side panel chat modes
  const [chatMode, setChatMode] = React.useState<ChatMode>('sidepanel');

  // Cedar state for the main text that can be changed by the agent
  const [mainText, setMainText] = React.useState('tell Cedar to change me');

  // Cedar state for dynamically added text lines
  const [textLines, setTextLines] = React.useState<string[]>([]);
  const [searchResults, setSearchResults] = React.useState<SearchResultItem[]>([]);

  // Get setShowChat from Cedar store to open chat by default
  const setShowChat = useCedarStore((state) => state.setShowChat);

  // Open chat by default when page loads
  React.useEffect(() => {
    setShowChat(true);
  }, [setShowChat]);

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

  const SearchResultItemSchema = z.object({
    id: z.string().min(1, 'ID is required'),
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
  });

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
    <div className="relative h-screen w-full">
      <div className="pointer-events-none absolute left-6 right-6 top-6 z-10 flex items-center justify-between">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Rutgers SOC</div>
        <Link
          href="/login"
          className="pointer-events-auto rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 shadow-sm backdrop-blur transition hover:border-slate-300 hover:text-slate-900"
        >
          Sign in
        </Link>
      </div>
      <ChatModeSelector currentMode={chatMode} onModeChange={setChatMode} />

      {/* Main interactive content area */}
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 space-y-8">
        <div className="w-full max-w-6xl">
          <ScheduleGrid />
        </div>

        <div className="w-full max-w-4xl">
          <SearchResults results={searchResults} />
        </div>

        {/* Big text that Cedar can change */}
        <div className="text-center">
          <h1 className="text-6xl font-bold text-gray-800 mb-4">{mainText}</h1>
          <p className="text-lg text-gray-600 mb-8">
            This text can be changed by Cedar using state setters
          </p>
        </div>

        {/* Instructions for adding new text */}
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-700 mb-2">
            tell cedar to add new lines of text to the screen
          </h2>
          <p className="text-md text-gray-500 mb-6">
            Cedar can add new text using frontend tools with different styles
          </p>
        </div>

        {/* Display dynamically added text lines */}
        {textLines.length > 0 && (
          <div className="w-full max-w-2xl">
            <h3 className="text-xl font-medium text-gray-700 mb-4 text-center">Added by Cedar:</h3>
            <div className="space-y-2">
              {textLines.map((line, index) => (
                <div
                  key={index}
                  className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center"
                >
                  {line.startsWith('**') && line.endsWith('**') ? (
                    <strong className="text-blue-800">{line.slice(2, -2)}</strong>
                  ) : line.startsWith('*') && line.endsWith('*') ? (
                    <em className="text-blue-700">{line.slice(1, -1)}</em>
                  ) : line.startsWith('🌟') ? (
                    <span className="text-yellow-600 font-semibold">{line}</span>
                  ) : (
                    <span className="text-blue-800">{line}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {chatMode === 'caption' && <CedarCaptionChat />}

      {chatMode === 'floating' && (
        <FloatingCedarChat side="right" title="Cedarling Chat" collapsedLabel="Chat with Cedar" />
      )}
    </div>
  );

  if (chatMode === 'sidepanel') {
    return (
      <SidePanelCedarChat
        side="right"
        title="Cedarling Chat"
        collapsedLabel="Chat with Cedar"
        showCollapsedButton={true}
      >
        <DebuggerPanel />
        {renderContent()}
      </SidePanelCedarChat>
    );
  }

  return renderContent();
}
