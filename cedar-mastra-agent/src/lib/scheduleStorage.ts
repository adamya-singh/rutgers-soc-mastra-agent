import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'rutgers-soc-schedules';
const LEGACY_STORAGE_KEY = 'rutgers-soc-schedule';
const STORAGE_VERSION = 2;
export const SCHEDULE_UPDATED_EVENT = 'schedule:updated';

export type MeetingTime = {
  day?: string | null;
  startTimeMilitary?: string | null;
  endTimeMilitary?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  building?: string | null;
  room?: string | null;
  campus?: string | null;
  mode?: string | null;
  isOnline?: boolean | null;
};

export type ScheduleSection = {
  indexNumber: string;
  sectionId?: number | null;
  courseString?: string | null;
  courseTitle?: string | null;
  credits?: number | null;
  sectionNumber?: string | null;
  instructors?: string[] | null;
  isOpen?: boolean | null;
  meetingTimes?: MeetingTime[] | null;
  isOnline?: boolean | null;
  sessionDates?: string | null;
};

type LooseCourseShape = {
  courseString?: unknown;
  title?: unknown;
  expandedTitle?: unknown;
  credits?: unknown;
};

type LooseMeetingTimeShape = Partial<MeetingTime> & {
  dayName?: unknown;
  location?: unknown;
};

type LooseScheduleSectionShape = Partial<ScheduleSection> & {
  course?: LooseCourseShape;
  title?: unknown;
  statusText?: unknown;
  meetingTimes?: LooseMeetingTimeShape[] | null;
};

export type ScheduleSnapshot = {
  version: number;
  termYear: number;
  termCode: string;
  campus: string;
  lastUpdated?: string;
  sections: ScheduleSection[];
};

export type TemporaryScheduleMeta = {
  threadId: string;
  label?: string;
  createdAt: string;
};

export type ScheduleEntry = {
  id: string;
  name: string;
  snapshot: ScheduleSnapshot;
  updatedAt: string;
  lastSyncedAt?: string;
  temporary?: TemporaryScheduleMeta;
};

export const isTemporarySchedule = (entry: ScheduleEntry): boolean =>
  Boolean(entry.temporary);

type ScheduleWorkspace = {
  version: number;
  activeScheduleId: string | null;
  schedules: ScheduleEntry[];
};

export type ScheduleTerm = {
  termYear: number;
  termCode: string;
  termLabel: string;
};

const TERM_LABELS: Record<string, string> = {
  '0': 'Winter',
  '1': 'Spring',
  '7': 'Summer',
  '9': 'Fall',
};

export const resolveTermLabel = (termCode?: string | null) => {
  if (!termCode) return 'Term';
  return TERM_LABELS[termCode] ?? `Term ${termCode}`;
};

export const getCurrentSemesterTerm = (now: Date = new Date()): ScheduleTerm => {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  if (month >= 9) {
    return { termYear: year, termCode: '9', termLabel: 'Fall' };
  }

  if (month >= 6) {
    return { termYear: year, termCode: '7', termLabel: 'Summer' };
  }

  return { termYear: year, termCode: '1', termLabel: 'Spring' };
};

const createDefaultScheduleSnapshot = (): ScheduleSnapshot => {
  const currentTerm = getCurrentSemesterTerm();
  return {
    version: 1,
    termYear: currentTerm.termYear,
    termCode: currentTerm.termCode,
    campus: 'NB',
    lastUpdated: new Date().toISOString(),
    sections: [],
  };
};

export const DEFAULT_SCHEDULE: ScheduleSnapshot = {
  ...createDefaultScheduleSnapshot(),
};

const buildDefaultScheduleName = (snapshot: ScheduleSnapshot) => {
  const termLabel = resolveTermLabel(snapshot.termCode);
  return `Schedule 1 - ${termLabel} ${snapshot.termYear}`;
};

const buildScheduleName = (snapshot: ScheduleSnapshot, index: number) => {
  const termLabel = resolveTermLabel(snapshot.termCode);
  return `Schedule ${index} - ${termLabel} ${snapshot.termYear}`;
};

const buildUniqueDefaultScheduleName = (
  snapshot: ScheduleSnapshot,
  schedules: ScheduleEntry[],
) => {
  const names = new Set(schedules.map((entry) => entry.name));
  let index = 1;
  let name = buildScheduleName(snapshot, index);

  while (names.has(name)) {
    index += 1;
    name = buildScheduleName(snapshot, index);
  }

  return name;
};

const createEmptyScheduleSnapshot = (overrides: Partial<ScheduleSnapshot> = {}): ScheduleSnapshot => {
  const defaultSchedule = createDefaultScheduleSnapshot();
  return {
    ...defaultSchedule,
    ...overrides,
    lastUpdated: new Date().toISOString(),
    sections: overrides.sections ? overrides.sections.map(normalizeScheduleSection) : [],
  };
};

const asString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};

const asNullableString = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  return asString(value);
};

const asNumber = (value: unknown): number | null | undefined => {
  if (value === null) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const asBoolean = (value: unknown): boolean | null | undefined => {
  if (value === null) return null;
  return typeof value === 'boolean' ? value : undefined;
};

export const parseDisplayTimeToMilitary = (time?: string | null): string | undefined => {
  const raw = time?.trim();
  if (!raw || raw.toUpperCase() === 'TBA') return undefined;

  if (/^\d{3,4}$/.test(raw)) {
    return raw.padStart(4, '0');
  }

  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (!match) return undefined;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? '0');
  const period = match[3].toUpperCase();
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;
  if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return undefined;

  if (period === 'AM' && hours === 12) {
    hours = 0;
  } else if (period === 'PM' && hours !== 12) {
    hours += 12;
  }

  return `${hours.toString().padStart(2, '0')}${minutes.toString().padStart(2, '0')}`;
};

export const normalizeMeetingDay = (day?: string | null): string | undefined => {
  const normalized = day?.trim().toLowerCase();
  if (!normalized) return undefined;

  const dayMap: Record<string, string> = {
    m: 'M',
    mon: 'M',
    monday: 'M',
    t: 'T',
    tue: 'T',
    tues: 'T',
    tuesday: 'T',
    w: 'W',
    wed: 'W',
    wednesday: 'W',
    h: 'H',
    thu: 'H',
    thur: 'H',
    thurs: 'H',
    thursday: 'H',
    r: 'H',
    f: 'F',
    fri: 'F',
    friday: 'F',
    s: 'S',
    sat: 'S',
    saturday: 'S',
    u: 'U',
    sun: 'U',
    sunday: 'U',
  };

  return dayMap[normalized] ?? dayMap[normalized[0]];
};

type ParsedLocation = {
  building?: string;
  room?: string;
  campus?: string;
};

export const parseMeetingLocation = (location?: string | null): ParsedLocation => {
  const raw = location?.trim();
  if (!raw) return {};

  const campusMatch = raw.match(/\(([^)]+)\)\s*$/);
  const campus = campusMatch?.[1]?.trim();
  const withoutCampus = campusMatch
    ? raw.slice(0, campusMatch.index).trim()
    : raw;

  if (!withoutCampus || /^online$/i.test(withoutCampus)) {
    return { campus };
  }

  const [building, ...roomParts] = withoutCampus.split(/\s+/);
  return {
    building,
    room: roomParts.length > 0 ? roomParts.join(' ') : undefined,
    campus,
  };
};

const normalizeMeetingIsOnline = (
  meeting: LooseMeetingTimeShape,
  parsedLocation: ParsedLocation,
): boolean | null | undefined => {
  const explicit = asBoolean(meeting.isOnline);
  if (explicit !== undefined) return explicit;

  const mode = asString(meeting.mode)?.toLowerCase();
  const location = asString(meeting.location)?.toLowerCase();
  const campus = parsedLocation.campus?.toLowerCase();
  if (
    mode?.includes('online') ||
    location?.includes('online') ||
    campus?.includes('online')
  ) {
    return true;
  }

  return undefined;
};

export const normalizeScheduleMeetingTime = (
  rawMeeting: LooseMeetingTimeShape,
): MeetingTime => {
  const parsedLocation = parseMeetingLocation(asString(rawMeeting.location));
  const startTimeMilitary = asNullableString(rawMeeting.startTimeMilitary)
    ?? parseDisplayTimeToMilitary(asString(rawMeeting.startTime));
  const endTimeMilitary = asNullableString(rawMeeting.endTimeMilitary)
    ?? parseDisplayTimeToMilitary(asString(rawMeeting.endTime));

  return {
    day: normalizeMeetingDay(asString(rawMeeting.day) ?? asString(rawMeeting.dayName)) ?? null,
    startTimeMilitary,
    endTimeMilitary,
    startTime: asNullableString(rawMeeting.startTime),
    endTime: asNullableString(rawMeeting.endTime),
    building: asNullableString(rawMeeting.building) ?? parsedLocation.building,
    room: asNullableString(rawMeeting.room) ?? parsedLocation.room,
    campus: asNullableString(rawMeeting.campus) ?? parsedLocation.campus,
    mode: asNullableString(rawMeeting.mode),
    isOnline: normalizeMeetingIsOnline(rawMeeting, parsedLocation),
  };
};

export const normalizeScheduleSection = (rawSection: unknown): ScheduleSection => {
  const section = rawSection as LooseScheduleSectionShape;
  const course = section.course ?? {};
  const meetingTimes = Array.isArray(section.meetingTimes)
    ? section.meetingTimes.map(normalizeScheduleMeetingTime)
    : section.meetingTimes === null
      ? null
      : undefined;
  const isOnline = asBoolean(section.isOnline)
    ?? (meetingTimes && meetingTimes.length > 0
      ? meetingTimes.every((meeting) => meeting.isOnline === true)
      : undefined);

  return {
    indexNumber: asString(section.indexNumber) ?? '',
    sectionId: asNumber(section.sectionId),
    courseString: asNullableString(section.courseString) ?? asNullableString(course.courseString),
    courseTitle: asNullableString(section.courseTitle)
      ?? asNullableString(course.title)
      ?? asNullableString(section.title)
      ?? asNullableString(course.expandedTitle),
    credits: asNumber(section.credits) ?? asNumber(course.credits),
    sectionNumber: asNullableString(section.sectionNumber),
    instructors: Array.isArray(section.instructors) ? section.instructors.filter((value): value is string => typeof value === 'string') : undefined,
    isOpen: asBoolean(section.isOpen),
    meetingTimes,
    isOnline,
    sessionDates: asNullableString(section.sessionDates),
  };
};

const normalizeSchedule = (raw: unknown): ScheduleSnapshot => {
  const now = new Date().toISOString();
  const defaultSchedule = createDefaultScheduleSnapshot();
  if (!raw || typeof raw !== 'object') return createEmptyScheduleSnapshot();
  const data = raw as Partial<ScheduleSnapshot>;
  return {
    version: typeof data.version === 'number' ? data.version : defaultSchedule.version,
    termYear: typeof data.termYear === 'number' ? data.termYear : defaultSchedule.termYear,
    termCode: typeof data.termCode === 'string' ? data.termCode : defaultSchedule.termCode,
    campus: typeof data.campus === 'string' ? data.campus : defaultSchedule.campus,
    lastUpdated: typeof data.lastUpdated === 'string' ? data.lastUpdated : now,
    sections: Array.isArray(data.sections) ? data.sections.map(normalizeScheduleSection) : [],
  };
};

const createScheduleEntry = (snapshot: ScheduleSnapshot, name?: string, id?: string): ScheduleEntry => {
  const normalizedSnapshot = normalizeSchedule(snapshot);
  const updatedAt = normalizedSnapshot.lastUpdated ?? new Date().toISOString();
  return {
    id: id ?? generateScheduleId(),
    name: name && name.trim().length > 0 ? name.trim() : buildDefaultScheduleName(normalizedSnapshot),
    snapshot: normalizedSnapshot,
    updatedAt,
  };
};

const normalizeTemporaryMeta = (raw: unknown): TemporaryScheduleMeta | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const data = raw as Partial<TemporaryScheduleMeta>;
  if (typeof data.threadId !== 'string' || data.threadId.trim().length === 0) return undefined;
  return {
    threadId: data.threadId,
    label: typeof data.label === 'string' && data.label.trim().length > 0 ? data.label.trim() : undefined,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
  };
};

const normalizeScheduleEntry = (raw: unknown): ScheduleEntry | null => {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<ScheduleEntry>;
  if (typeof data.id !== 'string') return null;
  const snapshot = normalizeSchedule((data as { snapshot?: unknown }).snapshot);
  const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : snapshot.lastUpdated ?? new Date().toISOString();
  const name = typeof data.name === 'string' && data.name.trim().length > 0
    ? data.name.trim()
    : buildDefaultScheduleName(snapshot);
  const temporary = normalizeTemporaryMeta((data as { temporary?: unknown }).temporary);
  return {
    id: data.id,
    name,
    snapshot,
    updatedAt,
    lastSyncedAt: typeof data.lastSyncedAt === 'string' ? data.lastSyncedAt : undefined,
    ...(temporary ? { temporary } : {}),
  };
};

const normalizeScheduleWorkspace = (raw: unknown): ScheduleWorkspace => {
  if (!raw || typeof raw !== 'object') return createDefaultWorkspace();
  const data = raw as Partial<ScheduleWorkspace>;
  const schedules = Array.isArray(data.schedules)
    ? data.schedules.map(normalizeScheduleEntry).filter((entry): entry is ScheduleEntry => Boolean(entry))
    : [];
  const activeScheduleId = typeof data.activeScheduleId === 'string'
    ? data.activeScheduleId
    : schedules[0]?.id ?? null;
  return {
    version: STORAGE_VERSION,
    activeScheduleId,
    schedules,
  };
};

const createDefaultWorkspace = (): ScheduleWorkspace => {
  const entry = createScheduleEntry(createEmptyScheduleSnapshot());
  return {
    version: STORAGE_VERSION,
    activeScheduleId: entry.id,
    schedules: [entry],
  };
};

const generateScheduleId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return uuidv4();
};

const loadScheduleWorkspace = (): ScheduleWorkspace => {
  if (typeof window === 'undefined') return createDefaultWorkspace();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return normalizeScheduleWorkspace(JSON.parse(raw));
    } catch {
      const fallback = createDefaultWorkspace();
      saveScheduleWorkspace(fallback);
      return fallback;
    }
  }

  const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacyRaw) {
    try {
      const legacySnapshot = normalizeSchedule(JSON.parse(legacyRaw));
      const legacyEntry = createScheduleEntry(legacySnapshot, buildDefaultScheduleName(legacySnapshot));
      const workspace = {
        version: STORAGE_VERSION,
        activeScheduleId: legacyEntry.id,
        schedules: [legacyEntry],
      } satisfies ScheduleWorkspace;
      saveScheduleWorkspace(workspace);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return workspace;
    } catch {
      const fallback = createDefaultWorkspace();
      saveScheduleWorkspace(fallback);
      return fallback;
    }
  }

  const workspace = createDefaultWorkspace();
  saveScheduleWorkspace(workspace);
  return workspace;
};

const saveScheduleWorkspace = (workspace: ScheduleWorkspace) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
};

export const clearLocalSchedules = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  window.dispatchEvent(new Event(SCHEDULE_UPDATED_EVENT));
};

const replaceScheduleEntry = (workspace: ScheduleWorkspace, entry: ScheduleEntry) => {
  const index = workspace.schedules.findIndex((item) => item.id === entry.id);
  if (index === -1) {
    workspace.schedules.push(entry);
    return;
  }
  const nextSchedules = [...workspace.schedules];
  nextSchedules[index] = entry;
  workspace.schedules = nextSchedules;
};

const ensureActiveEntry = (workspace: ScheduleWorkspace): ScheduleEntry => {
  const activeId = workspace.activeScheduleId;
  let active = workspace.schedules.find((entry) => entry.id === activeId && !isTemporarySchedule(entry));
  if (!active) {
    const persistent = workspace.schedules.filter((entry) => !isTemporarySchedule(entry));
    if (persistent.length === 0) {
      const entry = createScheduleEntry(createEmptyScheduleSnapshot());
      workspace.schedules = [...workspace.schedules, entry];
      workspace.activeScheduleId = entry.id;
      return entry;
    }
    active = persistent[0];
    workspace.activeScheduleId = active.id;
  }
  return active;
};

export const listSchedules = (): ScheduleEntry[] => {
  const workspace = loadScheduleWorkspace();
  return workspace.schedules.filter((entry) => !isTemporarySchedule(entry));
};

export const listTemporarySchedules = (threadId: string): ScheduleEntry[] => {
  const workspace = loadScheduleWorkspace();
  return workspace.schedules.filter((entry) => entry.temporary?.threadId === threadId);
};

export const getScheduleById = (scheduleId: string): ScheduleEntry | null => {
  const workspace = loadScheduleWorkspace();
  return workspace.schedules.find((entry) => entry.id === scheduleId) ?? null;
};

export const getActiveScheduleId = (): string | null => {
  const workspace = loadScheduleWorkspace();
  return workspace.activeScheduleId;
};

export const getActiveScheduleEntry = (): ScheduleEntry => {
  const workspace = loadScheduleWorkspace();
  const active = ensureActiveEntry(workspace);
  saveScheduleWorkspace(workspace);
  return active;
};

export const getCurrentSemesterScheduleEntry = (
  campus = 'NB',
  options: { excludeScheduleIds?: string[]; createIfMissing?: boolean } = {},
): ScheduleEntry => {
  const workspace = loadScheduleWorkspace();
  const currentTerm = getCurrentSemesterTerm();
  const excludedIds = new Set(options.excludeScheduleIds ?? []);
  const createIfMissing = options.createIfMissing ?? true;
  const isCurrentSemesterEntry = (entry: ScheduleEntry) => (
    entry.snapshot.termYear === currentTerm.termYear
    && entry.snapshot.termCode === currentTerm.termCode
    && entry.snapshot.campus === campus
    && !excludedIds.has(entry.id)
    && !isTemporarySchedule(entry)
  );
  const availableEntries = workspace.schedules.filter(
    (entry) => !excludedIds.has(entry.id) && !isTemporarySchedule(entry),
  );
  const activeEntry = workspace.schedules.find(
    (entry) => entry.id === workspace.activeScheduleId && !isTemporarySchedule(entry),
  );

  if (activeEntry && isCurrentSemesterEntry(activeEntry) && activeEntry.snapshot.sections.length > 0) {
    return activeEntry;
  }

  const matchingEntries = workspace.schedules.filter(isCurrentSemesterEntry);
  const matchingEntry = matchingEntries.sort((left, right) => {
    const leftSynced = left.lastSyncedAt ? 1 : 0;
    const rightSynced = right.lastSyncedAt ? 1 : 0;
    if (leftSynced !== rightSynced) return rightSynced - leftSynced;
    return right.updatedAt.localeCompare(left.updatedAt);
  })[0];

  if (matchingEntry) {
    workspace.activeScheduleId = matchingEntry.id;
    saveScheduleWorkspace(workspace);
    return matchingEntry;
  }

  if (!createIfMissing && availableEntries.length > 0) {
    const fallbackEntry = availableEntries.sort((left, right) => {
      const leftSynced = left.lastSyncedAt ? 1 : 0;
      const rightSynced = right.lastSyncedAt ? 1 : 0;
      if (leftSynced !== rightSynced) return rightSynced - leftSynced;
      return right.updatedAt.localeCompare(left.updatedAt);
    })[0];
    workspace.activeScheduleId = fallbackEntry.id;
    saveScheduleWorkspace(workspace);
    return fallbackEntry;
  }

  if (!createIfMissing) {
    const fallbackEntry = activeEntry ?? workspace.schedules[0];
    if (fallbackEntry) {
      workspace.activeScheduleId = fallbackEntry.id;
      saveScheduleWorkspace(workspace);
      return fallbackEntry;
    }
  }

  const entry = createScheduleEntry(createEmptyScheduleSnapshot({
    termYear: currentTerm.termYear,
    termCode: currentTerm.termCode,
    campus,
  }));
  entry.name = buildUniqueDefaultScheduleName(entry.snapshot, workspace.schedules);
  workspace.schedules = [...workspace.schedules, entry];
  workspace.activeScheduleId = entry.id;
  saveScheduleWorkspace(workspace);
  return entry;
};

export const loadSchedule = (): ScheduleSnapshot => {
  return { ...getActiveScheduleEntry().snapshot };
};

export const saveSchedule = (schedule: ScheduleSnapshot) => {
  if (typeof window === 'undefined') return;
  const workspace = loadScheduleWorkspace();
  const active = ensureActiveEntry(workspace);
  const nextSnapshot = normalizeSchedule({
    ...schedule,
    lastUpdated: schedule.lastUpdated ?? new Date().toISOString(),
  });
  const updatedEntry = {
    ...active,
    snapshot: nextSnapshot,
    updatedAt: nextSnapshot.lastUpdated ?? new Date().toISOString(),
  };
  replaceScheduleEntry(workspace, updatedEntry);
  workspace.activeScheduleId = updatedEntry.id;
  saveScheduleWorkspace(workspace);
};

export const setActiveScheduleId = (scheduleId: string): boolean => {
  if (typeof window === 'undefined') return false;
  const workspace = loadScheduleWorkspace();
  const target = workspace.schedules.find((entry) => entry.id === scheduleId);
  if (!target) return false;
  if (isTemporarySchedule(target)) return false;
  workspace.activeScheduleId = scheduleId;
  saveScheduleWorkspace(workspace);
  dispatchScheduleUpdated();
  return true;
};

export const createSchedule = (options: {
  name?: string;
  snapshot?: ScheduleSnapshot;
  setActive?: boolean;
} = {}): ScheduleEntry => {
  if (typeof window === 'undefined') {
    return createScheduleEntry(options.snapshot ?? createEmptyScheduleSnapshot(), options.name);
  }
  const workspace = loadScheduleWorkspace();
  const snapshot = options.snapshot ?? createEmptyScheduleSnapshot();
  const entry = createScheduleEntry(
    snapshot,
    options.name ?? buildUniqueDefaultScheduleName(snapshot, workspace.schedules),
  );
  workspace.schedules = [...workspace.schedules, entry];
  if (options.setActive ?? true) {
    workspace.activeScheduleId = entry.id;
  }
  saveScheduleWorkspace(workspace);
  dispatchScheduleUpdated();
  return entry;
};

export const duplicateSchedule = (scheduleId?: string): ScheduleEntry => {
  const workspace = loadScheduleWorkspace();
  const sourceId = scheduleId ?? workspace.activeScheduleId;
  const source = workspace.schedules.find((entry) => entry.id === sourceId);
  const snapshot = source?.snapshot ?? createEmptyScheduleSnapshot();
  const name = source ? `${source.name} (Copy)` : undefined;
  return createSchedule({ name, snapshot: { ...snapshot }, setActive: true });
};

export const renameSchedule = (scheduleId: string, name: string): boolean => {
  if (typeof window === 'undefined') return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  const workspace = loadScheduleWorkspace();
  const entry = workspace.schedules.find((item) => item.id === scheduleId);
  if (!entry) return false;
  const updatedEntry = {
    ...entry,
    name: trimmed,
    updatedAt: new Date().toISOString(),
  };
  replaceScheduleEntry(workspace, updatedEntry);
  saveScheduleWorkspace(workspace);
  dispatchScheduleUpdated();
  return true;
};

export const deleteSchedule = (scheduleId: string): boolean => {
  if (typeof window === 'undefined') return false;
  const workspace = loadScheduleWorkspace();
  const nextSchedules = workspace.schedules.filter((entry) => entry.id !== scheduleId);
  if (nextSchedules.length === workspace.schedules.length) return false;

  const persistentRemaining = nextSchedules.filter((entry) => !isTemporarySchedule(entry));
  if (persistentRemaining.length === 0) {
    const entry = createScheduleEntry(createEmptyScheduleSnapshot());
    workspace.schedules = [...nextSchedules, entry];
    workspace.activeScheduleId = entry.id;
  } else {
    workspace.schedules = nextSchedules;
    if (workspace.activeScheduleId === scheduleId) {
      workspace.activeScheduleId = persistentRemaining[0]?.id ?? null;
    }
  }

  saveScheduleWorkspace(workspace);
  dispatchScheduleUpdated();
  return true;
};

export const updateScheduleSnapshot = (scheduleId: string, snapshot: ScheduleSnapshot): boolean => {
  if (typeof window === 'undefined') return false;
  const workspace = loadScheduleWorkspace();
  const entry = workspace.schedules.find((item) => item.id === scheduleId);
  if (!entry) return false;
  const normalizedSnapshot = normalizeSchedule(snapshot);
  const updatedEntry = {
    ...entry,
    snapshot: normalizedSnapshot,
    updatedAt: normalizedSnapshot.lastUpdated ?? new Date().toISOString(),
  };
  replaceScheduleEntry(workspace, updatedEntry);
  saveScheduleWorkspace(workspace);
  dispatchScheduleUpdated();
  return true;
};

export const markScheduleSynced = (scheduleId: string, syncedAt: string): boolean => {
  if (typeof window === 'undefined') return false;
  const workspace = loadScheduleWorkspace();
  const entry = workspace.schedules.find((item) => item.id === scheduleId);
  if (!entry) return false;
  const updatedEntry = {
    ...entry,
    lastSyncedAt: syncedAt,
    updatedAt: syncedAt,
  };
  replaceScheduleEntry(workspace, updatedEntry);
  saveScheduleWorkspace(workspace);
  dispatchScheduleUpdated();
  return true;
};

export type RemoteSchedulePayload = {
  id: string;
  name: string;
  snapshot: ScheduleSnapshot;
  updatedAt?: string | null;
};

export const applyRemoteSchedules = (remoteSchedules: RemoteSchedulePayload[]) => {
  if (typeof window === 'undefined') return;
  const workspace = loadScheduleWorkspace();
  const nextSchedules = [...workspace.schedules];
  const byId = new Map(nextSchedules.map((entry, index) => [entry.id, { entry, index }]));

  remoteSchedules.forEach((remote) => {
    const normalizedSnapshot = normalizeSchedule(remote.snapshot);
    const updatedAt = remote.updatedAt ?? normalizedSnapshot.lastUpdated ?? new Date().toISOString();
    const existing = byId.get(remote.id);
    if (existing) {
      const current = existing.entry;
      // Defense in depth: never let a remote payload overwrite a local temp entry.
      if (isTemporarySchedule(current)) return;
      const isDirty = Boolean(current.lastSyncedAt && current.updatedAt > current.lastSyncedAt);
      if (!isDirty || updatedAt > current.updatedAt) {
        nextSchedules[existing.index] = {
          ...current,
          name: remote.name,
          snapshot: normalizedSnapshot,
          updatedAt,
          lastSyncedAt: updatedAt,
        };
      } else {
        nextSchedules[existing.index] = {
          ...current,
          lastSyncedAt: updatedAt,
        };
      }
    } else {
      nextSchedules.push({
        id: remote.id,
        name: remote.name,
        snapshot: normalizedSnapshot,
        updatedAt,
        lastSyncedAt: updatedAt,
      });
    }
  });

  workspace.schedules = nextSchedules;
  const persistentSchedules = nextSchedules.filter((entry) => !isTemporarySchedule(entry));
  const activeStillExists = workspace.activeScheduleId
    ? persistentSchedules.some((entry) => entry.id === workspace.activeScheduleId)
    : false;
  if (!activeStillExists) {
    workspace.activeScheduleId = persistentSchedules[0]?.id ?? null;
  }

  saveScheduleWorkspace(workspace);
  dispatchScheduleUpdated();
};

export const addSectionToSchedule = (
  schedule: ScheduleSnapshot,
  section: unknown,
): { schedule: ScheduleSnapshot; added: boolean } => {
  const normalizedSection = normalizeScheduleSection(section);
  const exists = schedule.sections.some((entry) => entry.indexNumber === normalizedSection.indexNumber);
  if (exists) return { schedule, added: false };
  const nextSchedule = {
    ...schedule,
    lastUpdated: new Date().toISOString(),
    sections: [...schedule.sections.map(normalizeScheduleSection), normalizedSection],
  };
  return { schedule: nextSchedule, added: true };
};

export const removeSectionFromSchedule = (
  schedule: ScheduleSnapshot,
  indexNumber: string,
): { schedule: ScheduleSnapshot; removed: boolean } => {
  const nextSections = schedule.sections.filter((entry) => entry.indexNumber !== indexNumber);
  if (nextSections.length === schedule.sections.length) {
    return { schedule, removed: false };
  }
  return {
    schedule: {
      ...schedule,
      lastUpdated: new Date().toISOString(),
      sections: nextSections,
    },
    removed: true,
  };
};

export const dispatchScheduleUpdated = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SCHEDULE_UPDATED_EVENT));
};

export const getScheduleSyncStatus = (scheduleId: string): 'saved' | 'dirty' => {
  const workspace = loadScheduleWorkspace();
  const entry = workspace.schedules.find((item) => item.id === scheduleId);
  if (!entry) return 'dirty';
  if (!entry.lastSyncedAt) return 'dirty';
  return entry.updatedAt > entry.lastSyncedAt ? 'dirty' : 'saved';
};

export const buildTemporaryScheduleId = (threadId: string, agentScheduleId: string): string =>
  `temp:${threadId}:${agentScheduleId}`;

export const createTemporarySchedule = (options: {
  threadId: string;
  id?: string;
  label?: string;
  snapshot?: ScheduleSnapshot;
  basedOnActive?: boolean;
}): ScheduleEntry | null => {
  if (typeof window === 'undefined') return null;
  const trimmedThreadId = options.threadId?.trim();
  if (!trimmedThreadId) return null;

  const workspace = loadScheduleWorkspace();
  const trimmedId = options.id?.trim();
  if (trimmedId) {
    const existing = workspace.schedules.find((entry) => entry.id === trimmedId);
    if (existing) {
      return isTemporarySchedule(existing) ? existing : null;
    }
  }

  let snapshot = options.snapshot;
  if (!snapshot && options.basedOnActive) {
    const activeEntry = workspace.schedules.find(
      (entry) => entry.id === workspace.activeScheduleId && !isTemporarySchedule(entry),
    );
    if (activeEntry) {
      snapshot = {
        ...activeEntry.snapshot,
        lastUpdated: new Date().toISOString(),
        sections: [...activeEntry.snapshot.sections],
      };
    }
  }

  const finalSnapshot = snapshot ?? createEmptyScheduleSnapshot();
  const trimmedLabel = options.label?.trim();
  const labelOrDefault = trimmedLabel && trimmedLabel.length > 0 ? trimmedLabel : undefined;

  const entry = createScheduleEntry(
    finalSnapshot,
    labelOrDefault ?? buildUniqueDefaultScheduleName(finalSnapshot, workspace.schedules),
    trimmedId,
  );

  entry.temporary = {
    threadId: trimmedThreadId,
    label: labelOrDefault,
    createdAt: new Date().toISOString(),
  };

  workspace.schedules = [...workspace.schedules, entry];
  saveScheduleWorkspace(workspace);
  dispatchScheduleUpdated();
  return entry;
};

export const addSectionToScheduleById = (
  scheduleId: string,
  section: unknown,
): boolean => {
  if (typeof window === 'undefined') return false;
  const workspace = loadScheduleWorkspace();
  const entry = workspace.schedules.find((item) => item.id === scheduleId);
  if (!entry) return false;
  const normalizedSection = normalizeScheduleSection(section);
  const exists = entry.snapshot.sections.some(
    (existing) => existing.indexNumber === normalizedSection.indexNumber,
  );
  if (exists) return false;
  const lastUpdated = new Date().toISOString();
  const updatedEntry: ScheduleEntry = {
    ...entry,
    snapshot: {
      ...entry.snapshot,
      lastUpdated,
      sections: [...entry.snapshot.sections.map(normalizeScheduleSection), normalizedSection],
    },
    updatedAt: lastUpdated,
  };
  replaceScheduleEntry(workspace, updatedEntry);
  saveScheduleWorkspace(workspace);
  dispatchScheduleUpdated();
  return true;
};

export const removeSectionFromScheduleById = (
  scheduleId: string,
  indexNumber: string,
): boolean => {
  if (typeof window === 'undefined') return false;
  const workspace = loadScheduleWorkspace();
  const entry = workspace.schedules.find((item) => item.id === scheduleId);
  if (!entry) return false;
  const nextSections = entry.snapshot.sections.filter(
    (existing) => existing.indexNumber !== indexNumber,
  );
  if (nextSections.length === entry.snapshot.sections.length) return false;
  const lastUpdated = new Date().toISOString();
  const updatedEntry: ScheduleEntry = {
    ...entry,
    snapshot: {
      ...entry.snapshot,
      lastUpdated,
      sections: nextSections,
    },
    updatedAt: lastUpdated,
  };
  replaceScheduleEntry(workspace, updatedEntry);
  saveScheduleWorkspace(workspace);
  dispatchScheduleUpdated();
  return true;
};

export const promoteTemporaryToSaved = (
  scheduleId: string,
  name: string,
): ScheduleEntry | null => {
  if (typeof window === 'undefined') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const workspace = loadScheduleWorkspace();
  const entry = workspace.schedules.find((item) => item.id === scheduleId);
  if (!entry || !isTemporarySchedule(entry)) return null;
  const lastUpdated = new Date().toISOString();
  const promotedEntry: ScheduleEntry = {
    id: generateScheduleId(),
    name: trimmed,
    snapshot: {
      ...entry.snapshot,
      lastUpdated,
      sections: [...entry.snapshot.sections],
    },
    updatedAt: lastUpdated,
  };
  workspace.schedules = workspace.schedules.map((item) =>
    item.id === scheduleId ? promotedEntry : item,
  );
  saveScheduleWorkspace(workspace);
  dispatchScheduleUpdated();
  return promotedEntry;
};

export const discardTemporarySchedule = (scheduleId: string): boolean => {
  if (typeof window === 'undefined') return false;
  const workspace = loadScheduleWorkspace();
  const entry = workspace.schedules.find((item) => item.id === scheduleId);
  if (!entry || !isTemporarySchedule(entry)) return false;
  workspace.schedules = workspace.schedules.filter((item) => item.id !== scheduleId);
  saveScheduleWorkspace(workspace);
  dispatchScheduleUpdated();
  return true;
};

export const discardTemporarySchedulesForThread = (threadId: string): number => {
  if (typeof window === 'undefined') return 0;
  const workspace = loadScheduleWorkspace();
  const before = workspace.schedules.length;
  workspace.schedules = workspace.schedules.filter(
    (item) => item.temporary?.threadId !== threadId,
  );
  const removed = before - workspace.schedules.length;
  if (removed > 0) {
    saveScheduleWorkspace(workspace);
    dispatchScheduleUpdated();
  }
  return removed;
};
