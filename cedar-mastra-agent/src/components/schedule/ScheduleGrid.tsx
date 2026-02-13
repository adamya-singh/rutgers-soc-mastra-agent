'use client';

import React from 'react';
import { supabaseClient } from '@/lib/supabaseClient';
import {
  DEFAULT_SCHEDULE,
  SCHEDULE_UPDATED_EVENT,
  createSchedule,
  deleteSchedule,
  duplicateSchedule,
  getActiveScheduleEntry,
  getScheduleSyncStatus,
  listSchedules,
  renameSchedule,
  removeSectionFromSchedule,
  saveSchedule,
  setActiveScheduleId,
  type MeetingTime,
  type ScheduleEntry,
  type ScheduleSnapshot,
} from '@/lib/scheduleStorage';
import {
  deleteRemoteSchedule,
  hydrateFromRemote,
  upsertRemoteSchedule,
} from '@/lib/scheduleSync';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';

const START_HOUR = 8;
const END_HOUR = 22;
const SLOT_MINUTES = 30;
const TOTAL_SLOTS = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES;

const DAY_ORDER = ['M', 'T', 'W', 'H', 'F', 'S'] as const;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type GridBlock = {
  key: string;
  column: number;
  rowStart: number;
  rowEnd: number;
  overflowTop: boolean;
  overflowBottom: boolean;
  label: string;
  subtitle: string;
  meta: string;
  color: string;
  tooltip: string;
  isClosed: boolean;
  indexNumber: string;
  courseTitle: string;
  instructors: string;
};

type SidebarItem = {
  key: string;
  label: string;
  subtitle: string;
  detail: string;
  muted?: boolean;
  isClosed?: boolean;
  indexNumber: string;
};

const campusColors: Record<string, string> = {
  busch: '#4D78C2',
  livingston: '#D88A4A',
  'college avenue': '#CFA64B',
  'cook/douglass': '#4FAE7D',
  'downtown nb': '#8E6BD2',
  online: '#7B8694',
  newark: '#4CA9A6',
  camden: '#CC6C96',
};

const campusLabels: Record<string, string> = {
  busch: 'Busch',
  livingston: 'Livingston',
  'college avenue': 'College Ave',
  'cook/douglass': 'Cook/Doug',
  'downtown nb': 'Downtown',
  online: 'Online',
  newark: 'Newark',
  camden: 'Camden',
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

const formatHourLabel = (hour24: number): string => {
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12} ${period}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const resolveCampusColor = (campus?: string | null, isOnline?: boolean | null) => {
  if (isOnline) return campusColors.online;
  if (!campus) return campusColors.busch;
  const key = campus.toLowerCase();
  if (campusColors[key]) return campusColors[key];
  if (key.includes('busch')) return campusColors.busch;
  if (key.includes('livingston')) return campusColors.livingston;
  if (key.includes('college avenue')) return campusColors['college avenue'];
  if (key.includes('cook') || key.includes('douglass')) return campusColors['cook/douglass'];
  if (key.includes('downtown')) return campusColors['downtown nb'];
  if (key.includes('newark') || key.includes('nk')) return campusColors.newark;
  if (key.includes('camden') || key.includes('cm')) return campusColors.camden;
  if (key.includes('online')) return campusColors.online;
  return campusColors.busch;
};

const buildMeetingLabel = (meeting: MeetingTime) => {
  const start = meeting.startTime || formatMilitaryTime(meeting.startTimeMilitary);
  const end = meeting.endTime || formatMilitaryTime(meeting.endTimeMilitary);
  if (start === 'TBA' || end === 'TBA') return 'TBA';
  return `${start} – ${end}`;
};

/* ------------------------------------------------------------------ */
/*  Block Popover — click a grid block to inspect / remove a section  */
/* ------------------------------------------------------------------ */

function BlockPopover({
  block,
  anchor,
  onClose,
  onRemove,
}: {
  block: GridBlock;
  anchor: { x: number; y: number };
  onClose: () => void;
  onRemove: (indexNumber: string) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 w-64 rounded-xl border border-border bg-surface-2 p-4 shadow-elev-2 animate-fade-up"
      style={{ left: anchor.x, top: anchor.y }}
    >
      <p className="text-sm font-semibold text-foreground">{block.label}</p>
      {block.courseTitle && (
        <p className="mt-0.5 text-xs text-muted-foreground">{block.courseTitle}</p>
      )}
      {block.instructors && (
        <p className="mt-1 text-xs text-muted-foreground">{block.instructors}</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{block.subtitle}</p>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">Index #{block.indexNumber}</span>
        <button
          type="button"
          onClick={() => onRemove(block.indexNumber)}
          className="rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive transition hover:bg-destructive/20"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Delete Confirmation Dialog                                         */
/* ------------------------------------------------------------------ */

function DeleteDialog({
  open,
  name,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface-2 p-6 shadow-elev-2 animate-fade-up">
          <Dialog.Title className="text-base font-semibold text-foreground">
            Delete schedule
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Are you sure you want to delete <strong>&ldquo;{name}&rdquo;</strong>? This can&rsquo;t be undone.
          </Dialog.Description>
          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-1"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-full bg-destructive px-4 py-2 text-xs font-semibold text-white transition hover:bg-destructive/90"
            >
              Delete
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------------ */
/*  Main ScheduleGrid Component                                        */
/* ------------------------------------------------------------------ */

export const ScheduleGrid: React.FC = () => {
  const [schedule, setSchedule] = React.useState<ScheduleSnapshot>({ ...DEFAULT_SCHEDULE });
  const [schedules, setSchedules] = React.useState<ScheduleEntry[]>([]);
  const [activeScheduleId, setActiveScheduleIdState] = React.useState<string | null>(null);
  const [scheduleName, setScheduleName] = React.useState('');
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [isEditingName, setIsEditingName] = React.useState(false);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [syncState, setSyncState] = React.useState<'idle' | 'saving' | 'error'>('idle');
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const [isHydrating, setIsHydrating] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [selectedBlock, setSelectedBlock] = React.useState<{
    block: GridBlock;
    anchor: { x: number; y: number };
  } | null>(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(true);

  const refreshWorkspace = React.useCallback(() => {
    const activeEntry = getActiveScheduleEntry();
    setSchedule(activeEntry.snapshot);
    setSchedules(listSchedules());
    setActiveScheduleIdState(activeEntry.id);
  }, []);

  React.useEffect(() => {
    refreshWorkspace();
    setIsLoaded(true);
  }, [refreshWorkspace]);

  React.useEffect(() => {
    if (!isLoaded) return;
    saveSchedule(schedule);
  }, [schedule, isLoaded]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleUpdate = () => refreshWorkspace();
    window.addEventListener(SCHEDULE_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(SCHEDULE_UPDATED_EVENT, handleUpdate);
  }, [refreshWorkspace]);

  React.useEffect(() => {
    let isMounted = true;
    supabaseClient.auth.getUser().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) {
        console.warn('Failed to read auth state', error);
        setUserId(null);
        return;
      }
      setUserId(data.user?.id ?? null);
    });
    const { data: authListener } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    if (!userId) {
      setIsHydrating(false);
      setSyncError(null);
      return;
    }
    setIsHydrating(true);
    setSyncError(null);
    hydrateFromRemote()
      .then(() => {
        refreshWorkspace();
      })
      .catch((error) => {
        console.error('Failed to load saved schedules', error);
        setSyncError('Could not load saved schedules.');
      })
      .finally(() => {
        setIsHydrating(false);
      });
  }, [userId, refreshWorkspace]);

  const activeEntry = React.useMemo(
    () => schedules.find((entry) => entry.id === activeScheduleId) ?? null,
    [schedules, activeScheduleId],
  );

  React.useEffect(() => {
    if (!activeEntry || isEditingName) return;
    setScheduleName(activeEntry.name);
  }, [activeEntry, isEditingName]);

  const syncStatus = activeEntry ? getScheduleSyncStatus(activeEntry.id) : 'dirty';
  const isLoggedIn = Boolean(userId);

  const syncActiveSchedule = React.useCallback(async () => {
    if (!isLoggedIn || !activeEntry || !userId) return;
    try {
      setSyncState('saving');
      await upsertRemoteSchedule(activeEntry, userId);
      setSyncState('idle');
      setSyncError(null);
    } catch (error) {
      console.error('Failed to sync schedule', error);
      setSyncState('error');
      setSyncError('Sync failed. Try again.');
    }
  }, [activeEntry, isLoggedIn, userId]);

  React.useEffect(() => {
    if (!isLoggedIn || !activeEntry) return;
    if (isHydrating) return;
    if (syncState === 'saving') return;
    if (syncStatus === 'saved') return;
    const timer = window.setTimeout(() => {
      void syncActiveSchedule();
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [activeEntry, isLoggedIn, isHydrating, syncState, syncStatus, syncActiveSchedule]);

  const handleScheduleSelect = React.useCallback(
    (id: string) => {
      if (!id) return;
      const changed = setActiveScheduleId(id);
      if (changed) {
        setIsEditingName(false);
      }
    },
    [],
  );

  const handleCreateSchedule = React.useCallback(() => {
    createSchedule({ setActive: true });
    setIsEditingName(false);
  }, []);

  const handleDuplicateSchedule = React.useCallback(() => {
    duplicateSchedule(activeScheduleId ?? undefined);
    setIsEditingName(false);
  }, [activeScheduleId]);

  const handleDeleteSchedule = React.useCallback(async () => {
    if (!activeEntry) return;
    const scheduleId = activeEntry.id;
    const deleted = deleteSchedule(scheduleId);
    if (!deleted) return;
    setDeleteDialogOpen(false);

    if (isLoggedIn) {
      try {
        await deleteRemoteSchedule(scheduleId);
        setSyncError(null);
      } catch (error) {
        console.error('Failed to delete remote schedule', error);
        setSyncError('Remote delete failed.');
      }
    }
  }, [activeEntry, isLoggedIn]);

  const handleRemoveSection = React.useCallback(
    (indexNumber: string) => {
      const result = removeSectionFromSchedule(schedule, indexNumber);
      saveSchedule(result.schedule);
      setSchedule(result.schedule);
      setSelectedBlock(null);
      // Dispatch event so other components refresh
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SCHEDULE_UPDATED_EVENT));
      }
    },
    [schedule],
  );

  const commitScheduleName = React.useCallback(() => {
    if (!activeEntry) return;
    const trimmed = scheduleName.trim();
    if (!trimmed) {
      setScheduleName(activeEntry.name);
      return;
    }
    if (trimmed === activeEntry.name) return;
    renameSchedule(activeEntry.id, trimmed);
  }, [activeEntry, scheduleName]);

  const scheduleStatusLabel = !isLoggedIn
    ? 'Sign in to sync'
    : isHydrating
      ? 'Loading...'
      : syncState === 'saving'
        ? 'Saving...'
        : syncState === 'error' || syncError
          ? 'Sync issue'
          : syncStatus === 'saved'
            ? 'Saved'
            : 'Not saved';

  const scheduleStatusTone = !isLoggedIn
    ? 'text-muted-foreground'
    : syncState === 'error' || syncError
      ? 'text-red-400'
      : syncStatus === 'saved'
        ? 'text-success'
        : 'text-warning';

  const sortedSchedules = React.useMemo(() => {
    return [...schedules].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [schedules]);

  // ----- Compute total credits -----
  const totalCredits = React.useMemo(() => {
    return schedule.sections.reduce((sum, s) => sum + (s.credits ?? 0), 0);
  }, [schedule]);

  // ----- Compute used campus colors (for legend) -----
  const usedCampusColors = React.useMemo(() => {
    const seen = new Set<string>();
    schedule.sections.forEach((section) => {
      (section.meetingTimes || []).forEach((mt) => {
        if (mt.isOnline || section.isOnline) {
          seen.add('online');
        } else if (mt.campus) {
          const key = mt.campus.toLowerCase();
          // Resolve to a canonical key
          for (const canonicalKey of Object.keys(campusColors)) {
            if (key.includes(canonicalKey) || canonicalKey.includes(key)) {
              seen.add(canonicalKey);
              break;
            }
          }
        }
      });
    });
    return Array.from(seen);
  }, [schedule]);

  const { blocks, sidebarItems } = React.useMemo(() => {
    const nextBlocks: GridBlock[] = [];
    const nextSidebar: SidebarItem[] = [];

    schedule.sections.forEach((section) => {
      const meetings = section.meetingTimes || [];
      const courseLabel = section.courseString || 'Course';
      const title = section.courseTitle || '';
      const sectionLabel = section.sectionNumber ? `Sec ${section.sectionNumber}` : '';
      const instructor = section.instructors && section.instructors.length > 0 ? section.instructors[0] : '';
      const sectionOnline = Boolean(section.isOnline);
      const isClosed = section.isOpen === false;

      if (meetings.length === 0) {
        if (sectionOnline) {
          nextSidebar.push({
            key: `online-${section.indexNumber}`,
            label: courseLabel,
            subtitle: title,
            detail: 'Online or async',
            isClosed,
            indexNumber: section.indexNumber,
          });
        }
        return;
      }

      meetings.forEach((meeting, index) => {
        const day = meeting.day ? meeting.day.toUpperCase() : '';
        const meetingOnline = Boolean(meeting.isOnline || sectionOnline);
        const dayIndex = DAY_ORDER.indexOf(day as (typeof DAY_ORDER)[number]);
        const hasValidDay = dayIndex !== -1;
        const startMinutes = parseMilitaryTime(meeting.startTimeMilitary);
        const endMinutes = parseMilitaryTime(meeting.endTimeMilitary);
        const hasValidTimes = startMinutes !== null && endMinutes !== null;
        const isSunday = day === 'U';

        if (meetingOnline || isSunday || !hasValidDay || !hasValidTimes) {
          const detailParts = [
            meetingOnline ? 'Online' : null,
            isSunday ? 'Sunday meeting' : null,
            hasValidTimes ? buildMeetingLabel(meeting) : 'TBA',
          ].filter(Boolean);
          const locationParts = [meeting.building, meeting.room].filter(Boolean);
          const detail = locationParts.length > 0 ? `${detailParts.join(' – ')} – ${locationParts.join(' ')}` : detailParts.join(' – ');

          nextSidebar.push({
            key: `side-${section.indexNumber}-${day || 'tba'}-${index}`,
            label: courseLabel,
            subtitle: title,
            detail,
            muted: meetingOnline,
            isClosed,
            indexNumber: section.indexNumber,
          });
          return;
        }

        const startOffset = startMinutes - START_HOUR * 60;
        const endOffset = endMinutes - START_HOUR * 60;
        const startSlotRaw = startOffset / SLOT_MINUTES;
        const endSlotRaw = endOffset / SLOT_MINUTES;
        const overflowTop = startOffset < 0;
        const overflowBottom = endOffset > (END_HOUR - START_HOUR) * 60;

        const startSlot = clamp(Math.floor(startSlotRaw), 0, TOTAL_SLOTS);
        const endSlot = clamp(Math.ceil(endSlotRaw), 0, TOTAL_SLOTS);

        if (endSlot <= startSlot) return;

        const rowStart = 2 + startSlot;
        const rowEnd = 2 + endSlot;
        const column = 2 + dayIndex;
        const location = [meeting.building, meeting.room].filter(Boolean).join(' ');
        const timeLabel = buildMeetingLabel(meeting);
        const tooltip = `${courseLabel}${sectionLabel ? ` (${sectionLabel})` : ''} – ${timeLabel}`;

        nextBlocks.push({
          key: `${section.indexNumber}-${day}-${meeting.startTimeMilitary || index}`,
          column,
          rowStart,
          rowEnd,
          overflowTop,
          overflowBottom,
          label: `${courseLabel}${section.sectionNumber ? `-${section.sectionNumber}` : ''}`,
          subtitle: location || meeting.campus || 'TBA location',
          meta: instructor || title,
          color: resolveCampusColor(meeting.campus, meetingOnline),
          tooltip,
          isClosed,
          indexNumber: section.indexNumber,
          courseTitle: title,
          instructors: instructor,
        });
      });
    });

    return { blocks: nextBlocks, sidebarItems: nextSidebar };
  }, [schedule]);

  const timeSlots = React.useMemo(() => {
    return Array.from({ length: TOTAL_SLOTS }, (_, index) => {
      const minutesFromStart = index * SLOT_MINUTES;
      const totalMinutes = START_HOUR * 60 + minutesFromStart;
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;
      return {
        key: `slot-${index}`,
        label: minute === 0 ? formatHourLabel(hour) : '',
      };
    });
  }, []);

  return (
    <section className="w-full">
      <div className="rounded-xl border border-border bg-surface-2 shadow-elev-1">
        {/* -------- Toolbar -------- */}
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            {/* Left: Schedule name (inline-editable) + schedule picker + credit pill */}
            <div className="flex items-center gap-2 min-w-0">
              {/* Schedule picker dropdown */}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground transition hover:bg-surface-1"
                    title="Switch schedule"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="opacity-60">
                      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="z-50 min-w-[200px] rounded-xl border border-border bg-surface-2 p-1 shadow-elev-2 animate-fade-up"
                    sideOffset={4}
                    align="start"
                  >
                    {sortedSchedules.map((entry) => (
                      <DropdownMenu.Item
                        key={entry.id}
                        className={`flex cursor-pointer items-center rounded-lg px-3 py-2 text-sm outline-none transition hover:bg-surface-1 ${entry.id === activeScheduleId ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                        onSelect={() => handleScheduleSelect(entry.id)}
                      >
                        {entry.id === activeScheduleId && (
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="mr-2 text-action">
                            <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {entry.name}
                      </DropdownMenu.Item>
                    ))}
                    {sortedSchedules.length === 0 && (
                      <DropdownMenu.Item className="px-3 py-2 text-sm text-muted-foreground" disabled>
                        No schedules
                      </DropdownMenu.Item>
                    )}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>

              {/* Editable schedule name */}
              {isEditingName ? (
                <input
                  value={scheduleName}
                  onChange={(event) => setScheduleName(event.target.value)}
                  onBlur={() => {
                    setIsEditingName(false);
                    commitScheduleName();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                    if (event.key === 'Escape') {
                      setScheduleName(activeEntry?.name ?? '');
                      setIsEditingName(false);
                    }
                  }}
                  autoFocus
                  className="h-8 min-w-[120px] max-w-[260px] rounded-lg border border-action bg-surface-1 px-2 text-sm font-semibold text-foreground outline-none ring-2 ring-action/30"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingName(true)}
                  className="truncate text-sm font-semibold text-foreground transition hover:text-action/80"
                  title="Click to rename"
                >
                  {scheduleName || 'Untitled'}
                </button>
              )}

              {/* Term / campus label */}
              <span className="hidden text-xs text-muted-foreground sm:inline">
                · Spring {schedule.termYear} – {schedule.campus}
              </span>

              {/* Credit total pill */}
              {totalCredits > 0 && (
                <span className="rounded-full bg-action/10 px-2 py-0.5 text-xs font-semibold text-action">
                  {totalCredits} cr
                </span>
              )}
            </div>

            {/* Right: Save + overflow menu + status */}
            <div className="flex items-center gap-2">
              <span className={`hidden text-[11px] font-semibold uppercase tracking-wider sm:inline ${scheduleStatusTone}`}>
                {scheduleStatusLabel}
              </span>

              <button
                type="button"
                onClick={() => void syncActiveSchedule()}
                disabled={!isLoggedIn || !activeEntry || syncState === 'saving'}
                className="h-8 rounded-full bg-action px-4 text-xs font-semibold text-action-foreground shadow-action-glow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {syncState === 'saving' ? 'Saving…' : 'Save'}
              </button>

              {/* Overflow menu: New, Duplicate, Delete */}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground transition hover:bg-surface-1"
                    title="More actions"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <circle cx="8" cy="3" r="1.2" />
                      <circle cx="8" cy="8" r="1.2" />
                      <circle cx="8" cy="13" r="1.2" />
                    </svg>
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="z-50 min-w-[160px] rounded-xl border border-border bg-surface-2 p-1 shadow-elev-2 animate-fade-up"
                    sideOffset={4}
                    align="end"
                  >
                    <DropdownMenu.Item
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground outline-none transition hover:bg-surface-1"
                      onSelect={handleCreateSchedule}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <line x1="8" y1="3" x2="8" y2="13" />
                        <line x1="3" y1="8" x2="13" y2="8" />
                      </svg>
                      New schedule
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground outline-none transition hover:bg-surface-1"
                      disabled={!activeEntry}
                      onSelect={handleDuplicateSchedule}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="5" width="8" height="8" rx="1.5" />
                        <path d="M3 11V3.5A.5.5 0 013.5 3H11" />
                      </svg>
                      Duplicate
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-border" />
                    <DropdownMenu.Item
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive outline-none transition hover:bg-destructive/10"
                      disabled={!activeEntry}
                      onSelect={() => setDeleteDialogOpen(true)}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 5h10M5.5 5V3.5a1 1 0 011-1h3a1 1 0 011 1V5M6.5 7.5v4M9.5 7.5v4" />
                        <path d="M4 5l.7 8.4a1 1 0 001 .9h4.6a1 1 0 001-.9L12 5" />
                      </svg>
                      Delete
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </div>

          {/* Campus color legend — only shown when schedule has sections */}
          {usedCampusColors.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {usedCampusColors.map((key) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: campusColors[key] }}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {campusLabels[key] || key}
                  </span>
                </div>
              ))}
            </div>
          )}

          {syncError && (
            <div className="mt-2 text-xs font-medium text-red-500">{syncError}</div>
          )}
        </div>

        {/* -------- Grid + Sidebar -------- */}
        <div className="flex flex-col lg:flex-row">
          <div className="flex-1 overflow-x-auto">
            <div className="min-w-[860px] p-4">
              <div
                className="relative grid rounded-lg border border-border bg-surface-1"
                style={{
                  gridTemplateColumns: '72px repeat(6, minmax(0, 1fr))',
                  gridTemplateRows: `40px repeat(${TOTAL_SLOTS}, 28px)`,
                }}
              >
                <div className="col-start-1 row-start-1 flex items-center justify-center border-b border-r border-border text-xs font-medium text-muted-foreground">
                  Time
                </div>

                {DAY_LABELS.map((label, index) => (
                  <div
                    key={label}
                    className="row-start-1 flex items-center justify-center border-b border-r border-border text-xs font-semibold text-foreground"
                    style={{ gridColumnStart: index + 2 }}
                  >
                    {label}
                  </div>
                ))}

                {timeSlots.map((slot, rowIndex) => (
                  <div
                    key={slot.key}
                    className="col-start-1 flex items-start justify-center border-b border-r border-border text-[11px] text-muted-foreground"
                    style={{ gridRowStart: rowIndex + 2 }}
                  >
                    {slot.label}
                  </div>
                ))}

                {DAY_LABELS.map((_, dayIndex) =>
                  timeSlots.map((slot, rowIndex) => (
                    <div
                      key={`${dayIndex}-${slot.key}`}
                      className="border-b border-r border-border bg-surface-1"
                      style={{ gridColumnStart: dayIndex + 2, gridRowStart: rowIndex + 2 }}
                    />
                  )),
                )}

                {blocks.map((block) => (
                  <div
                    key={block.key}
                    title={block.tooltip}
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setSelectedBlock({
                        block,
                        anchor: { x: rect.right + 8, y: rect.top },
                      });
                    }}
                    className="relative z-10 mx-1 my-[2px] flex cursor-pointer flex-col gap-0.5 overflow-hidden rounded-lg px-2 py-1 text-[11px] text-white shadow-elev-1 ring-1 ring-white/10 transition hover:scale-[1.02] hover:ring-2 hover:ring-white/25 active:scale-[0.98]"
                    style={{
                      gridColumnStart: block.column,
                      gridRowStart: block.rowStart,
                      gridRowEnd: block.rowEnd,
                      backgroundColor: block.color,
                    }}
                  >
                    {block.isClosed && (
                      <span className="absolute right-1 top-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-red-600">
                        FULL
                      </span>
                    )}
                    {block.overflowTop && (
                      <span className="absolute left-0 right-0 top-0 h-2 bg-white/30" />
                    )}
                    {block.overflowBottom && (
                      <span className="absolute bottom-0 left-0 right-0 h-2 bg-white/30" />
                    )}
                    <span className="font-semibold leading-tight">{block.label}</span>
                    <span className="leading-tight text-white/90">{block.subtitle}</span>
                    {block.meta && (
                      <span className="truncate leading-tight text-white/80">{block.meta}</span>
                    )}
                  </div>
                ))}

                {blocks.length === 0 && (
                  <div className="col-start-2 col-end-[-1] row-start-2 row-end-[-1] flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                      <line x1="9" y1="4" x2="9" y2="10" />
                      <line x1="15" y1="4" x2="15" y2="10" />
                    </svg>
                    <span>Your schedule is empty.</span>
                    <span className="text-xs">Ask the assistant to search for courses to get started.</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* -------- Online + Sunday sidebar -------- */}
          <aside
            className={`border-t border-border bg-surface-1/80 transition-all lg:border-l lg:border-t-0 ${sidebarOpen ? 'w-full lg:w-72' : 'w-full lg:w-10'}`}
          >
            <div className="p-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-sm transition hover:bg-surface-2"
              >
                {sidebarOpen && (
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-xs font-semibold text-foreground">Online + Sunday</h3>
                    <span className="text-[11px] text-muted-foreground">
                      {sidebarItems.length > 0 ? `${sidebarItems.length} items` : ''}
                    </span>
                  </div>
                )}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`text-muted-foreground transition-transform ${sidebarOpen ? '' : 'rotate-180'}`}
                >
                  <path d="M10 4l-4 4 4 4" />
                </svg>
              </button>

              {sidebarOpen && (
                <div className="mt-2 space-y-2">
                  {sidebarItems.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-surface-2 px-3 py-3 text-xs text-muted-foreground">
                      No online or Sunday meetings yet.
                    </div>
                  ) : (
                    sidebarItems.map((item) => (
                      <div
                        key={item.key}
                        className="group rounded-lg border border-border bg-surface-2 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                            <span>{item.label}</span>
                            {item.isClosed && (
                              <span className="rounded-full border border-red-400/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-200">
                                FULL
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveSection(item.indexNumber)}
                            className="rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                            title="Remove section"
                          >
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <line x1="4" y1="4" x2="12" y2="12" />
                              <line x1="12" y1="4" x2="4" y2="12" />
                            </svg>
                          </button>
                        </div>
                        {item.subtitle && (
                          <div className="text-[11px] text-muted-foreground">{item.subtitle}</div>
                        )}
                        <div
                          className={
                            item.muted
                              ? 'text-[11px] text-muted-foreground'
                              : 'text-[11px] text-foreground'
                          }
                        >
                          {item.detail}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Block popover */}
      {selectedBlock && (
        <BlockPopover
          block={selectedBlock.block}
          anchor={selectedBlock.anchor}
          onClose={() => setSelectedBlock(null)}
          onRemove={handleRemoveSection}
        />
      )}

      {/* Delete dialog */}
      <DeleteDialog
        open={deleteDialogOpen}
        name={activeEntry?.name ?? ''}
        onConfirm={() => void handleDeleteSchedule()}
        onCancel={() => setDeleteDialogOpen(false)}
      />
    </section>
  );
};
