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

export type ScheduleSnapshot = {
  version: number;
  termYear: number;
  termCode: string;
  campus: string;
  lastUpdated?: string;
  sections: ScheduleSection[];
};

export type ScheduleEntry = {
  id: string;
  name: string;
  snapshot: ScheduleSnapshot;
  updatedAt: string;
  lastSyncedAt?: string;
};

type ScheduleWorkspace = {
  version: number;
  activeScheduleId: string | null;
  schedules: ScheduleEntry[];
};

export const DEFAULT_SCHEDULE: ScheduleSnapshot = {
  version: 1,
  termYear: 2026,
  termCode: '1',
  campus: 'NB',
  lastUpdated: new Date().toISOString(),
  sections: [],
};

const TERM_LABELS: Record<string, string> = {
  '1': 'Spring',
  '7': 'Summer',
  '9': 'Fall',
};

const resolveTermLabel = (termCode?: string | null) => {
  if (!termCode) return 'Term';
  return TERM_LABELS[termCode] ?? `Term ${termCode}`;
};

const buildDefaultScheduleName = (snapshot: ScheduleSnapshot) => {
  const termLabel = resolveTermLabel(snapshot.termCode);
  return `${termLabel} ${snapshot.termYear} - ${snapshot.campus}`;
};

const createEmptyScheduleSnapshot = (overrides: Partial<ScheduleSnapshot> = {}): ScheduleSnapshot => {
  return {
    ...DEFAULT_SCHEDULE,
    ...overrides,
    lastUpdated: new Date().toISOString(),
    sections: overrides.sections ? [...overrides.sections] : [],
  };
};

const normalizeSchedule = (raw: unknown): ScheduleSnapshot => {
  const now = new Date().toISOString();
  if (!raw || typeof raw !== 'object') return createEmptyScheduleSnapshot();
  const data = raw as Partial<ScheduleSnapshot>;
  return {
    version: typeof data.version === 'number' ? data.version : DEFAULT_SCHEDULE.version,
    termYear: typeof data.termYear === 'number' ? data.termYear : DEFAULT_SCHEDULE.termYear,
    termCode: typeof data.termCode === 'string' ? data.termCode : DEFAULT_SCHEDULE.termCode,
    campus: typeof data.campus === 'string' ? data.campus : DEFAULT_SCHEDULE.campus,
    lastUpdated: typeof data.lastUpdated === 'string' ? data.lastUpdated : now,
    sections: Array.isArray(data.sections) ? (data.sections as ScheduleSection[]) : [],
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

const normalizeScheduleEntry = (raw: unknown): ScheduleEntry | null => {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<ScheduleEntry>;
  if (typeof data.id !== 'string') return null;
  const snapshot = normalizeSchedule((data as { snapshot?: unknown }).snapshot);
  const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : snapshot.lastUpdated ?? new Date().toISOString();
  const name = typeof data.name === 'string' && data.name.trim().length > 0
    ? data.name.trim()
    : buildDefaultScheduleName(snapshot);
  return {
    id: data.id,
    name,
    snapshot,
    updatedAt,
    lastSyncedAt: typeof data.lastSyncedAt === 'string' ? data.lastSyncedAt : undefined,
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
  return `schedule-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
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
  let active = workspace.schedules.find((entry) => entry.id === activeId);
  if (!active) {
    if (workspace.schedules.length === 0) {
      const entry = createScheduleEntry(createEmptyScheduleSnapshot());
      workspace.schedules = [entry];
      workspace.activeScheduleId = entry.id;
      return entry;
    }
    active = workspace.schedules[0];
    workspace.activeScheduleId = active.id;
  }
  return active;
};

export const listSchedules = (): ScheduleEntry[] => {
  const workspace = loadScheduleWorkspace();
  return workspace.schedules;
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
  const exists = workspace.schedules.some((entry) => entry.id === scheduleId);
  if (!exists) return false;
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
  const entry = createScheduleEntry(options.snapshot ?? createEmptyScheduleSnapshot(), options.name);
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

  if (nextSchedules.length === 0) {
    const entry = createScheduleEntry(createEmptyScheduleSnapshot());
    workspace.schedules = [entry];
    workspace.activeScheduleId = entry.id;
  } else {
    workspace.schedules = nextSchedules;
    if (workspace.activeScheduleId === scheduleId) {
      workspace.activeScheduleId = nextSchedules[0]?.id ?? null;
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
  if (workspace.activeScheduleId) {
    const exists = nextSchedules.some((entry) => entry.id === workspace.activeScheduleId);
    if (!exists) {
      workspace.activeScheduleId = nextSchedules[0]?.id ?? null;
    }
  } else {
    workspace.activeScheduleId = nextSchedules[0]?.id ?? null;
  }

  saveScheduleWorkspace(workspace);
  dispatchScheduleUpdated();
};

export const addSectionToSchedule = (
  schedule: ScheduleSnapshot,
  section: ScheduleSection,
): { schedule: ScheduleSnapshot; added: boolean } => {
  const exists = schedule.sections.some((entry) => entry.indexNumber === section.indexNumber);
  if (exists) return { schedule, added: false };
  const nextSchedule = {
    ...schedule,
    lastUpdated: new Date().toISOString(),
    sections: [...schedule.sections, section],
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
