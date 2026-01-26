const STORAGE_KEY = 'rutgers-soc-schedule';
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

export const DEFAULT_SCHEDULE: ScheduleSnapshot = {
  version: 1,
  termYear: 2026,
  termCode: '1',
  campus: 'NB',
  lastUpdated: new Date().toISOString(),
  sections: [],
};

const normalizeSchedule = (raw: unknown): ScheduleSnapshot => {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SCHEDULE };
  const data = raw as Partial<ScheduleSnapshot>;
  return {
    version: typeof data.version === 'number' ? data.version : DEFAULT_SCHEDULE.version,
    termYear: typeof data.termYear === 'number' ? data.termYear : DEFAULT_SCHEDULE.termYear,
    termCode: typeof data.termCode === 'string' ? data.termCode : DEFAULT_SCHEDULE.termCode,
    campus: typeof data.campus === 'string' ? data.campus : DEFAULT_SCHEDULE.campus,
    lastUpdated: typeof data.lastUpdated === 'string' ? data.lastUpdated : DEFAULT_SCHEDULE.lastUpdated,
    sections: Array.isArray(data.sections) ? (data.sections as ScheduleSection[]) : [],
  };
};

export const loadSchedule = (): ScheduleSnapshot => {
  if (typeof window === 'undefined') return { ...DEFAULT_SCHEDULE };
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_SCHEDULE };
  try {
    return normalizeSchedule(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SCHEDULE };
  }
};

export const saveSchedule = (schedule: ScheduleSnapshot) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
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
