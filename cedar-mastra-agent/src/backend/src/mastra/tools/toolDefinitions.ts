import {
  createMastraToolForFrontendTool,
  createMastraToolForStateSetter,
  createRequestAdditionalContextTool,
} from '@cedar-os/backend';
import { streamJSONEvent } from '../../utils/streamUtils';
import { z } from 'zod';
import {
  searchCourses,
  getCourseDetails,
  browseMetadata,
  searchSections,
  getSectionByIndex,
  checkScheduleConflicts,
  getPrerequisites,
  findRoomAvailability,
  createBrowserSession,
  closeBrowserSessionTool,
  browserNavigate,
  browserObserve,
  browserExtract,
  browserAct,
  readDegreeNavigatorProfile,
  saveDegreeNavigatorProfile,
  readDegreeNavigatorExtractionRun,
} from './index.js';
import { mastraDocsSearchTool } from './mastraDocsSearchTool.js';

// Define the schemas for our tools based on what we registered in page.tsx

// Schema for the addNewTextLine frontend tool
export const AddNewTextLineSchema = z.object({
  text: z.string().min(1, 'Text cannot be empty').describe('The text to add to the screen'),
  style: z
    .enum(['normal', 'bold', 'italic', 'highlight'])
    .optional()
    .describe('Text style to apply'),
});

const SectionMeetingTimeSchema = z.object({
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

const SectionSchema = z.object({
  indexNumber: z.string().min(1, 'Index number is required'),
  sectionId: z.number().optional(),
  courseString: z.string().optional(),
  courseTitle: z.string().optional(),
  credits: z.number().optional(),
  sectionNumber: z.string().optional(),
  instructors: z.array(z.string()).optional(),
  isOpen: z.boolean().optional(),
  meetingTimes: z.array(SectionMeetingTimeSchema).optional(),
  isOnline: z.boolean().optional(),
  sessionDates: z.string().optional(),
});

// Schema for the addSectionToSchedule frontend tool
export const AddSectionToScheduleSchema = z.object({
  section: SectionSchema,
  termYear: z.number().optional(),
  termCode: z.string().optional(),
  campus: z.string().optional(),
});

// Schema for the removeSectionFromSchedule frontend tool
export const RemoveSectionFromScheduleSchema = z.object({
  indexNumber: z.string().min(1, 'Index number is required'),
});

// Schema for the createTemporarySchedule frontend tool
export const CreateTemporaryScheduleSchema = z.object({
  scheduleId: z
    .string()
    .min(1, 'scheduleId is required')
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, 'scheduleId must be alphanumeric with optional - or _')
    .describe(
      'A short stable id you choose for this option, e.g. "option-1" or "mwf-mornings". You will reference the same id in addSectionToTemporarySchedule and discardTemporarySchedule. Must be unique within this chat thread.',
    ),
  label: z
    .string()
    .min(1)
    .max(80)
    .optional()
    .describe(
      'Short human-readable label describing what makes this option distinct (e.g. "MWF mornings, Busch only").',
    ),
  basedOnActive: z
    .boolean()
    .optional()
    .describe(
      'When true, seed the temporary schedule with the sections from the user\'s active schedule. Defaults to false (empty).',
    ),
});

// Schema for the addSectionToTemporarySchedule frontend tool
export const AddSectionToTemporaryScheduleSchema = z.object({
  scheduleId: z
    .string()
    .min(1, 'scheduleId is required')
    .describe('The same scheduleId you passed to createTemporarySchedule.'),
  section: SectionSchema,
});

// Schema for the discardTemporarySchedule frontend tool
export const DiscardTemporaryScheduleSchema = z.object({
  scheduleId: z
    .string()
    .min(1, 'scheduleId is required')
    .describe('The id of the temporary schedule to discard.'),
});

const SearchResultDetailSchema = z.object({
  label: z.string(),
  value: z.string(),
});

const SearchResultItemSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  type: z.enum(['section', 'course', 'misc']).optional(),
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().optional(),
  summary: z.string().optional(),
  badges: z.array(z.string()).optional(),
  details: z.array(SearchResultDetailSchema).optional(),
  section: SectionSchema.optional(),
  misc: z
    .object({
      body: z.string().optional(),
      fields: z.array(SearchResultDetailSchema).optional(),
      href: z.string().optional(),
    })
    .optional(),
  termYear: z.number().optional(),
  termCode: z.string().optional(),
  campus: z.string().optional(),
});

export const SetSearchResultsSchema = z.object({
  results: z.array(SearchResultItemSchema),
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

export const SetBrowserSessionSchema = z.object({
  session: BrowserSessionSchema.nullable(),
});

// Error response schema
export const ErrorResponseSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});

// Create backend tools for the frontend tool
export const addNewTextLineTool = createMastraToolForFrontendTool(
  'addNewTextLine',
  AddNewTextLineSchema,
  {
    description:
      'Add a new line of text to the screen with optional styling. This tool allows the agent to dynamically add text content that will be displayed on the user interface with different visual styles.',
    toolId: 'addNewTextLine',
    streamEventFn: streamJSONEvent,
    errorSchema: ErrorResponseSchema,
  },
);

export const ensureDegreeNavigatorSessionTool = createMastraToolForFrontendTool(
  'ensureDegreeNavigatorSession',
  z.object({}),
  {
    description:
      'Open or reuse the Browserbase Degree Navigator session displayed in the embedded browser pane. Use this before browser automation when the user asks to open or use the browser.',
    toolId: 'ensureDegreeNavigatorSession',
    streamEventFn: streamJSONEvent,
    errorSchema: ErrorResponseSchema,
  },
);

export const addSectionToScheduleTool = createMastraToolForFrontendTool(
  'addSectionToSchedule',
  AddSectionToScheduleSchema,
  {
    description:
      'Add a course section to the current schedule. This tool updates the in-browser schedule state using the provided section details and optional term metadata.',
    toolId: 'addSectionToSchedule',
    streamEventFn: streamJSONEvent,
    errorSchema: ErrorResponseSchema,
  },
);

export const removeSectionFromScheduleTool = createMastraToolForFrontendTool(
  'removeSectionFromSchedule',
  RemoveSectionFromScheduleSchema,
  {
    description:
      'Remove a course section from the current schedule by index number. This tool updates the in-browser schedule state.',
    toolId: 'removeSectionFromSchedule',
    streamEventFn: streamJSONEvent,
    errorSchema: ErrorResponseSchema,
  },
);

export const createTemporaryScheduleTool = createMastraToolForFrontendTool(
  'createTemporarySchedule',
  CreateTemporaryScheduleSchema,
  {
    description:
      "Create a new TEMPORARY schedule scoped to the current chat thread. Temporary schedules let you propose multiple schedule options without modifying the user's saved schedules — they appear above the grid as options the user can flip through and either save or discard. The tool returns the new schedule's id which MUST be passed to addSectionToTemporarySchedule for every section in this option. Use this when the user asks to compare options, build different schedules, or see schedule alternatives.",
    toolId: 'createTemporarySchedule',
    streamEventFn: streamJSONEvent,
    errorSchema: ErrorResponseSchema,
  },
);

export const addSectionToTemporaryScheduleTool = createMastraToolForFrontendTool(
  'addSectionToTemporarySchedule',
  AddSectionToTemporaryScheduleSchema,
  {
    description:
      'Add a course section to a specific temporary schedule by its scheduleId (returned by createTemporarySchedule). Use this instead of addSectionToSchedule when building schedule options for the user.',
    toolId: 'addSectionToTemporarySchedule',
    streamEventFn: streamJSONEvent,
    errorSchema: ErrorResponseSchema,
  },
);

export const discardTemporaryScheduleTool = createMastraToolForFrontendTool(
  'discardTemporarySchedule',
  DiscardTemporaryScheduleSchema,
  {
    description:
      'Discard a temporary schedule that the user no longer wants to consider. Removes it from the option carousel above the grid.',
    toolId: 'discardTemporarySchedule',
    streamEventFn: streamJSONEvent,
    errorSchema: ErrorResponseSchema,
  },
);

export const clearSearchResultsTool = createMastraToolForStateSetter(
  'searchResults',
  'clearSearchResults',
  z.object({}),
  {
    description: 'Clear all cards from the search results panel.',
    toolId: 'clearSearchResults',
    streamEventFn: streamJSONEvent,
    errorSchema: ErrorResponseSchema,
  },
);

export const setSearchResultsTool = createMastraToolForStateSetter(
  'searchResults',
  'setSearchResults',
  SetSearchResultsSchema,
  {
    description: 'Replace the search results panel with a new list of result cards.',
    toolId: 'setSearchResults',
    streamEventFn: streamJSONEvent,
    errorSchema: ErrorResponseSchema,
  },
);

export const appendSearchResultsTool = createMastraToolForStateSetter(
  'searchResults',
  'appendSearchResults',
  SetSearchResultsSchema,
  {
    description: 'Append result cards to the existing search results panel.',
    toolId: 'appendSearchResults',
    streamEventFn: streamJSONEvent,
    errorSchema: ErrorResponseSchema,
  },
);

export const setBrowserSessionTool = createMastraToolForStateSetter(
  'browserSession',
  'setBrowserSession',
  SetBrowserSessionSchema,
  {
    description: 'Set the active browser session state used for embedded live view.',
    toolId: 'setBrowserSession',
    streamEventFn: streamJSONEvent,
    errorSchema: ErrorResponseSchema,
  },
);

export const clearBrowserSessionTool = createMastraToolForStateSetter(
  'browserSession',
  'clearBrowserSession',
  z.object({}),
  {
    description: 'Clear the active browser session state.',
    toolId: 'clearBrowserSession',
    streamEventFn: streamJSONEvent,
    errorSchema: ErrorResponseSchema,
  },
);

export const requestAdditionalContextTool = createRequestAdditionalContextTool();

/**
 * Registry of all available tools organized by category
 * This structure makes it easy to see tool organization and generate categorized descriptions
 */
export const TOOL_REGISTRY = {
  soc: {
    searchCourses,
    getCourseDetails,
    browseMetadata,
    searchSections,
    getSectionByIndex,
    checkScheduleConflicts,
    getPrerequisites,
    findRoomAvailability,
  },
  browser: {
    createBrowserSession,
    closeBrowserSessionTool,
    browserNavigate,
    browserObserve,
    browserExtract,
    browserAct,
  },
  degreeNavigator: {
    readDegreeNavigatorProfile,
    readDegreeNavigatorExtractionRun,
    saveDegreeNavigatorProfile,
  },
  textManipulation: {
    addSectionToScheduleTool,
    removeSectionFromScheduleTool,
    createTemporaryScheduleTool,
    addSectionToTemporaryScheduleTool,
    discardTemporaryScheduleTool,
  },
  browserState: {
    ensureDegreeNavigatorSessionTool,
    setBrowserSessionTool,
    clearBrowserSessionTool,
  },
  docs: {
    mastraDocsSearchTool,
  },
};

// Export all tools as an array for easy registration
export const SOC_TOOLS = [
  searchCourses,
  getCourseDetails,
  browseMetadata,
  searchSections,
  getSectionByIndex,
  checkScheduleConflicts,
  getPrerequisites,
  findRoomAvailability,
  createBrowserSession,
  closeBrowserSessionTool,
  browserNavigate,
  browserObserve,
  browserExtract,
  browserAct,
  readDegreeNavigatorProfile,
  readDegreeNavigatorExtractionRun,
  saveDegreeNavigatorProfile,
];

export const ALL_TOOLS = [
  ensureDegreeNavigatorSessionTool,
  addSectionToScheduleTool,
  removeSectionFromScheduleTool,
  createTemporaryScheduleTool,
  addSectionToTemporaryScheduleTool,
  discardTemporaryScheduleTool,
  setBrowserSessionTool,
  clearBrowserSessionTool,
  mastraDocsSearchTool,
  ...SOC_TOOLS,
];
