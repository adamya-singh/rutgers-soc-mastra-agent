import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  BROWSE_METADATA_DESCRIPTION,
  CHECK_SCHEDULE_CONFLICTS_DESCRIPTION,
  GET_COURSE_DETAILS_DESCRIPTION,
  GET_PREREQUISITES_DESCRIPTION,
  GET_SECTION_BY_INDEX_DESCRIPTION,
  SEARCH_COURSES_DESCRIPTION,
  SEARCH_SECTIONS_DESCRIPTION,
  browseMetadataInputSchema,
  runBrowseMetadata,
  checkScheduleConflictsInputSchema,
  runCheckScheduleConflicts,
  getCourseDetailsInputSchema,
  runGetCourseDetails,
  getPrerequisitesInputSchema,
  runGetPrerequisites,
  getSectionByIndexInputSchema,
  runGetSectionByIndex,
  runSearchCourses,
  runSearchSections,
  searchCoursesInputSchema,
  searchSectionsInputSchema,
} from '../../src/soc-core/index.js';
import type { Database } from '../../src/types/database.js';

type OpenClawPluginApi = {
  logger?: {
    debug?: (message: string) => void;
    warn?: (message: string) => void;
  };
  pluginConfig?: Record<string, unknown>;
};

type PluginConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  defaultCampus?: 'NB' | 'NK' | 'CM';
  maxLimit?: number;
};

type SocTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (id: string, params: Record<string, unknown>) => Promise<{
    content: Array<{ type: 'text'; text: string }>;
    details: unknown;
  }>;
};

let cachedClient: SupabaseClient<Database> | null = null;
let cachedClientKey = '';

function getConfig(api: OpenClawPluginApi): PluginConfig {
  return (api.pluginConfig ?? {}) as PluginConfig;
}

function resolveCredentials(api: OpenClawPluginApi): { url: string; anonKey: string } {
  const cfg = getConfig(api);
  const url = (cfg.supabaseUrl || process.env.SUPABASE_URL || '').trim();
  const anonKey = (cfg.supabaseAnonKey || process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) {
    throw new Error(
      'Rutgers SOC plugin is missing Supabase credentials. Set plugins.entries.rutgers-soc.config.supabaseUrl and supabaseAnonKey, or SUPABASE_URL and SUPABASE_ANON_KEY in the gateway environment.',
    );
  }
  return { url, anonKey };
}

function getSupabaseClient(api: OpenClawPluginApi): SupabaseClient<Database> {
  const { url, anonKey } = resolveCredentials(api);
  const key = `${url}::${anonKey}`;
  if (cachedClient && cachedClientKey === key) {
    return cachedClient;
  }

  cachedClient = createClient<Database>(url, anonKey, {
    db: { schema: 'public' },
    global: { headers: { 'x-application-name': 'rutgers-soc-openclaw' } },
  });
  cachedClientKey = key;
  return cachedClient;
}

export function toParameters(api: OpenClawPluginApi, toolName: string, schema: z.ZodTypeAny): Record<string, unknown> {
  try {
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
    if ('$schema' in jsonSchema) {
      delete jsonSchema.$schema;
    }

    if (jsonSchema.type !== 'object') {
      api.logger?.warn?.(
        `[rutgers-soc] ${toolName} produced non-object parameters schema (type=${String(jsonSchema.type)}); falling back to permissive object schema`,
      );
      return {
        type: 'object',
        properties: {},
        additionalProperties: true,
      };
    }

    return jsonSchema;
  } catch (error) {
    api.logger?.warn?.(
      `[rutgers-soc] ${toolName} failed to convert tool schema; falling back to permissive object schema: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      type: 'object',
      properties: {},
      additionalProperties: true,
    };
  }
}

function normalizeInput<T extends Record<string, unknown>>(api: OpenClawPluginApi, raw: T): T {
  const cfg = getConfig(api);
  const defaultCampus = cfg.defaultCampus;
  const maxLimit = typeof cfg.maxLimit === 'number' ? Math.max(1, cfg.maxLimit) : undefined;

  const next = { ...raw } as Record<string, unknown>;
  if (defaultCampus && typeof next.campus !== 'string') {
    next.campus = defaultCampus;
  }

  if (typeof next.limit === 'number' && maxLimit !== undefined) {
    next.limit = Math.min(next.limit, maxLimit);
  }

  return next as T;
}

function textResult(details: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(details, null, 2) }],
    details,
  };
}

function buildTool(params: {
  api: OpenClawPluginApi;
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  run: (input: Record<string, unknown>, deps: { supabaseClient: SupabaseClient<Database> }) => Promise<unknown>;
}): SocTool {
  return {
    name: params.name,
    description: params.description,
    parameters: toParameters(params.api, params.name, params.schema),
    execute: async (_id: string, rawParams: Record<string, unknown>) => {
      const supabaseClient = getSupabaseClient(params.api);
      const input = normalizeInput(params.api, rawParams);
      const details = await params.run(input, { supabaseClient });
      return textResult(details);
    },
  };
}

export function createSocTools(api: OpenClawPluginApi): SocTool[] {
  return [
    buildTool({
      api,
      name: 'rutgers_soc_search_courses',
      description: SEARCH_COURSES_DESCRIPTION,
      schema: searchCoursesInputSchema,
      run: runSearchCourses as (input: Record<string, unknown>, deps: { supabaseClient: SupabaseClient<Database> }) => Promise<unknown>,
    }),
    buildTool({
      api,
      name: 'rutgers_soc_get_course_details',
      description: GET_COURSE_DETAILS_DESCRIPTION,
      schema: getCourseDetailsInputSchema,
      run: runGetCourseDetails as (input: Record<string, unknown>, deps: { supabaseClient: SupabaseClient<Database> }) => Promise<unknown>,
    }),
    buildTool({
      api,
      name: 'rutgers_soc_search_sections',
      description: SEARCH_SECTIONS_DESCRIPTION,
      schema: searchSectionsInputSchema,
      run: runSearchSections as (input: Record<string, unknown>, deps: { supabaseClient: SupabaseClient<Database> }) => Promise<unknown>,
    }),
    buildTool({
      api,
      name: 'rutgers_soc_get_section_by_index',
      description: GET_SECTION_BY_INDEX_DESCRIPTION,
      schema: getSectionByIndexInputSchema,
      run: runGetSectionByIndex as (input: Record<string, unknown>, deps: { supabaseClient: SupabaseClient<Database> }) => Promise<unknown>,
    }),
    buildTool({
      api,
      name: 'rutgers_soc_check_schedule_conflicts',
      description: CHECK_SCHEDULE_CONFLICTS_DESCRIPTION,
      schema: checkScheduleConflictsInputSchema,
      run: runCheckScheduleConflicts as (input: Record<string, unknown>, deps: { supabaseClient: SupabaseClient<Database> }) => Promise<unknown>,
    }),
    buildTool({
      api,
      name: 'rutgers_soc_get_prerequisites',
      description: GET_PREREQUISITES_DESCRIPTION,
      schema: getPrerequisitesInputSchema,
      run: runGetPrerequisites as (input: Record<string, unknown>, deps: { supabaseClient: SupabaseClient<Database> }) => Promise<unknown>,
    }),
    buildTool({
      api,
      name: 'rutgers_soc_browse_metadata',
      description: BROWSE_METADATA_DESCRIPTION,
      schema: browseMetadataInputSchema,
      run: runBrowseMetadata as (input: Record<string, unknown>, deps: { supabaseClient: SupabaseClient<Database> }) => Promise<unknown>,
    }),
  ];
}
