import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase as defaultSupabase } from '../../lib/supabase.js';
import {
  formatTime,
  getDayName,
  getDefaultTerm,
  getTermName,
  normalizeLocationToken,
  parseClassroomCode,
} from '../../lib/utils.js';

export const FIND_ROOM_AVAILABILITY_DESCRIPTION = `Find empty classrooms in a Rutgers building for a day/time range.
Use this tool when the user asks for free rooms, room availability windows, or longest open room slots.
Examples: "Empty rooms in Tillett after 5 PM", "What rooms are open now in LSH?", "Rooms free for at least 1 hour on Tuesday".`;

const dayEnum = z.enum(['M', 'T', 'W', 'H', 'F', 'S', 'U']);

export const findRoomAvailabilityInputSchema = z.object({
  buildingQuery: z.string()
    .min(1)
    .describe('Building name/code/classroom token (e.g., "Tillett Hall", "TIL", "TIL 116").'),
  campus: z.enum(['NB', 'NK', 'CM']).default('NB'),
  day: dayEnum.optional()
    .describe('Day code (M, T, W, H, F, S, U). Defaults to current local weekday.'),
  startTime: z.string().optional()
    .describe('Window start in 24hr HHMM format (e.g., "1700"). Defaults to current local time.'),
  endTime: z.string().optional()
    .describe('Window end in 24hr HHMM format (e.g., "2200"). Defaults to 2200.'),
  year: z.number().optional(),
  term: z.enum(['0', '1', '7', '9']).optional(),
  minFreeMinutes: z.number().min(1).max(720).default(60)
    .describe('Minimum free-window length used for primary ranking.'),
  allowShorterFallback: z.boolean().default(true)
    .describe('Include shorter windows when too few rooms satisfy minFreeMinutes.'),
  shorterFallbackThreshold: z.number().min(1).max(100).default(5)
    .describe('Trigger fallback when fewer than this many rooms satisfy minFreeMinutes.'),
  limitRooms: z.number().min(1).max(200).default(20)
    .describe('Maximum number of rooms to return.'),
}).superRefine((input, ctx) => {
  if (input.startTime && !isValidMilitaryTime(input.startTime)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['startTime'],
      message: 'Invalid time format. Expected HHMM (e.g., 1700).',
    });
  }

  if (input.endTime && !isValidMilitaryTime(input.endTime)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endTime'],
      message: 'Invalid time format. Expected HHMM (e.g., 2200).',
    });
  }
});

export const freeWindowSchema = z.object({
  startMilitary: z.string(),
  endMilitary: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  durationMinutes: z.number(),
});

export const findRoomAvailabilityOutputSchema = z.object({
  searchContext: z.object({
    campus: z.string(),
    year: z.number(),
    term: z.string(),
    termName: z.string(),
    day: z.string(),
    dayName: z.string(),
    requestedBuilding: z.string(),
    resolvedBuildingCode: z.string(),
    windowStartMilitary: z.string(),
    windowEndMilitary: z.string(),
    minFreeMinutes: z.number(),
  }),
  rooms: z.array(z.object({
    room: z.string(),
    building: z.string(),
    longestFreeMinutes: z.number(),
    isShorterFallback: z.boolean(),
    freeWindows: z.array(freeWindowSchema),
  })),
  roomsConsidered: z.number(),
  roomsWithLongWindows: z.number(),
  fallbackApplied: z.boolean(),
  warnings: z.array(z.string()),
});

export type FindRoomAvailabilityInput = z.infer<typeof findRoomAvailabilityInputSchema>;
export type FindRoomAvailabilityOutput = z.infer<typeof findRoomAvailabilityOutputSchema>;

type TimeInterval = { start: string; end: string };
type FreeWindow = z.infer<typeof freeWindowSchema>;

type BuildingResolution = {
  buildingCodeNorm: string;
  displayBuildingCode: string;
  warnings: string[];
};

export function isValidMilitaryTime(value: string): boolean {
  if (!/^\d{4}$/.test(value)) {
    return false;
  }
  const hours = Number.parseInt(value.slice(0, 2), 10);
  const minutes = Number.parseInt(value.slice(2, 4), 10);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function militaryToMinutes(value: string): number {
  const hours = Number.parseInt(value.slice(0, 2), 10);
  const minutes = Number.parseInt(value.slice(2, 4), 10);
  return (hours * 60) + minutes;
}

export function minutesToMilitary(totalMinutes: number): string {
  const bounded = Math.max(0, Math.min(totalMinutes, (23 * 60) + 59));
  const hours = Math.floor(bounded / 60);
  const minutes = bounded % 60;
  return `${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}`;
}

export function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  if (intervals.length === 0) {
    return [];
  }

  const sorted = [...intervals].sort((a, b) => militaryToMinutes(a.start) - militaryToMinutes(b.start));
  const merged: TimeInterval[] = [];

  for (const current of sorted) {
    if (merged.length === 0) {
      merged.push({ ...current });
      continue;
    }

    const last = merged[merged.length - 1];
    if (militaryToMinutes(current.start) <= militaryToMinutes(last.end)) {
      if (militaryToMinutes(current.end) > militaryToMinutes(last.end)) {
        last.end = current.end;
      }
      continue;
    }

    merged.push({ ...current });
  }

  return merged;
}

export function calculateFreeWindows(params: {
  occupiedIntervals: TimeInterval[];
  windowStart: string;
  windowEnd: string;
}): FreeWindow[] {
  const windowStartMinutes = militaryToMinutes(params.windowStart);
  const windowEndMinutes = militaryToMinutes(params.windowEnd);

  if (windowStartMinutes >= windowEndMinutes) {
    return [];
  }

  const clampedOccupied: TimeInterval[] = params.occupiedIntervals
    .map((interval) => {
      const start = Math.max(militaryToMinutes(interval.start), windowStartMinutes);
      const end = Math.min(militaryToMinutes(interval.end), windowEndMinutes);
      return { start: minutesToMilitary(start), end: minutesToMilitary(end) };
    })
    .filter((interval) => militaryToMinutes(interval.start) < militaryToMinutes(interval.end));

  const merged = mergeIntervals(clampedOccupied);
  const freeWindows: FreeWindow[] = [];

  let cursor = windowStartMinutes;
  for (const interval of merged) {
    const intervalStart = militaryToMinutes(interval.start);
    const intervalEnd = militaryToMinutes(interval.end);

    if (cursor < intervalStart) {
      const startMilitary = minutesToMilitary(cursor);
      const endMilitary = minutesToMilitary(intervalStart);
      freeWindows.push({
        startMilitary,
        endMilitary,
        startTime: formatTime(startMilitary),
        endTime: formatTime(endMilitary),
        durationMinutes: intervalStart - cursor,
      });
    }

    cursor = Math.max(cursor, intervalEnd);
  }

  if (cursor < windowEndMinutes) {
    const startMilitary = minutesToMilitary(cursor);
    const endMilitary = minutesToMilitary(windowEndMinutes);
    freeWindows.push({
      startMilitary,
      endMilitary,
      startTime: formatTime(startMilitary),
      endTime: formatTime(endMilitary),
      durationMinutes: windowEndMinutes - cursor,
    });
  }

  return freeWindows;
}

function getCurrentMilitary(now: Date): string {
  return `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
}

function getCurrentDayCode(now: Date): z.infer<typeof dayEnum> {
  const index = now.getDay(); // Sunday=0
  const map: z.infer<typeof dayEnum>[] = ['U', 'M', 'T', 'W', 'H', 'F', 'S'];
  return map[index];
}

async function resolveBuildingCode(params: {
  supabaseClient: typeof defaultSupabase;
  buildingQuery: string;
  campus: 'NB' | 'NK' | 'CM';
  year: number;
  term: '0' | '1' | '7' | '9';
}): Promise<BuildingResolution> {
  const normalized = normalizeLocationToken(params.buildingQuery);
  if (!normalized) {
    throw new Error('Building query is empty after normalization.');
  }

  const parsedClassroom = parseClassroomCode(params.buildingQuery);
  if (parsedClassroom?.buildingCodeNorm) {
    return {
      buildingCodeNorm: parsedClassroom.buildingCodeNorm,
      displayBuildingCode: parsedClassroom.buildingCodeNorm,
      warnings: [],
    };
  }

  const { data: aliasExact, error: aliasExactError } = await params.supabaseClient
    .from('building_aliases')
    .select('building_code_norm')
    .eq('campus', params.campus)
    .eq('alias_norm', normalized)
    .limit(5);

  if (aliasExactError) {
    throw new Error(`Failed to resolve building alias: ${aliasExactError.message}`);
  }

  const exactMatches = [...new Set((aliasExact || []).map((row) => row.building_code_norm).filter(Boolean))];
  if (exactMatches.length === 1) {
    return {
      buildingCodeNorm: exactMatches[0],
      displayBuildingCode: exactMatches[0],
      warnings: [],
    };
  }

  if (exactMatches.length > 1) {
    throw new Error(`Building alias "${params.buildingQuery}" is ambiguous: ${exactMatches.join(', ')}`);
  }

  const { data: buildingsData, error: buildingsError } = await params.supabaseClient
    .from('v_schedule_builder')
    .select('building_code_norm, building_code')
    .eq('year', params.year)
    .eq('term', params.term)
    .eq('term_campus', params.campus)
    .not('building_code_norm', 'is', null)
    .limit(10000);

  if (buildingsError) {
    throw new Error(`Failed to resolve building code: ${buildingsError.message}`);
  }

  const buildings = new Map<string, string>();
  for (const row of buildingsData || []) {
    if (!row.building_code_norm) {
      continue;
    }
    buildings.set(row.building_code_norm, row.building_code || row.building_code_norm);
  }

  if (buildings.has(normalized)) {
    const displayBuildingCode = buildings.get(normalized) || normalized;
    return {
      buildingCodeNorm: normalized,
      displayBuildingCode,
      warnings: [],
    };
  }

  const prefixMatches = [...buildings.keys()].filter((code) => code.startsWith(normalized)).sort();
  if (prefixMatches.length === 1) {
    const resolved = prefixMatches[0];
    return {
      buildingCodeNorm: resolved,
      displayBuildingCode: buildings.get(resolved) || resolved,
      warnings: [`Resolved "${params.buildingQuery}" to building code ${resolved}.`],
    };
  }

  if (prefixMatches.length > 1) {
    throw new Error(`Building "${params.buildingQuery}" is ambiguous. Candidates: ${prefixMatches.join(', ')}`);
  }

  throw new Error(`Building "${params.buildingQuery}" was not found for campus ${params.campus}.`);
}

export async function runFindRoomAvailability(
  context: FindRoomAvailabilityInput,
  deps: {
    supabaseClient?: typeof defaultSupabase;
    now?: () => Date;
  } = {},
): Promise<FindRoomAvailabilityOutput> {
  const supabase = deps.supabaseClient ?? defaultSupabase;
  const now = deps.now?.() ?? new Date();
  const campus = context.campus ?? 'NB';
  const minFreeMinutes = context.minFreeMinutes ?? 60;
  const allowShorterFallback = context.allowShorterFallback ?? true;
  const shorterFallbackThreshold = context.shorterFallbackThreshold ?? 5;
  const limitRooms = context.limitRooms ?? 20;

  const defaultTerm = getDefaultTerm(now);
  const year = context.year ?? defaultTerm.year;
  const term = context.term ?? (defaultTerm.term as '0' | '1' | '7' | '9');
  const termName = getTermName(term);
  const day = context.day ?? getCurrentDayCode(now);
  const dayName = getDayName(day);
  const windowStart = context.startTime ?? getCurrentMilitary(now);
  const windowEnd = context.endTime ?? '2200';

  if (!isValidMilitaryTime(windowStart) || !isValidMilitaryTime(windowEnd)) {
    throw new Error('Time values must be in HHMM 24-hour format.');
  }

  if (militaryToMinutes(windowStart) >= militaryToMinutes(windowEnd)) {
    throw new Error(`startTime (${windowStart}) must be before endTime (${windowEnd}).`);
  }

  const resolution = await resolveBuildingCode({
    supabaseClient: supabase,
    buildingQuery: context.buildingQuery,
    campus,
    year,
    term,
  });

  const { data: roomRows, error: roomRowsError } = await supabase
    .from('v_schedule_builder')
    .select('room_number_norm, room_number')
    .eq('year', year)
    .eq('term', term)
    .eq('term_campus', campus)
    .eq('building_code_norm', resolution.buildingCodeNorm)
    .not('room_number_norm', 'is', null)
    .limit(10000);

  if (roomRowsError) {
    throw new Error(`Failed to load rooms for building ${resolution.buildingCodeNorm}: ${roomRowsError.message}`);
  }

  const roomCatalog = new Map<string, string>();
  for (const row of roomRows || []) {
    if (!row.room_number_norm) {
      continue;
    }
    roomCatalog.set(row.room_number_norm, row.room_number || row.room_number_norm);
  }

  const roomKeys = [...roomCatalog.keys()];
  if (roomKeys.length === 0) {
    return {
      searchContext: {
        campus,
        year,
        term,
        termName,
        day,
        dayName,
        requestedBuilding: context.buildingQuery,
        resolvedBuildingCode: resolution.displayBuildingCode,
        windowStartMilitary: windowStart,
        windowEndMilitary: windowEnd,
        minFreeMinutes,
      },
      rooms: [],
      roomsConsidered: 0,
      roomsWithLongWindows: 0,
      fallbackApplied: false,
      warnings: [...resolution.warnings, `No room inventory found for ${resolution.displayBuildingCode}.`],
    };
  }

  const { data: occupiedRows, error: occupiedRowsError } = await supabase
    .from('v_schedule_builder')
    .select('room_number_norm, start_time_military, end_time_military')
    .eq('year', year)
    .eq('term', term)
    .eq('term_campus', campus)
    .eq('building_code_norm', resolution.buildingCodeNorm)
    .eq('meeting_day', day)
    .not('room_number_norm', 'is', null)
    .not('start_time_military', 'is', null)
    .not('end_time_military', 'is', null)
    .limit(20000);

  if (occupiedRowsError) {
    throw new Error(`Failed to load occupied intervals for ${resolution.displayBuildingCode}: ${occupiedRowsError.message}`);
  }

  const occupiedByRoom = new Map<string, TimeInterval[]>();
  for (const row of occupiedRows || []) {
    if (!row.room_number_norm || !row.start_time_military || !row.end_time_military) {
      continue;
    }

    const start = row.start_time_military;
    const end = row.end_time_military;
    if (!isValidMilitaryTime(start) || !isValidMilitaryTime(end) || militaryToMinutes(start) >= militaryToMinutes(end)) {
      continue;
    }

    const existing = occupiedByRoom.get(row.room_number_norm) || [];
    existing.push({ start, end });
    occupiedByRoom.set(row.room_number_norm, existing);
  }

  const roomAvailability = roomKeys.map((roomKey) => {
    const allFreeWindows = calculateFreeWindows({
      occupiedIntervals: occupiedByRoom.get(roomKey) || [],
      windowStart,
      windowEnd,
    });

    const longFreeWindows = allFreeWindows.filter((window) => window.durationMinutes >= minFreeMinutes);
    const longestAny = allFreeWindows.reduce((max, window) => Math.max(max, window.durationMinutes), 0);
    const longestLong = longFreeWindows.reduce((max, window) => Math.max(max, window.durationMinutes), 0);

    return {
      room: roomCatalog.get(roomKey) || roomKey,
      roomNorm: roomKey,
      allFreeWindows,
      longFreeWindows,
      longestAny,
      longestLong,
    };
  });

  const roomsWithLongWindows = roomAvailability.filter((room) => room.longFreeWindows.length > 0);
  const fallbackApplied = allowShorterFallback && roomsWithLongWindows.length < shorterFallbackThreshold;

  const rankedRooms = roomAvailability
    .map((room) => {
      const freeWindows = fallbackApplied ? room.allFreeWindows : room.longFreeWindows;
      const longestFreeMinutes = fallbackApplied ? room.longestAny : room.longestLong;
      return {
        room: room.room,
        building: resolution.displayBuildingCode,
        longestFreeMinutes,
        isShorterFallback: fallbackApplied && room.longFreeWindows.length === 0 && room.allFreeWindows.length > 0,
        freeWindows,
      };
    })
    .filter((room) => room.freeWindows.length > 0)
    .sort((a, b) => {
      if (b.longestFreeMinutes !== a.longestFreeMinutes) {
        return b.longestFreeMinutes - a.longestFreeMinutes;
      }
      return a.room.localeCompare(b.room);
    })
    .slice(0, limitRooms);

  const warnings = [...resolution.warnings];
  if (fallbackApplied) {
    warnings.push(
      `Included shorter-than-${minFreeMinutes}-minute windows because only ${roomsWithLongWindows.length} room(s) met the minimum.`,
    );
  }

  return {
    searchContext: {
      campus,
      year,
      term,
      termName,
      day,
      dayName,
      requestedBuilding: context.buildingQuery,
      resolvedBuildingCode: resolution.displayBuildingCode,
      windowStartMilitary: windowStart,
      windowEndMilitary: windowEnd,
      minFreeMinutes,
    },
    rooms: rankedRooms,
    roomsConsidered: roomKeys.length,
    roomsWithLongWindows: roomsWithLongWindows.length,
    fallbackApplied,
    warnings,
  };
}

export const findRoomAvailability = createTool({
  id: 'findRoomAvailability',
  description: FIND_ROOM_AVAILABILITY_DESCRIPTION,
  inputSchema: findRoomAvailabilityInputSchema,
  outputSchema: findRoomAvailabilityOutputSchema,
  execute: async ({ context }) => runFindRoomAvailability(context),
});
