'use client';

import React from 'react';
import {
  useRegisterState,
  useSubscribeStateToAgentContext,
  useThreadController,
} from 'cedar-os';
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  MoreHorizontal,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { supabaseClient } from '@/lib/supabaseClient';
import {
  DEFAULT_SCHEDULE,
  SCHEDULE_UPDATED_EVENT,
  createSchedule,
  deleteSchedule,
  discardTemporarySchedule,
  duplicateSchedule,
  getActiveScheduleEntry,
  getCurrentSemesterScheduleEntry,
  getCurrentSemesterTerm,
  getScheduleSyncStatus,
  listSchedules,
  listTemporarySchedules,
  promoteTemporaryToSaved,
  renameSchedule,
  removeSectionFromSchedule,
  removeSectionFromScheduleById,
  resolveTermLabel,
  saveSchedule,
  setActiveScheduleId,
  type MeetingTime,
  type ScheduleEntry,
  type ScheduleSnapshot,
} from '@/lib/scheduleStorage';
import {
  buildActiveScheduleAgentContext,
  type ActiveScheduleSyncStatus,
} from '@/lib/scheduleAgentContext';
import {
  deleteRemoteSchedule,
  hydrateFromRemote,
  upsertRemoteSchedule,
} from '@/lib/scheduleSync';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { ScheduleBuilderDialog } from './ScheduleBuilderDialog';

const START_HOUR = 8;
const END_HOUR = 22;
const SLOT_MINUTES = 30;
const TOTAL_SLOTS = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES;

const DAY_ORDER = ['M', 'T', 'W', 'H', 'F', 'S'] as const;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TERM_SEQUENCE = [
  { termCode: '0', termLabel: 'Winter' },
  { termCode: '1', termLabel: 'Spring' },
  { termCode: '7', termLabel: 'Summer' },
  { termCode: '9', termLabel: 'Fall' },
] as const;

type ScheduleTermOption = {
  value: string;
  termYear: number;
  termCode: string;
  label: string;
};

const buildUpcomingTermOptions = (count = 8): ScheduleTermOption[] => {
  const currentTerm = getCurrentSemesterTerm();
  const startIndex = TERM_SEQUENCE.findIndex(
    (term) => term.termCode === currentTerm.termCode,
  );
  const normalizedStartIndex = startIndex >= 0 ? startIndex : 1;

  return Array.from({ length: count }, (_, offset) => {
    const sequencePosition = normalizedStartIndex + offset;
    const term = TERM_SEQUENCE[sequencePosition % TERM_SEQUENCE.length];
    const termYear = currentTerm.termYear + Math.floor(sequencePosition / TERM_SEQUENCE.length);
    const label = `${term.termLabel} ${termYear}`;

    return {
      value: `${termYear}-${term.termCode}`,
      termYear,
      termCode: term.termCode,
      label,
    };
  });
};

type GridBlock = {
  key: string;
  column: number;
  rowStart: number;
  rowEnd: number;
  overflowTop: boolean;
  overflowBottom: boolean;
  label: string;
  visibleLabel: string;
  subtitle: string;
  meta: string;
  color: string;
  tooltip: string;
  isClosed: boolean;
  indexNumber: string;
  courseTitle: string;
  instructors: string;
  timeLabel: string;
};

type SidebarItem = {
  key: string;
  label: string;
  subtitle?: string;
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
      <p className="mt-1 text-xs font-medium text-foreground/80">{block.timeLabel}</p>
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
/*  New Schedule Dialog                                                */
/* ------------------------------------------------------------------ */

function NewScheduleDialog({
  open,
  isCreating,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  isCreating: boolean;
  onConfirm: (term: ScheduleTermOption) => void;
  onCancel: () => void;
}) {
  const termOptions = React.useMemo(() => buildUpcomingTermOptions(), []);
  const [selectedTermValue, setSelectedTermValue] = React.useState(
    termOptions[0]?.value ?? '',
  );

  React.useEffect(() => {
    if (open) {
      setSelectedTermValue(termOptions[0]?.value ?? '');
    }
  }, [open, termOptions]);

  const selectedTerm = termOptions.find((term) => term.value === selectedTermValue);

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface-2 p-6 shadow-elev-2 animate-fade-up">
          <Dialog.Title className="text-base font-semibold text-foreground">
            New schedule
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Choose the semester this schedule is for before adding courses.
          </Dialog.Description>
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (selectedTerm) onConfirm(selectedTerm);
            }}
          >
            <label className="block text-xs font-semibold text-foreground">
              Semester
              <select
                value={selectedTermValue}
                onChange={(event) => setSelectedTermValue(event.target.value)}
                disabled={isCreating}
                autoFocus
                className="mt-2 h-10 w-full rounded-lg border border-border bg-surface-1 px-3 text-sm font-medium text-foreground outline-none transition focus:border-action focus:ring-2 focus:ring-action/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {termOptions.map((term) => (
                  <option key={term.value} value={term.value}>
                    {term.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={isCreating}
                className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating || !selectedTerm}
                className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              >
                {isCreating ? 'Creating...' : 'Create schedule'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------------ */
/*  Guest Schedule Import Dialog                                       */
/* ------------------------------------------------------------------ */

function GuestImportDialog({
  open,
  name,
  sectionCount,
  isSaving,
  onNameChange,
  onConfirm,
  onSkip,
}: {
  open: boolean;
  name: string;
  sectionCount: number;
  isSaving: boolean;
  onNameChange: (name: string) => void;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onSkip()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface-2 p-6 shadow-elev-2 animate-fade-up">
          <Dialog.Title className="text-base font-semibold text-foreground">
            Save your guest schedule?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            You added {sectionCount} {sectionCount === 1 ? 'course' : 'courses'} before signing in. Save this schedule to your account?
          </Dialog.Description>
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            <label className="block text-xs font-semibold text-foreground">
              Schedule name
              <input
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                disabled={isSaving}
                autoFocus
                className="mt-2 h-10 w-full rounded-lg border border-border bg-surface-1 px-3 text-sm font-medium text-foreground outline-none transition focus:border-action focus:ring-2 focus:ring-action/30 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onSkip}
                disabled={isSaving}
                className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Don&apos;t save
              </button>
              <button
                type="submit"
                disabled={isSaving || name.trim().length === 0}
                className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              >
                {isSaving ? 'Saving...' : 'Save schedule'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------------ */
/*  Save Temporary Schedule Dialog                                     */
/* ------------------------------------------------------------------ */

function SaveTempScheduleDialog({
  open,
  defaultName,
  sectionCount,
  isSaving,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  defaultName: string;
  sectionCount: number;
  isSaving: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(defaultName);
  React.useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface-2 p-6 shadow-elev-2 animate-fade-up">
          <Dialog.Title className="text-base font-semibold text-foreground">
            Save schedule option
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Save this option as a regular schedule with {sectionCount}{' '}
            {sectionCount === 1 ? 'course' : 'courses'}. It will appear in your schedules
            dropdown.
          </Dialog.Description>
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim().length > 0) onConfirm(name.trim());
            }}
          >
            <label className="block text-xs font-semibold text-foreground">
              Schedule name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isSaving}
                autoFocus
                className="mt-2 h-10 w-full rounded-lg border border-border bg-surface-1 px-3 text-sm font-medium text-foreground outline-none transition focus:border-action focus:ring-2 focus:ring-action/30 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={isSaving}
                className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || name.trim().length === 0}
                className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              >
                {isSaving ? 'Saving...' : 'Save schedule'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------------ */
/*  Main ScheduleGrid Component                                        */
/* ------------------------------------------------------------------ */

type GuestImportCandidate = {
  entry: ScheduleEntry;
  sectionCount: number;
};

const cloneScheduleEntry = (entry: ScheduleEntry): ScheduleEntry => ({
  ...entry,
  snapshot: {
    ...entry.snapshot,
    sections: [...entry.snapshot.sections],
  },
});

/* ------------------------------------------------------------------ */
/*  Save status control — adapts presentation to current sync state    */
/* ------------------------------------------------------------------ */

type SaveStatus = 'signed-out' | 'loading' | 'saving' | 'error' | 'dirty' | 'saved';

function SaveStatusControl({
  status,
  onSave,
  disabled,
}: {
  status: SaveStatus;
  onSave: () => void;
  disabled?: boolean;
}) {
  if (status === 'signed-out') {
    return (
      <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
        Sign in to sync
      </span>
    );
  }

  if (status === 'loading') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading
      </span>
    );
  }

  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    );
  }

  if (status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-success/30 bg-success/5 px-2.5 py-1 text-xs font-medium text-success">
        <Check className="h-3 w-3" strokeWidth={2.5} />
        Saved
      </span>
    );
  }

  if (status === 'error') {
    return (
      <button
        type="button"
        onClick={onSave}
        disabled={disabled}
        className="focus-ring inline-flex h-7 items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 text-xs font-semibold text-destructive transition hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Retry save
      </button>
    );
  }

  // dirty
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={disabled}
      className="focus-ring inline-flex h-7 items-center gap-1.5 rounded-md border border-action/40 bg-action/10 px-2.5 text-xs font-semibold text-action transition hover:bg-action/15 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-action" />
      Save
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty state — shown when the grid has no scheduled blocks          */
/* ------------------------------------------------------------------ */

function ScheduleEmptyState({
  onOpenBuilder,
}: {
  onOpenBuilder: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
      <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent/10 text-accent">
        <CalendarDays className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Plan your week
      </h2>
      <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
        Tell SOCAgent your preferences and it&apos;ll draft a full schedule —
        or skip the form and let it pick smart defaults.
      </p>
      <button
        type="button"
        onClick={onOpenBuilder}
        className="focus-ring mt-5 inline-flex h-10 items-center gap-1.5 rounded-full bg-action px-5 text-sm font-semibold text-action-foreground shadow-elev-1 transition hover:opacity-95 active:scale-[0.98]"
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} />
        Open Schedule Builder
      </button>
      <p className="mt-3 text-xs text-muted-foreground">
        Or ask SOCAgent directly to add a course or index number.
      </p>
    </div>
  );
}

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
  const [newScheduleDialogOpen, setNewScheduleDialogOpen] = React.useState(false);
  const [isCreatingSchedule, setIsCreatingSchedule] = React.useState(false);
  const [isBuilderOpen, setIsBuilderOpen] = React.useState(false);
  const [selectedBlock, setSelectedBlock] = React.useState<{
    block: GridBlock;
    anchor: { x: number; y: number };
  } | null>(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [guestImportCandidate, setGuestImportCandidate] = React.useState<GuestImportCandidate | null>(null);
  const [guestImportName, setGuestImportName] = React.useState('');
  const [isImportingGuestSchedule, setIsImportingGuestSchedule] = React.useState(false);
  const [blockedAutoSyncScheduleIds, setBlockedAutoSyncScheduleIds] = React.useState<Set<string>>(() => new Set());
  const guestScheduleBeforeLoginRef = React.useRef<ScheduleEntry | null>(null);

  const { currentThreadId } = useThreadController();
  const [temporarySchedules, setTemporarySchedules] = React.useState<ScheduleEntry[]>([]);
  const [previewScheduleId, setPreviewScheduleId] = React.useState<string | null>(null);
  const [saveTempDialogOpen, setSaveTempDialogOpen] = React.useState(false);
  const [isSavingTemp, setIsSavingTemp] = React.useState(false);

  const refreshWorkspace = React.useCallback(() => {
    const activeEntry = getActiveScheduleEntry();
    setSchedule(activeEntry.snapshot);
    setSchedules(listSchedules());
    setActiveScheduleIdState(activeEntry.id);
  }, []);

  const loadCurrentSemesterWorkspace = React.useCallback((
    excludeScheduleIds: string[] = [],
    options: { createIfMissing?: boolean } = {},
  ) => {
    const currentEntry = getCurrentSemesterScheduleEntry('NB', {
      excludeScheduleIds,
      createIfMissing: options.createIfMissing,
    });
    setSchedule(currentEntry.snapshot);
    setSchedules(listSchedules());
    setActiveScheduleIdState(currentEntry.id);
  }, []);

  React.useEffect(() => {
    loadCurrentSemesterWorkspace();
    setIsLoaded(true);
  }, [loadCurrentSemesterWorkspace]);

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

  const refreshTemporarySchedules = React.useCallback(() => {
    if (!currentThreadId) {
      setTemporarySchedules([]);
      return;
    }
    setTemporarySchedules(listTemporarySchedules(currentThreadId));
  }, [currentThreadId]);

  React.useEffect(() => {
    refreshTemporarySchedules();
  }, [refreshTemporarySchedules]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleUpdate = () => refreshTemporarySchedules();
    window.addEventListener(SCHEDULE_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(SCHEDULE_UPDATED_EVENT, handleUpdate);
  }, [refreshTemporarySchedules]);

  // Reset preview when the thread changes.
  React.useEffect(() => {
    setPreviewScheduleId(null);
  }, [currentThreadId]);

  // Auto-select the first temp schedule for this thread; clear preview if it disappears.
  React.useEffect(() => {
    if (temporarySchedules.length === 0) {
      if (previewScheduleId !== null) setPreviewScheduleId(null);
      return;
    }
    const stillExists = previewScheduleId
      ? temporarySchedules.some((entry) => entry.id === previewScheduleId)
      : false;
    if (!stillExists) {
      setPreviewScheduleId(temporarySchedules[0].id);
    }
  }, [temporarySchedules, previewScheduleId]);

  const previewEntry = React.useMemo(
    () => temporarySchedules.find((entry) => entry.id === previewScheduleId) ?? null,
    [temporarySchedules, previewScheduleId],
  );
  const isPreviewMode = Boolean(previewEntry);
  const previewIndex = previewEntry
    ? temporarySchedules.findIndex((entry) => entry.id === previewEntry.id)
    : -1;

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
    const guestEntry = guestScheduleBeforeLoginRef.current;
    hydrateFromRemote()
      .then(() => {
        if (guestEntry && !guestEntry.lastSyncedAt) {
          setBlockedAutoSyncScheduleIds((current) => new Set(current).add(guestEntry.id));

          if (guestEntry.snapshot.sections.length > 0) {
            loadCurrentSemesterWorkspace([guestEntry.id], { createIfMissing: false });
            setGuestImportCandidate({
              entry: guestEntry,
              sectionCount: guestEntry.snapshot.sections.length,
            });
            setGuestImportName(guestEntry.name);
            return;
          }

          if (listSchedules().length > 1) {
            deleteSchedule(guestEntry.id);
            setBlockedAutoSyncScheduleIds((current) => {
              const next = new Set(current);
              next.delete(guestEntry.id);
              return next;
            });
            loadCurrentSemesterWorkspace([guestEntry.id], { createIfMissing: false });
            return;
          }
        }

        loadCurrentSemesterWorkspace();
      })
      .catch((error) => {
        console.error('Failed to load saved schedules', error);
        setSyncError('Could not load saved schedules.');
      })
      .finally(() => {
        guestScheduleBeforeLoginRef.current = null;
        setIsHydrating(false);
      });
  }, [userId, loadCurrentSemesterWorkspace]);

  const activeEntry = React.useMemo(
    () => schedules.find((entry) => entry.id === activeScheduleId) ?? null,
    [schedules, activeScheduleId],
  );

  React.useEffect(() => {
    if (userId || !activeEntry) return;
    guestScheduleBeforeLoginRef.current = cloneScheduleEntry(activeEntry);
  }, [activeEntry, userId]);

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
      setBlockedAutoSyncScheduleIds((current) => {
        if (!current.has(activeEntry.id)) return current;
        const next = new Set(current);
        next.delete(activeEntry.id);
        return next;
      });
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
    if (!activeEntry.lastSyncedAt && activeEntry.snapshot.sections.length === 0) return;
    if (blockedAutoSyncScheduleIds.has(activeEntry.id)) return;
    const timer = window.setTimeout(() => {
      void syncActiveSchedule();
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [
    activeEntry,
    blockedAutoSyncScheduleIds,
    isLoggedIn,
    isHydrating,
    syncState,
    syncStatus,
    syncActiveSchedule,
  ]);

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

  const handleOpenCreateScheduleDialog = React.useCallback(() => {
    setNewScheduleDialogOpen(true);
  }, []);

  const handleCreateSchedule = React.useCallback((term: ScheduleTermOption) => {
    setIsCreatingSchedule(true);
    createSchedule({
      setActive: true,
      snapshot: {
        version: 1,
        termYear: term.termYear,
        termCode: term.termCode,
        campus: 'NB',
        lastUpdated: new Date().toISOString(),
        sections: [],
      },
    });
    setNewScheduleDialogOpen(false);
    setIsCreatingSchedule(false);
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

  const handleSkipGuestImport = React.useCallback(() => {
    if (isImportingGuestSchedule) return;
    const skippedScheduleId = guestImportCandidate?.entry.id;
    setGuestImportCandidate(null);
    setGuestImportName('');

    if (skippedScheduleId) {
      setBlockedAutoSyncScheduleIds((current) => new Set(current).add(skippedScheduleId));
      loadCurrentSemesterWorkspace([skippedScheduleId], { createIfMissing: false });
    }
  }, [guestImportCandidate, isImportingGuestSchedule, loadCurrentSemesterWorkspace]);

  const handleConfirmGuestImport = React.useCallback(async () => {
    if (!guestImportCandidate || !userId) return;
    const trimmedName = guestImportName.trim();
    if (!trimmedName) return;

    const entryToImport = {
      ...guestImportCandidate.entry,
      name: trimmedName,
      updatedAt: new Date().toISOString(),
    };

    try {
      setIsImportingGuestSchedule(true);
      setSyncState('saving');
      const renamed = renameSchedule(entryToImport.id, trimmedName);
      if (!renamed) {
        throw new Error('Guest schedule no longer exists locally.');
      }
      setActiveScheduleId(entryToImport.id);
      await upsertRemoteSchedule(entryToImport, userId);
      setBlockedAutoSyncScheduleIds((current) => {
        const next = new Set(current);
        next.delete(entryToImport.id);
        return next;
      });
      setGuestImportCandidate(null);
      setGuestImportName('');
      setSyncError(null);
      setSyncState('idle');
      refreshWorkspace();
    } catch (error) {
      console.error('Failed to import guest schedule', error);
      setSyncState('error');
      setSyncError('Could not save guest schedule.');
    } finally {
      setIsImportingGuestSchedule(false);
    }
  }, [guestImportCandidate, guestImportName, refreshWorkspace, userId]);

  const handleRemoveSection = React.useCallback(
    (indexNumber: string) => {
      if (previewEntry) {
        removeSectionFromScheduleById(previewEntry.id, indexNumber);
        setSelectedBlock(null);
        return;
      }
      const result = removeSectionFromSchedule(schedule, indexNumber);
      saveSchedule(result.schedule);
      setSchedule(result.schedule);
      setSelectedBlock(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SCHEDULE_UPDATED_EVENT));
      }
    },
    [schedule, previewEntry],
  );

  const handlePreviewPrev = React.useCallback(() => {
    if (temporarySchedules.length === 0) return;
    const currentIndex = previewEntry
      ? temporarySchedules.findIndex((entry) => entry.id === previewEntry.id)
      : -1;
    const prevIndex =
      currentIndex <= 0 ? temporarySchedules.length - 1 : currentIndex - 1;
    setPreviewScheduleId(temporarySchedules[prevIndex].id);
  }, [temporarySchedules, previewEntry]);

  const handlePreviewNext = React.useCallback(() => {
    if (temporarySchedules.length === 0) return;
    const currentIndex = previewEntry
      ? temporarySchedules.findIndex((entry) => entry.id === previewEntry.id)
      : -1;
    const nextIndex =
      currentIndex < 0 || currentIndex >= temporarySchedules.length - 1
        ? 0
        : currentIndex + 1;
    setPreviewScheduleId(temporarySchedules[nextIndex].id);
  }, [temporarySchedules, previewEntry]);

  const handleDiscardPreview = React.useCallback(() => {
    if (!previewEntry) return;
    discardTemporarySchedule(previewEntry.id);
  }, [previewEntry]);

  const handleConfirmSaveTemp = React.useCallback(
    async (name: string) => {
      if (!previewEntry) return;
      try {
        setIsSavingTemp(true);
        const promoted = promoteTemporaryToSaved(previewEntry.id, name);
        if (!promoted) {
          throw new Error('Could not save schedule.');
        }
        setPreviewScheduleId(null);
        setSaveTempDialogOpen(false);
        setActiveScheduleId(promoted.id);
        if (isLoggedIn && userId) {
          try {
            setSyncState('saving');
            await upsertRemoteSchedule(promoted, userId);
            setSyncState('idle');
            setSyncError(null);
          } catch (error) {
            console.error('Failed to sync promoted schedule', error);
            setSyncState('error');
            setSyncError('Sync failed. Try again.');
          }
        }
      } finally {
        setIsSavingTemp(false);
      }
    },
    [previewEntry, isLoggedIn, userId],
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

  const sortedSchedules = React.useMemo(() => {
    return [...schedules].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [schedules]);

  const displaySchedule: ScheduleSnapshot = React.useMemo(
    () => (previewEntry ? previewEntry.snapshot : schedule),
    [previewEntry, schedule],
  );

  // ----- Compute total credits -----
  const totalCredits = React.useMemo(() => {
    return schedule.sections.reduce((sum, s) => sum + (s.credits ?? 0), 0);
  }, [schedule]);

  const previewTotalCredits = React.useMemo(() => {
    if (!previewEntry) return 0;
    return previewEntry.snapshot.sections.reduce(
      (sum, section) => sum + (section.credits ?? 0),
      0,
    );
  }, [previewEntry]);

  const activeScheduleSyncStatus: ActiveScheduleSyncStatus = !isLoaded || isHydrating
    ? 'loading'
    : !isLoggedIn
      ? 'signed_out'
      : syncState === 'saving'
        ? 'saving'
        : syncState === 'error' || syncError
          ? 'error'
          : syncStatus === 'saved'
            ? 'saved'
            : 'dirty';

  // ----- Compute used campus colors (for legend) -----
  const usedCampusColors = React.useMemo(() => {
    const seen = new Set<string>();
    displaySchedule.sections.forEach((section) => {
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
  }, [displaySchedule]);

  const { blocks, sidebarItems } = React.useMemo(() => {
    const nextBlocks: GridBlock[] = [];
    const nextSidebar: SidebarItem[] = [];

    displaySchedule.sections.forEach((section) => {
      const meetings = section.meetingTimes || [];
      const courseLabel = section.courseString || 'Course';
      const title = section.courseTitle || '';
      const visibleCourseLabel = title || courseLabel;
      const sectionLabel = section.sectionNumber ? `Sec ${section.sectionNumber}` : '';
      const instructor = section.instructors && section.instructors.length > 0 ? section.instructors[0] : '';
      const sectionOnline = Boolean(section.isOnline && meetings.length === 0);
      const isClosed = section.isOpen === false;

      if (meetings.length === 0) {
        if (sectionOnline) {
          nextSidebar.push({
            key: `online-${section.indexNumber}`,
            label: visibleCourseLabel,
            detail: 'Online or async',
            isClosed,
            indexNumber: section.indexNumber,
          });
        }
        return;
      }

      meetings.forEach((meeting, index) => {
        const day = meeting.day ? meeting.day.toUpperCase() : '';
        const meetingOnline = Boolean(meeting.isOnline);
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
            label: visibleCourseLabel,
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
          visibleLabel: visibleCourseLabel,
          subtitle: location || meeting.campus || 'TBA location',
          meta: instructor,
          color: resolveCampusColor(meeting.campus, meetingOnline),
          tooltip,
          isClosed,
          indexNumber: section.indexNumber,
          courseTitle: title,
          instructors: instructor,
          timeLabel,
        });
      });
    });

    return { blocks: nextBlocks, sidebarItems: nextSidebar };
  }, [displaySchedule]);

  const activeScheduleAgentContext = React.useMemo(
    () =>
      buildActiveScheduleAgentContext({
        schedule,
        activeEntry,
        activeScheduleId,
        scheduleName,
        totalCredits,
        syncStatus: activeScheduleSyncStatus,
        temporarySchedules,
        previewScheduleId,
        threadId: currentThreadId,
      }),
    [
      activeEntry,
      activeScheduleId,
      activeScheduleSyncStatus,
      currentThreadId,
      previewScheduleId,
      schedule,
      scheduleName,
      temporarySchedules,
      totalCredits,
    ],
  );

  const ignoreActiveScheduleAgentContextUpdate = React.useCallback(() => {}, []);

  useRegisterState({
    key: 'activeSchedule',
    description: 'Current schedule shown in the week view',
    value: activeScheduleAgentContext,
    setValue: ignoreActiveScheduleAgentContextUpdate,
  });

  useSubscribeStateToAgentContext(
    'activeSchedule',
    (activeSchedule) => ({ activeSchedule }),
    {
      showInChat: false,
      color: '#16A34A',
    },
  );

  const timeSlots = React.useMemo(() => {
    return Array.from({ length: TOTAL_SLOTS }, (_, index) => {
      const minutesFromStart = index * SLOT_MINUTES;
      const totalMinutes = START_HOUR * 60 + minutesFromStart;
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;
      return {
        key: `slot-${index}`,
        label: minute === 0 ? formatHourLabel(hour) : '',
        showBottomBorder: (totalMinutes + SLOT_MINUTES) % 60 === 0,
      };
    });
  }, []);

  const isDirty = isLoggedIn && syncStatus !== 'saved' && !isHydrating;
  const isSaving = syncState === 'saving';
  const hasSyncIssue = Boolean(syncState === 'error' || syncError);

  const termSummary = `${resolveTermLabel(schedule.termCode)} ${schedule.termYear} · ${schedule.campus}`;

  return (
    <section className="h-full w-full">
      <div className="flex h-full flex-col overflow-hidden bg-surface-1">
        {/* -------- Toolbar -------- */}
        <div className="border-b border-border px-4 py-3 sm:px-5 sm:py-3.5">
          <div className="flex items-center justify-between gap-3">
            {/* Left: Schedule name (inline-editable) + schedule picker + credit pill */}
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {/* Combined title + schedule picker */}
              <div className="flex min-w-0 items-center gap-1 rounded-lg px-1 transition hover:bg-surface-2/60">
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
                    className="h-8 min-w-[140px] max-w-[260px] rounded-md border border-action bg-surface-1 px-2 text-sm font-semibold text-foreground outline-none ring-2 ring-action/30"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingName(true)}
                    className="focus-ring -mx-0.5 max-w-[260px] truncate rounded px-1 py-0.5 text-sm font-semibold tracking-tight text-foreground"
                    title="Click to rename"
                  >
                    {scheduleName || 'Untitled schedule'}
                  </button>
                )}

                <DropdownMenu.Root modal={false}>
                  <DropdownMenu.Trigger asChild>
                    <button
                      type="button"
                      className="focus-ring inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
                      title="Switch schedule"
                      aria-label="Switch schedule"
                    >
                      <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="z-50 min-w-[220px] rounded-xl border border-border bg-surface-2 p-1 shadow-elev-2 animate-fade-up"
                      sideOffset={6}
                      align="start"
                    >
                      <DropdownMenu.Label className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Your schedules
                      </DropdownMenu.Label>
                      {sortedSchedules.map((entry) => (
                        <DropdownMenu.Item
                          key={entry.id}
                          className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm outline-none transition hover:bg-surface-1 ${entry.id === activeScheduleId ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                          onSelect={() => handleScheduleSelect(entry.id)}
                        >
                          <span className="truncate">{entry.name}</span>
                          {entry.id === activeScheduleId && (
                            <Check className="h-3.5 w-3.5 flex-shrink-0 text-action" strokeWidth={2.5} />
                          )}
                        </DropdownMenu.Item>
                      ))}
                      {sortedSchedules.length === 0 && (
                        <DropdownMenu.Item className="px-3 py-2 text-sm text-muted-foreground" disabled>
                          No schedules
                        </DropdownMenu.Item>
                      )}
                      <DropdownMenu.Separator className="my-1 h-px bg-border" />
                      <DropdownMenu.Item
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground outline-none transition hover:bg-surface-1"
                        onSelect={handleOpenCreateScheduleDialog}
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                        New schedule
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>

              {/* Term + credit pills */}
              <span className="hidden text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:inline">
                {termSummary}
              </span>
              {totalCredits > 0 && (
                <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {totalCredits} cr
                </span>
              )}
            </div>

            {/* Right: Schedule Builder + Save / sync status + overflow menu */}
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setIsBuilderOpen(true)}
                className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-full border border-action/40 bg-action/10 px-3 text-xs font-semibold text-action transition hover:bg-action/20"
                title="Open Schedule Builder"
                aria-label="Open Schedule Builder"
              >
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} />
                <span className="hidden sm:inline">Schedule Builder</span>
                <span className="sm:hidden">Builder</span>
              </button>

              <SaveStatusControl
                status={
                  !isLoggedIn
                    ? 'signed-out'
                    : isHydrating
                      ? 'loading'
                      : isSaving
                        ? 'saving'
                        : hasSyncIssue
                          ? 'error'
                          : isDirty
                            ? 'dirty'
                            : 'saved'
                }
                onSave={() => void syncActiveSchedule()}
                disabled={!activeEntry || isSaving}
              />

              {/* Overflow menu: Duplicate, Delete */}
              <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="focus-ring flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
                    title="More actions"
                    aria-label="More actions"
                  >
                    <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="z-50 min-w-[180px] rounded-xl border border-border bg-surface-2 p-1 shadow-elev-2 animate-fade-up"
                    sideOffset={6}
                    align="end"
                  >
                    <DropdownMenu.Item
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground outline-none transition hover:bg-surface-1"
                      onSelect={handleOpenCreateScheduleDialog}
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                      New schedule
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground outline-none transition hover:bg-surface-1"
                      disabled={!activeEntry}
                      onSelect={handleDuplicateSchedule}
                    >
                      <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                      Duplicate
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-border" />
                    <DropdownMenu.Item
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive outline-none transition hover:bg-destructive/10"
                      disabled={!activeEntry}
                      onSelect={() => setDeleteDialogOpen(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      Delete
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </div>

          {/* Campus color legend — only shown when schedule has sections */}
          {usedCampusColors.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {usedCampusColors.map((key) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
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
            <div className="mt-2 text-xs font-medium text-destructive">{syncError}</div>
          )}
        </div>

        {/* -------- Temporary schedule navigator -------- */}
        {temporarySchedules.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-action/30 bg-action/5 px-4 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={handlePreviewPrev}
                disabled={temporarySchedules.length <= 1}
                className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border border-action/40 bg-surface-1 text-action transition hover:bg-action/10 disabled:cursor-not-allowed disabled:opacity-40"
                title="Previous option"
                aria-label="Previous schedule option"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
              </button>
              <div className="flex min-w-0 flex-col">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-action">
                  {previewEntry
                    ? `Option ${previewIndex + 1} of ${temporarySchedules.length}`
                    : `${temporarySchedules.length} schedule options`}
                </span>
                <span className="truncate text-xs text-foreground/85">
                  {previewEntry
                    ? previewEntry.temporary?.label || previewEntry.name
                    : 'Use the arrows to flip through schedule options'}
                </span>
              </div>
              <button
                type="button"
                onClick={handlePreviewNext}
                disabled={temporarySchedules.length <= 1}
                className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border border-action/40 bg-surface-1 text-action transition hover:bg-action/10 disabled:cursor-not-allowed disabled:opacity-40"
                title="Next option"
                aria-label="Next schedule option"
              >
                <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
              </button>
              {isPreviewMode && (
                <span className="flex-shrink-0 rounded-full border border-action/40 bg-action/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-action">
                  Preview · not saved
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {previewEntry && (
                <span className="hidden rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline">
                  {previewTotalCredits} cr
                </span>
              )}
              <button
                type="button"
                onClick={handleDiscardPreview}
                disabled={!previewEntry}
                className="focus-ring inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface-1 px-2.5 text-xs font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                title="Discard this option"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                Discard
              </button>
              <button
                type="button"
                onClick={() => setSaveTempDialogOpen(true)}
                disabled={!previewEntry}
                className="focus-ring inline-flex h-7 items-center gap-1 rounded-md bg-action px-2.5 text-xs font-semibold text-action-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                title="Save this option as a regular schedule"
              >
                <Save className="h-3.5 w-3.5" strokeWidth={2.25} />
                Save
              </button>
            </div>
          </div>
        )}

        {/* -------- Grid + Sidebar -------- */}
        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="min-w-[560px] p-3 sm:p-4">
              <div
                className={`relative grid overflow-hidden rounded-xl border bg-surface-0/40 shadow-elev-1 transition ${
                  isPreviewMode
                    ? 'border-action/50 ring-1 ring-action/30 ring-offset-2 ring-offset-surface-1'
                    : 'border-border'
                }`}
                style={{
                  gridTemplateColumns: '56px repeat(6, minmax(0, 1fr))',
                  gridTemplateRows: `36px repeat(${TOTAL_SLOTS}, 28px)`,
                }}
              >
                {/* Header: Time corner */}
                <div className="col-start-1 row-start-1 flex items-center justify-center border-b border-r border-border bg-surface-2/40 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Time
                </div>

                {/* Header: Day columns */}
                {DAY_LABELS.map((label, index) => {
                  const isWeekend = index === 5;
                  return (
                    <div
                      key={label}
                      className={`row-start-1 flex flex-col items-center justify-center gap-0 border-b border-border bg-surface-2/40 text-[10px] font-semibold uppercase tracking-wide ${isWeekend ? 'text-muted-foreground/70' : 'text-foreground'} ${index < 5 ? 'border-r' : ''}`}
                      style={{ gridColumnStart: index + 2 }}
                    >
                      {label}
                    </div>
                  );
                })}

                {/* Time labels column */}
                {timeSlots.map((slot, rowIndex) => (
                  <div
                    key={slot.key}
                    className={`col-start-1 flex items-start justify-end border-r border-border pr-2 pt-0.5 text-[10px] font-medium tabular-nums text-muted-foreground/80 ${slot.showBottomBorder ? 'border-b border-border/60' : ''}`}
                    style={{ gridRowStart: rowIndex + 2 }}
                  >
                    {slot.label}
                  </div>
                ))}

                {/* Empty grid cells with weekend tinting + alternating hour banding */}
                {DAY_LABELS.map((_, dayIndex) =>
                  timeSlots.map((slot, rowIndex) => {
                    const isWeekend = dayIndex === 5;
                    const totalMinutes = START_HOUR * 60 + rowIndex * SLOT_MINUTES;
                    const hourIndex = Math.floor(totalMinutes / 60);
                    const isOddHourBand = hourIndex % 2 === 1;
                    return (
                      <div
                        key={`${dayIndex}-${slot.key}`}
                        className={`${dayIndex < 5 ? 'border-r border-border' : ''} ${slot.showBottomBorder ? 'border-b border-border/60' : ''} ${isWeekend ? 'bg-surface-2/30' : isOddHourBand ? 'bg-surface-1/60' : 'bg-surface-1'}`}
                        style={{ gridColumnStart: dayIndex + 2, gridRowStart: rowIndex + 2 }}
                      />
                    );
                  }),
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
                    className={`relative z-10 mx-[3px] my-[2px] flex cursor-pointer flex-col gap-0.5 overflow-hidden rounded-md px-2 py-1 text-[11px] text-white shadow-elev-1 ring-1 ring-white/10 transition hover:scale-[1.02] hover:ring-2 hover:ring-white/30 active:scale-[0.98] ${
                      isPreviewMode ? 'opacity-75 ring-dashed ring-white/40' : ''
                    }`}
                    style={{
                      gridColumnStart: block.column,
                      gridRowStart: block.rowStart,
                      gridRowEnd: block.rowEnd,
                      backgroundColor: block.color,
                    }}
                  >
                    {block.isClosed && (
                      <span className="absolute bottom-1 right-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-red-600">
                        FULL
                      </span>
                    )}
                    {block.overflowTop && (
                      <span className="absolute left-0 right-0 top-0 h-2 bg-white/30" />
                    )}
                    {block.overflowBottom && (
                      <span className="absolute bottom-0 left-0 right-0 h-2 bg-white/30" />
                    )}
                    <span className="font-semibold leading-tight">{block.visibleLabel}</span>
                    <span className="leading-tight text-white/90">{block.subtitle}</span>
                    {block.meta && (
                      <span className="truncate leading-tight text-white/80">{block.meta}</span>
                    )}
                  </div>
                ))}

                {blocks.length === 0 && (
                  <div className="pointer-events-auto col-start-2 col-end-[-1] row-start-2 row-end-[-1] flex items-center justify-center px-6 py-8">
                    <ScheduleEmptyState
                      onOpenBuilder={() => setIsBuilderOpen(true)}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* -------- Online + Sunday sidebar (only when populated) -------- */}
          {sidebarItems.length > 0 && (
            <aside
              className={`border-t border-border xl:border-l xl:border-t-0 ${sidebarOpen ? 'w-full xl:w-64' : 'w-full xl:w-10'}`}
            >
              <div className="p-3">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="focus-ring flex w-full items-center justify-between rounded px-1 py-1 text-xs transition hover:bg-surface-2"
                >
                  {sidebarOpen && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-foreground">Online + Sunday</span>
                      <span className="text-[11px] text-muted-foreground">{sidebarItems.length}</span>
                    </div>
                  )}
                  <svg
                    width="12"
                    height="12"
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
                  <div className="mt-2 space-y-1.5">
                    {sidebarItems.map((item) => (
                      <div
                        key={item.key}
                        className="group rounded border border-border px-2.5 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                            <span>{item.label}</span>
                            {item.isClosed && (
                              <span className="rounded border border-destructive/30 bg-destructive/10 px-1 py-0.5 text-[9px] font-medium uppercase text-destructive">
                                Full
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveSection(item.indexNumber)}
                            className="focus-ring rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                            title="Remove section"
                            aria-label="Remove section"
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
                              : 'text-[11px] text-foreground/80'
                          }
                        >
                          {item.detail}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          )}
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

      {/* Guest schedule import dialog */}
      <GuestImportDialog
        open={Boolean(guestImportCandidate)}
        name={guestImportName}
        sectionCount={guestImportCandidate?.sectionCount ?? 0}
        isSaving={isImportingGuestSchedule}
        onNameChange={setGuestImportName}
        onConfirm={() => void handleConfirmGuestImport()}
        onSkip={handleSkipGuestImport}
      />

      {/* Delete dialog */}
      <DeleteDialog
        open={deleteDialogOpen}
        name={activeEntry?.name ?? ''}
        onConfirm={() => void handleDeleteSchedule()}
        onCancel={() => setDeleteDialogOpen(false)}
      />

      {/* New schedule dialog */}
      <NewScheduleDialog
        open={newScheduleDialogOpen}
        isCreating={isCreatingSchedule}
        onConfirm={handleCreateSchedule}
        onCancel={() => setNewScheduleDialogOpen(false)}
      />

      {/* Schedule Builder dialog */}
      <ScheduleBuilderDialog
        open={isBuilderOpen}
        onClose={() => setIsBuilderOpen(false)}
      />

      {/* Save temporary schedule dialog */}
      <SaveTempScheduleDialog
        open={saveTempDialogOpen && Boolean(previewEntry)}
        defaultName={
          previewEntry?.temporary?.label
            ?? previewEntry?.name
            ?? `Schedule - ${resolveTermLabel(displaySchedule.termCode)} ${displaySchedule.termYear}`
        }
        sectionCount={previewEntry?.snapshot.sections.length ?? 0}
        isSaving={isSavingTemp}
        onConfirm={(name) => void handleConfirmSaveTemp(name)}
        onCancel={() => setSaveTempDialogOpen(false)}
      />
    </section>
  );
};
