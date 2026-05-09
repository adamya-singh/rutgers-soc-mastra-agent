'use client';

import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, ChevronDown, Search, Sparkles } from 'lucide-react';
import { dispatchCedarPrompt } from '@/cedar/promptBridge';
import { supabaseClient } from '@/lib/supabaseClient';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SubCampus = 'college_avenue' | 'busch' | 'livingston' | 'cook_douglass';
type Level = 'undergraduate' | 'graduate';
type Modality = 'in_person' | 'online' | 'hybrid';
type TimeOfDay = 'morning' | 'afternoon' | 'evening';
type DayCode = 'M' | 'T' | 'W' | 'H' | 'F';
type Difficulty = 'mostly_easy' | 'balanced' | 'mostly_hard';

type SchedulePreferences = {
  subCampus: SubCampus | null;
  openOnly: boolean;
  level: Level | null;
  subjectCode: string | null;
  subjectLabel: string | null;
  modalities: Modality[];
  timesOfDay: TimeOfDay[];
  days: DayCode[];
  creditsMin: number;
  creditsMax: number;
  difficulty: Difficulty | null;
};

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SUB_CAMPUS_OPTIONS: { value: SubCampus; label: string }[] = [
  { value: 'college_avenue', label: 'College Ave' },
  { value: 'busch', label: 'Busch' },
  { value: 'livingston', label: 'Livingston' },
  { value: 'cook_douglass', label: 'Cook / Douglass' },
];

const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: 'undergraduate', label: 'Undergrad' },
  { value: 'graduate', label: 'Graduate' },
];

const MODALITY_OPTIONS: { value: Modality; label: string }[] = [
  { value: 'in_person', label: 'In-person' },
  { value: 'online', label: 'Online' },
  { value: 'hybrid', label: 'Hybrid' },
];

const TIME_OF_DAY_OPTIONS: { value: TimeOfDay; label: string; hint: string }[] = [
  { value: 'morning', label: 'Morning', hint: 'before 12 PM' },
  { value: 'afternoon', label: 'Afternoon', hint: '12 – 5 PM' },
  { value: 'evening', label: 'Evening', hint: 'after 5 PM' },
];

const DAY_OPTIONS: { value: DayCode; label: string; full: string }[] = [
  { value: 'M', label: 'M', full: 'Mon' },
  { value: 'T', label: 'T', full: 'Tue' },
  { value: 'W', label: 'W', full: 'Wed' },
  { value: 'H', label: 'T', full: 'Thu' },
  { value: 'F', label: 'F', full: 'Fri' },
];

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 'mostly_easy', label: 'Easy' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'mostly_hard', label: 'Hard' },
];

const COMMON_SUBJECTS: { code: string; label: string }[] = [
  { code: '198', label: 'Computer Science (198)' },
  { code: '640', label: 'Mathematics (640)' },
  { code: '750', label: 'Physics (750)' },
  { code: '160', label: 'Expository Writing (160)' },
  { code: '355', label: 'English (355)' },
  { code: '920', label: 'Economics (920)' },
  { code: '830', label: 'Psychology (830)' },
  { code: '119', label: 'Biology (119)' },
  { code: '510', label: 'History (510)' },
  { code: '014', label: 'African / Caribbean Studies (014)' },
  { code: '220', label: 'Economics – SAS (220)' },
  { code: '506', label: 'Public Policy (506)' },
];

const CREDITS_MIN = 12;
const CREDITS_MAX = 21;

const CREDIT_PRESETS: { id: string; label: string; min: number; max: number }[] = [
  { id: 'light', label: 'Light', min: 12, max: 14 },
  { id: 'standard', label: 'Standard', min: 15, max: 17 },
  { id: 'heavy', label: 'Heavy', min: 18, max: 21 },
];

const DEFAULT_PREFS: SchedulePreferences = {
  subCampus: null,
  openOnly: true,
  level: null,
  subjectCode: null,
  subjectLabel: null,
  modalities: [],
  timesOfDay: [],
  days: [],
  creditsMin: 15,
  creditsMax: 18,
  difficulty: null,
};

/* ------------------------------------------------------------------ */
/*  Subject loader                                                     */
/* ------------------------------------------------------------------ */

type SubjectOption = { code: string; label: string };

let subjectsCache: SubjectOption[] | null = null;
let subjectsPromise: Promise<SubjectOption[]> | null = null;

async function loadAllSubjects(): Promise<SubjectOption[]> {
  if (subjectsCache) return subjectsCache;
  if (subjectsPromise) return subjectsPromise;

  subjectsPromise = (async () => {
    try {
      const { data, error } = await supabaseClient
        .from('subjects_distinct')
        .select('code, description')
        .order('description', { ascending: true })
        .limit(2000);

      if (error || !data) {
        subjectsPromise = null;
        return COMMON_SUBJECTS;
      }

      const subjects: SubjectOption[] = data
        .filter((row): row is { code: string; description: string | null } =>
          Boolean(row.code),
        )
        .map((row) => ({
          code: row.code,
          label: row.description
            ? `${row.description} (${row.code})`
            : `Subject ${row.code}`,
        }));

      subjectsCache = subjects.length > 0 ? subjects : COMMON_SUBJECTS;
      return subjectsCache;
    } catch {
      subjectsPromise = null;
      return COMMON_SUBJECTS;
    }
  })();

  return subjectsPromise;
}

/* ------------------------------------------------------------------ */
/*  Prompt formatting (unchanged)                                      */
/* ------------------------------------------------------------------ */

const SUB_CAMPUS_LABEL: Record<SubCampus, string> = {
  college_avenue: 'College Avenue',
  busch: 'Busch',
  livingston: 'Livingston',
  cook_douglass: 'Cook / Douglass',
};

const LEVEL_LABEL: Record<Level, string> = {
  undergraduate: 'undergraduate',
  graduate: 'graduate',
};

const MODALITY_LABEL: Record<Modality, string> = {
  in_person: 'in-person',
  online: 'online',
  hybrid: 'hybrid',
};

const TIME_OF_DAY_LABEL: Record<TimeOfDay, string> = {
  morning: 'morning (before 12:00)',
  afternoon: 'afternoon (12:00 – 17:00)',
  evening: 'evening (17:00 and later)',
};

const DAY_LABEL: Record<DayCode, string> = {
  M: 'Mon',
  T: 'Tue',
  W: 'Wed',
  H: 'Thu',
  F: 'Fri',
};

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  mostly_easy: 'mostly easy',
  balanced: 'balanced',
  mostly_hard: 'mostly hard',
};

function formatPrefsAsPrompt(prefs: SchedulePreferences): string {
  const lines: string[] = [];

  lines.push('Use Schedule Builder mode.');
  lines.push(
    'Build 2-3 candidate schedule options based on the preferences below. Any field marked "any" is unconstrained — use your judgment and the user\'s active schedule + Degree Navigator profile to fill the gaps.',
  );
  lines.push('');
  lines.push('Preferences:');

  lines.push(
    `- Preferred New Brunswick sub-campus: ${
      prefs.subCampus ? SUB_CAMPUS_LABEL[prefs.subCampus] : 'any'
    }`,
  );
  lines.push(
    `- Section availability: ${prefs.openOnly ? 'OPEN sections only' : 'OPEN or CLOSED sections allowed'}`,
  );
  lines.push(
    `- Course level: ${prefs.level ? LEVEL_LABEL[prefs.level] : 'any'}`,
  );

  if (prefs.subjectCode) {
    lines.push(
      `- Subject focus: ${prefs.subjectCode}${prefs.subjectLabel ? ` (${prefs.subjectLabel})` : ''}`,
    );
  } else {
    lines.push('- Subject focus: any');
  }

  lines.push(
    `- Course modality: ${
      prefs.modalities.length > 0
        ? prefs.modalities.map((m) => MODALITY_LABEL[m]).join(', ')
        : 'any'
    }`,
  );
  lines.push(
    `- Preferred time of day: ${
      prefs.timesOfDay.length > 0
        ? prefs.timesOfDay.map((t) => TIME_OF_DAY_LABEL[t]).join(', ')
        : 'any'
    }`,
  );
  lines.push(
    `- Preferred days of the week: ${
      prefs.days.length > 0 ? prefs.days.map((d) => DAY_LABEL[d]).join(', ') : 'any'
    }`,
  );
  lines.push(`- Target credits: ${prefs.creditsMin} – ${prefs.creditsMax}`);
  lines.push(
    `- Desired difficulty: ${
      prefs.difficulty ? DIFFICULTY_LABEL[prefs.difficulty] : 'any'
    }`,
  );

  lines.push('');
  lines.push(
    'Read the active schedule from additional context first — never propose a section already on it, and avoid time conflicts (use checkScheduleConflicts on candidate index numbers). If the active schedule already has classes, layer the new options ON TOP of those classes by passing basedOnActive: true when creating each temporary schedule.',
  );
  lines.push(
    'Read the Degree Navigator profile (readDegreeNavigatorProfile) to personalize: respect declared programs, completed courses, prereqs, and historical grade patterns when judging difficulty.',
  );
  lines.push(
    'Create exactly 2-3 temporary schedules with stable distinct scheduleIds (e.g. option-a, option-b, option-c) and short descriptive labels (e.g. "Option A — MWF mornings, mostly easy"). Each option must total credits within the target range and be conflict-free.',
  );
  lines.push(
    'Finish with a brief comparison: per option, list total credits, modality split, time-of-day footprint, an estimated difficulty, and any prereqs the user should confirm.',
  );

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

type ScheduleBuilderDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function ScheduleBuilderDialog({ open, onClose }: ScheduleBuilderDialogProps) {
  const [prefs, setPrefs] = React.useState<SchedulePreferences>(DEFAULT_PREFS);
  const [customSubject, setCustomSubject] = React.useState('');
  const [allSubjects, setAllSubjects] = React.useState<SubjectOption[]>(
    () => subjectsCache ?? COMMON_SUBJECTS,
  );

  React.useEffect(() => {
    if (open) {
      setPrefs(DEFAULT_PREFS);
      setCustomSubject('');
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadAllSubjects().then((subjects) => {
      if (!cancelled) setAllSubjects(subjects);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const toggleModality = (value: Modality) => {
    setPrefs((p) => ({
      ...p,
      modalities: p.modalities.includes(value)
        ? p.modalities.filter((m) => m !== value)
        : [...p.modalities, value],
    }));
  };

  const toggleTimeOfDay = (value: TimeOfDay) => {
    setPrefs((p) => ({
      ...p,
      timesOfDay: p.timesOfDay.includes(value)
        ? p.timesOfDay.filter((t) => t !== value)
        : [...p.timesOfDay, value],
    }));
  };

  const toggleDay = (value: DayCode) => {
    setPrefs((p) => ({
      ...p,
      days: p.days.includes(value) ? p.days.filter((d) => d !== value) : [...p.days, value],
    }));
  };

  const handleSubjectSelect = (value: string) => {
    setCustomSubject('');
    if (!value) {
      setPrefs((p) => ({ ...p, subjectCode: null, subjectLabel: null }));
      return;
    }
    const found = allSubjects.find((s) => s.code === value);
    setPrefs((p) => ({
      ...p,
      subjectCode: value,
      subjectLabel: found ? found.label : null,
    }));
  };

  const handleCustomSubject = (raw: string) => {
    setCustomSubject(raw);
    const trimmed = raw.trim();
    if (/^\d{3}$/.test(trimmed)) {
      const matched = allSubjects.find((s) => s.code === trimmed);
      setPrefs((p) => ({
        ...p,
        subjectCode: trimmed,
        subjectLabel: matched ? matched.label : null,
      }));
    } else if (trimmed.length === 0 && prefs.subjectCode) {
      const fromCombobox = allSubjects.some((s) => s.code === prefs.subjectCode);
      if (!fromCombobox) {
        setPrefs((p) => ({ ...p, subjectCode: null, subjectLabel: null }));
      }
    }
  };

  const handleCreditsChange = (which: 'min' | 'max', raw: number) => {
    const value = Number.isFinite(raw) ? Math.round(raw) : DEFAULT_PREFS.creditsMin;
    setPrefs((p) => {
      if (which === 'min') {
        const min = Math.max(CREDITS_MIN, Math.min(value, p.creditsMax));
        return { ...p, creditsMin: min };
      }
      const max = Math.min(CREDITS_MAX, Math.max(value, p.creditsMin));
      return { ...p, creditsMax: max };
    });
  };

  const applyCreditPreset = (min: number, max: number) => {
    setPrefs((p) => ({ ...p, creditsMin: min, creditsMax: max }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const prompt = formatPrefsAsPrompt(prefs);
    dispatchCedarPrompt(prompt);
    onClose();
  };

  const activePresetId = CREDIT_PRESETS.find(
    (preset) => preset.min === prefs.creditsMin && preset.max === prefs.creditsMax,
  )?.id;

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-1 shadow-elev-2 animate-dialog-in">
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-shrink-0 items-start justify-between gap-4 px-7 pb-5 pt-6">
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-lg font-semibold tracking-tight text-foreground">
                  Schedule Builder
                </Dialog.Title>
                <Dialog.Description className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  Tell the agent your preferences and it&apos;ll plan 2–3 schedule options.
                  Anything left blank is up to the agent.
                </Dialog.Description>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="focus-ring rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-full bg-action px-5 text-sm font-semibold text-action-foreground shadow-elev-1 transition hover:opacity-95 active:scale-[0.98]"
                >
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} />
                  Build schedules
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-7 pt-1">
              <div className="grid grid-cols-1 gap-x-7 gap-y-7 md:grid-cols-2">
                <Section title="Campus">
                  <ChipGroup
                    options={SUB_CAMPUS_OPTIONS}
                    selected={prefs.subCampus ? [prefs.subCampus] : []}
                    onToggle={(value) =>
                      setPrefs((p) => ({
                        ...p,
                        subCampus: p.subCampus === value ? null : (value as SubCampus),
                      }))
                    }
                    onClearAll={() => setPrefs((p) => ({ ...p, subCampus: null }))}
                  />
                </Section>

                <Section title="Course level">
                  <ChipGroup
                    options={LEVEL_OPTIONS}
                    selected={prefs.level ? [prefs.level] : []}
                    onToggle={(value) =>
                      setPrefs((p) => ({
                        ...p,
                        level: p.level === value ? null : (value as Level),
                      }))
                    }
                    onClearAll={() => setPrefs((p) => ({ ...p, level: null }))}
                  />
                </Section>

                <Section
                  title="Subject"
                  hint="Pick a common subject or type a 3-digit code."
                  className="md:col-span-2"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex-1">
                      <SubjectCombobox
                        value={prefs.subjectCode}
                        onChange={handleSubjectSelect}
                        subjects={allSubjects}
                      />
                    </div>
                    <div className="flex items-center gap-2 sm:w-44">
                      <span className="hidden text-xs text-muted-foreground sm:block">or</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{3}"
                    maxLength={3}
                    value={customSubject}
                    onChange={(event) => handleCustomSubject(event.target.value)}
                        placeholder="3-digit code"
                        className="h-10 w-full rounded-xl border border-border-subtle bg-surface-1 px-3.5 text-sm font-medium text-foreground outline-none transition placeholder:text-muted-foreground focus:border-action focus:ring-2 focus:ring-action/25"
                      />
                    </div>
                  </div>
                </Section>

                <Section title="Days">
                  <div className="flex gap-1.5">
                    {DAY_OPTIONS.map((day) => {
                      const isSelected = prefs.days.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => toggleDay(day.value)}
                          aria-pressed={isSelected}
                          aria-label={day.full}
                          title={day.full}
                          className={`focus-ring flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition ${
                            isSelected
                              ? 'bg-action text-action-foreground shadow-elev-1'
                              : 'border border-border-subtle bg-surface-1 text-muted-foreground hover:border-border hover:text-foreground'
                          }`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </Section>

                <Section title="Time of day">
                  <div className="grid grid-cols-3 gap-1.5">
                    {TIME_OF_DAY_OPTIONS.map((time) => {
                      const isSelected = prefs.timesOfDay.includes(time.value);
                      return (
                        <button
                          key={time.value}
                          type="button"
                          onClick={() => toggleTimeOfDay(time.value)}
                          aria-pressed={isSelected}
                          className={`focus-ring flex flex-col items-start rounded-xl px-3 py-2 text-left transition ${
                            isSelected
                              ? 'bg-action text-action-foreground shadow-elev-1'
                              : 'border border-border-subtle bg-surface-1 text-muted-foreground hover:border-border hover:text-foreground'
                          }`}
                        >
                          <span className="text-sm font-semibold">{time.label}</span>
                          <span
                            className={`text-[11px] ${
                              isSelected ? 'text-action-foreground/80' : 'text-muted-foreground'
                            }`}
                          >
                            {time.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Section>

                <Section title="Modality" className="md:col-span-2">
                  <ChipGroup
                    options={MODALITY_OPTIONS}
                    selected={prefs.modalities}
                    onToggle={(value) => toggleModality(value as Modality)}
                  />
                </Section>

                <Section title="Credits" hint={`${CREDITS_MIN}–${CREDITS_MAX} credits`}>
                  <div className="flex flex-col gap-3">
                    <div className="inline-flex items-center self-start rounded-xl border border-border-subtle bg-surface-1 px-3 py-2">
                      <CreditField
                      value={prefs.creditsMin}
                      min={CREDITS_MIN}
                      max={prefs.creditsMax}
                      onChange={(value) => handleCreditsChange('min', value)}
                        ariaLabel="Minimum credits"
                    />
                      <span className="px-2 text-sm text-muted-foreground">–</span>
                      <CreditField
                      value={prefs.creditsMax}
                      min={prefs.creditsMin}
                      max={CREDITS_MAX}
                      onChange={(value) => handleCreditsChange('max', value)}
                        ariaLabel="Maximum credits"
                      />
                      <span className="pl-2 text-xs text-muted-foreground">cr</span>
                    </div>
                    <div className="flex gap-1.5">
                      {CREDIT_PRESETS.map((preset) => {
                        const isActive = preset.id === activePresetId;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => applyCreditPreset(preset.min, preset.max)}
                            className={`focus-ring rounded-full px-3 py-1 text-xs font-medium transition ${
                              isActive
                                ? 'bg-foreground/10 text-foreground'
                                : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Section>

                <Section
                  title="Difficulty"
                  hint="Inferred from credits, prereqs, and your past grades."
                >
                  <ChipGroup
                    options={DIFFICULTY_OPTIONS}
                    selected={prefs.difficulty ? [prefs.difficulty] : []}
                    onToggle={(value) =>
                      setPrefs((p) => ({
                        ...p,
                        difficulty:
                          p.difficulty === value ? null : (value as Difficulty),
                      }))
                    }
                    onClearAll={() => setPrefs((p) => ({ ...p, difficulty: null }))}
                  />
                </Section>

                <div className="md:col-span-2">
                  <Toggle
                    checked={prefs.openOnly}
                    onChange={(checked) =>
                      setPrefs((p) => ({ ...p, openOnly: checked }))
                    }
                    label="Open sections only"
                    hint="Hide sections that are already full."
                  />
                </div>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------------ */
/*  Internal field components                                          */
/* ------------------------------------------------------------------ */

function Section({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-2.5">
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        {hint && (
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function ChipGroup<T extends string>({
  options,
  selected,
  onToggle,
  onClearAll,
}: {
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
  onClearAll?: () => void;
}) {
  const noneSelected = selected.length === 0;
  return (
    <div className="flex flex-wrap gap-1.5">
      {onClearAll && (
        <Chip selected={noneSelected} onClick={() => onClearAll()}>
          Any
        </Chip>
      )}
      {options.map((option) => (
        <Chip
            key={option.value}
          selected={selected.includes(option.value)}
            onClick={() => onToggle(option.value)}
          >
            {option.label}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
        return (
          <button
            type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`focus-ring rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
        selected
          ? 'bg-action text-action-foreground shadow-elev-1'
          : 'border border-border-subtle bg-surface-1 text-muted-foreground hover:border-border hover:text-foreground'
      }`}
    >
      {children}
          </button>
  );
}

function CreditField({
  value,
  min,
  max,
  onChange,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  ariaLabel: string;
}) {
  return (
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
      aria-label={ariaLabel}
      className="w-9 bg-transparent text-center text-base font-semibold tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

function SubjectCombobox({
  value,
  onChange,
  subjects,
}: {
  value: string | null;
  onChange: (value: string) => void;
  subjects: SubjectOption[];
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const filteredItems = React.useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const base: SubjectOption[] = [{ code: '', label: 'Any subject' }, ...subjects];
    if (!trimmed) return base;
    return base.filter((item) => {
      if (item.code === '') return false;
      return (
        item.code.toLowerCase().includes(trimmed) ||
        item.label.toLowerCase().includes(trimmed)
      );
    });
  }, [query, subjects]);

  const selectedLabel = React.useMemo(() => {
    if (!value) return 'Any subject';
    const match = subjects.find((s) => s.code === value);
    return match ? match.label : `Subject code ${value}`;
  }, [value, subjects]);

  React.useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointer);
    return () => document.removeEventListener('mousedown', handlePointer);
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const initial = filteredItems.findIndex((item) => item.code === (value ?? ''));
    setActiveIndex(initial >= 0 ? initial : 0);
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  React.useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const item = list.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    item?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const commit = (code: string) => {
    onChange(code);
    setOpen(false);
  };

  const handleTriggerKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  };

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((idx) => Math.min(filteredItems.length - 1, idx + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((idx) => Math.max(0, idx - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = filteredItems[activeIndex];
      if (item) commit(item.code);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="focus-ring flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface-1 px-3.5 text-sm font-medium text-foreground outline-none transition hover:border-border focus:border-action focus:ring-2 focus:ring-action/25"
      >
        <span className={`truncate ${value ? 'text-foreground' : 'text-muted-foreground'}`}>
          {selectedLabel}
        </span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition ${
            open ? 'rotate-180' : ''
          }`}
          strokeWidth={2}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl border border-border-subtle bg-surface-1 shadow-elev-2">
          <div className="flex items-center gap-2 border-b border-border-subtle px-3">
            <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" strokeWidth={2} />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleListKeyDown}
              placeholder="Search subjects…"
              className="h-10 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div
            ref={listRef}
            role="listbox"
            className="max-h-64 overflow-y-auto py-1"
          >
            {filteredItems.length === 0 ? (
              <div className="px-3.5 py-3 text-sm text-muted-foreground">
                No subjects match &ldquo;{query}&rdquo;.
              </div>
            ) : (
              filteredItems.map((item, index) => {
                const isSelected = (value ?? '') === item.code;
                const isActive = activeIndex === index;
                return (
                  <button
                    key={item.code || 'any'}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-index={index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => commit(item.code)}
                    className={`flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-sm transition ${
                      isActive ? 'bg-surface-2 text-foreground' : 'text-foreground/90'
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    {isSelected && (
                      <Check
                        className="h-4 w-4 flex-shrink-0 text-action"
                        strokeWidth={2.25}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
        <button
          type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="focus-ring flex w-full items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-1 px-4 py-3 text-left transition hover:border-border"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {hint && (
          <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
        )}
      </span>
      <span
        className={`relative inline-flex h-6 w-10 flex-shrink-0 items-center rounded-full transition ${
          checked ? 'bg-action' : 'bg-surface-3'
        }`}
        aria-hidden
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </span>
        </button>
  );
}
