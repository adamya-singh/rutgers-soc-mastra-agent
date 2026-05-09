import {
  resolveTermLabel,
  type MeetingTime,
  type ScheduleEntry,
  type ScheduleSnapshot,
} from '@/lib/scheduleStorage';

const START_HOUR = 8;
const END_HOUR = 22;
const DAY_ORDER = ['M', 'T', 'W', 'H', 'F', 'S'] as const;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type ActiveScheduleSyncStatus =
  | 'saved'
  | 'dirty'
  | 'saving'
  | 'error'
  | 'signed_out'
  | 'loading';

export type TemporaryScheduleSummary = {
  scheduleId: string;
  label?: string;
  sectionCount: number;
  totalCredits: number;
  courseStrings: string[];
};

export type ActiveScheduleAgentContext = {
  activeScheduleId: string | null;
  name: string;
  termYear: number;
  termCode: string;
  termLabel: string;
  campus: string;
  totalCredits: number;
  sectionCount: number;
  syncStatus: ActiveScheduleSyncStatus;
  sections: Array<{
    indexNumber: string;
    courseString?: string | null;
    courseTitle?: string | null;
    credits?: number | null;
    sectionNumber?: string | null;
    instructors?: string[] | null;
    isOpen?: boolean | null;
    meetingTimes: MeetingTime[];
  }>;
  weekView: {
    days: string[];
    startHour: number;
    endHour: number;
    visibleBlocks: Array<{
      indexNumber: string;
      label: string;
      day: string;
      startTime: string;
      endTime: string;
      location: string;
      isClosed: boolean;
    }>;
    overflowOrSidebarItems: Array<{
      indexNumber: string;
      label: string;
      detail: string;
      reason: 'online' | 'sunday' | 'tba' | 'outside_grid';
    }>;
  };
  temporarySchedules: TemporaryScheduleSummary[];
  previewScheduleId: string | null;
};

type BuildActiveScheduleAgentContextArgs = {
  schedule: ScheduleSnapshot;
  activeEntry: ScheduleEntry | null;
  activeScheduleId: string | null;
  scheduleName: string;
  totalCredits: number;
  syncStatus: ActiveScheduleSyncStatus;
  temporarySchedules?: ScheduleEntry[];
  previewScheduleId?: string | null;
  threadId?: string | null;
};

const parseMilitaryTime = (time?: string | null): number | null => {
  if (!time) return null;
  const raw = time.trim();
  if (!raw) return null;
  const padded = raw.padStart(4, '0');
  const hours = Number(padded.slice(0, 2));
  const minutes = Number(padded.slice(2, 4));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

const formatMilitaryTime = (time?: string | null): string => {
  const minutes = parseMilitaryTime(time);
  if (minutes === null) return 'TBA';
  const hour24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${mins.toString().padStart(2, '0')} ${period}`;
};

const buildMeetingLabel = (meeting: MeetingTime) => {
  const start = meeting.startTime || formatMilitaryTime(meeting.startTimeMilitary);
  const end = meeting.endTime || formatMilitaryTime(meeting.endTimeMilitary);
  if (start === 'TBA' || end === 'TBA') return 'TBA';
  return `${start} - ${end}`;
};

const buildLocationLabel = (meeting: MeetingTime) => {
  const location = [meeting.building, meeting.room].filter(Boolean).join(' ');
  return location || meeting.campus || 'TBA location';
};

const stripTemporaryIdPrefix = (id: string, threadId?: string | null): string => {
  if (!threadId) return id;
  const prefix = `temp:${threadId}:`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
};

const summarizeTemporarySchedules = (
  entries: ScheduleEntry[] | undefined,
  threadId: string | null | undefined,
): TemporaryScheduleSummary[] => {
  if (!entries || entries.length === 0) return [];
  return entries.map((entry) => ({
    scheduleId: stripTemporaryIdPrefix(entry.id, threadId),
    label: entry.temporary?.label,
    sectionCount: entry.snapshot.sections.length,
    totalCredits: entry.snapshot.sections.reduce(
      (sum, section) => sum + (section.credits ?? 0),
      0,
    ),
    courseStrings: entry.snapshot.sections
      .map((section) => section.courseString || '')
      .filter((value) => value.length > 0),
  }));
};

export function buildActiveScheduleAgentContext({
  schedule,
  activeEntry,
  activeScheduleId,
  scheduleName,
  totalCredits,
  syncStatus,
  temporarySchedules,
  previewScheduleId,
  threadId,
}: BuildActiveScheduleAgentContextArgs): ActiveScheduleAgentContext {
  const visibleBlocks: ActiveScheduleAgentContext['weekView']['visibleBlocks'] = [];
  const overflowOrSidebarItems: ActiveScheduleAgentContext['weekView']['overflowOrSidebarItems'] = [];

  schedule.sections.forEach((section) => {
    const meetings = section.meetingTimes || [];
    const courseLabel = section.courseString || 'Course';
    const sectionLabel = section.sectionNumber ? `-${section.sectionNumber}` : '';
    const label = `${courseLabel}${sectionLabel}`;
    const sectionOnline = Boolean(section.isOnline);
    const isClosed = section.isOpen === false;

    if (meetings.length === 0) {
      if (sectionOnline) {
        overflowOrSidebarItems.push({
          indexNumber: section.indexNumber,
          label: courseLabel,
          detail: 'Online or async',
          reason: 'online',
        });
      }
      return;
    }

    meetings.forEach((meeting) => {
      const day = meeting.day ? meeting.day.toUpperCase() : '';
      const meetingOnline = Boolean(meeting.isOnline || sectionOnline);
      const startMinutes = parseMilitaryTime(meeting.startTimeMilitary);
      const endMinutes = parseMilitaryTime(meeting.endTimeMilitary);
      const hasValidTimes = startMinutes !== null && endMinutes !== null;
      const dayIndex = DAY_ORDER.indexOf(day as (typeof DAY_ORDER)[number]);
      const hasValidDay = dayIndex !== -1;
      const isSunday = day === 'U';
      const isOutsideGrid =
        hasValidTimes &&
        (startMinutes < START_HOUR * 60 || endMinutes > END_HOUR * 60);

      if (meetingOnline || isSunday || !hasValidDay || !hasValidTimes) {
        const detailParts = [
          meetingOnline ? 'Online' : null,
          isSunday ? 'Sunday meeting' : null,
          hasValidTimes ? buildMeetingLabel(meeting) : 'TBA',
        ].filter(Boolean);
        const location = [meeting.building, meeting.room].filter(Boolean).join(' ');
        const detail = location
          ? `${detailParts.join(' - ')} - ${location}`
          : detailParts.join(' - ');

        overflowOrSidebarItems.push({
          indexNumber: section.indexNumber,
          label: courseLabel,
          detail,
          reason: meetingOnline ? 'online' : isSunday ? 'sunday' : 'tba',
        });
        return;
      }

      visibleBlocks.push({
        indexNumber: section.indexNumber,
        label,
        day: DAY_LABELS[dayIndex],
        startTime: meeting.startTime || formatMilitaryTime(meeting.startTimeMilitary),
        endTime: meeting.endTime || formatMilitaryTime(meeting.endTimeMilitary),
        location: buildLocationLabel(meeting),
        isClosed,
      });

      if (isOutsideGrid) {
        overflowOrSidebarItems.push({
          indexNumber: section.indexNumber,
          label,
          detail: `${buildMeetingLabel(meeting)} - outside visible grid`,
          reason: 'outside_grid',
        });
      }
    });
  });

  return {
    activeScheduleId,
    name: scheduleName || activeEntry?.name || 'Untitled',
    termYear: schedule.termYear,
    termCode: schedule.termCode,
    termLabel: resolveTermLabel(schedule.termCode),
    campus: schedule.campus,
    totalCredits,
    sectionCount: schedule.sections.length,
    syncStatus,
    sections: schedule.sections.map((section) => ({
      indexNumber: section.indexNumber,
      courseString: section.courseString,
      courseTitle: section.courseTitle,
      credits: section.credits,
      sectionNumber: section.sectionNumber,
      instructors: section.instructors,
      isOpen: section.isOpen,
      meetingTimes: section.meetingTimes || [],
    })),
    weekView: {
      days: [...DAY_LABELS],
      startHour: START_HOUR,
      endHour: END_HOUR,
      visibleBlocks,
      overflowOrSidebarItems,
    },
    temporarySchedules: summarizeTemporarySchedules(temporarySchedules, threadId),
    previewScheduleId: previewScheduleId
      ? stripTemporaryIdPrefix(previewScheduleId, threadId)
      : null,
  };
}
