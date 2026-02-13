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

// Schema for the changeText state setter
export const ChangeTextSchema = z.object({
  newText: z.string().min(1, 'Text cannot be empty').describe('The new text to display'),
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

// Create backend tools for the state setter
export const changeTextTool = createMastraToolForStateSetter(
  'mainText', // The state key
  'changeText', // The state setter name
  ChangeTextSchema,
  {
    description:
      'Change the main text displayed on the screen. This tool allows the agent to modify the primary text content that users see, replacing the current text with new content.',
    toolId: 'changeText',
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
  textManipulation: {
    changeTextTool,
    addNewTextLineTool,
    addSectionToScheduleTool,
    removeSectionFromScheduleTool,
  },
  searchResults: {
    clearSearchResultsTool,
    setSearchResultsTool,
    appendSearchResultsTool,
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
];

export const ALL_TOOLS = [
  changeTextTool,
  addNewTextLineTool,
  addSectionToScheduleTool,
  removeSectionFromScheduleTool,
  clearSearchResultsTool,
  setSearchResultsTool,
  appendSearchResultsTool,
  mastraDocsSearchTool,
  ...SOC_TOOLS,
];
