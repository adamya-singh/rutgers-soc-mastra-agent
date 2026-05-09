'use client';

import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Sparkles } from 'lucide-react';
import { dispatchCedarPrompt } from '@/cedar/promptBridge';

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
  { value: 'college_avenue', label: 'College Avenue' },
  { value: 'busch', label: 'Busch' },
  { value: 'livingston', label: 'Livingston' },
  { value: 'cook_douglass', label: 'Cook / Douglass' },
];

const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: 'undergraduate', label: 'Undergraduate' },
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

const DAY_OPTIONS: { value: DayCode; label: string }[] = [
  { value: 'M', label: 'Mon' },
  { value: 'T', label: 'Tue' },
  { value: 'W', label: 'Wed' },
  { value: 'H', label: 'Thu' },
  { value: 'F', label: 'Fri' },
];

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 'mostly_easy', label: 'Mostly easy' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'mostly_hard', label: 'Mostly hard' },
];

// Curated common-subject list (same set surfaced in the agent system prompt).
// Free-form 3-digit codes are also accepted via the input below the combobox.
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
/*  Prompt formatting                                                  */
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

  React.useEffect(() => {
    if (open) {
      setPrefs(DEFAULT_PREFS);
      setCustomSubject('');
    }
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
    const found = COMMON_SUBJECTS.find((s) => s.code === value);
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
      const matched = COMMON_SUBJECTS.find((s) => s.code === trimmed);
      setPrefs((p) => ({
        ...p,
        subjectCode: trimmed,
        subjectLabel: matched ? matched.label : null,
      }));
    } else if (trimmed.length === 0 && prefs.subjectCode) {
      // Don't clear if user hasn't typed yet — only clear if combobox isn't set
      const fromCombobox = COMMON_SUBJECTS.some((s) => s.code === prefs.subjectCode);
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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const prompt = formatPrefsAsPrompt(prefs);
    dispatchCedarPrompt(prompt);
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-surface-2 shadow-elev-2 animate-fade-up">
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 pb-4 pt-6">
            <div className="min-w-0">
              <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-action" strokeWidth={2.25} />
                Schedule Builder
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                Tell the agent your preferences and it will plan 2-3 schedule options for
                you. Everything is optional — leave fields blank to let the agent decide.
              </Dialog.Description>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-6">
                <Section title="Campus location" hint="New Brunswick sub-campus to bias toward.">
                  <ChipGroup
                    options={SUB_CAMPUS_OPTIONS}
                    selected={prefs.subCampus ? [prefs.subCampus] : []}
                    onToggle={(value) =>
                      setPrefs((p) => ({
                        ...p,
                        subCampus: p.subCampus === value ? null : (value as SubCampus),
                      }))
                    }
                    allowAny
                    onClearAny={() => setPrefs((p) => ({ ...p, subCampus: null }))}
                  />
                </Section>

                <Section
                  title="Section availability"
                  hint="Defaults to open sections only."
                >
                  <Segmented
                    options={[
                      { value: 'open', label: 'Open sections only' },
                      { value: 'all', label: 'Open or closed' },
                    ]}
                    value={prefs.openOnly ? 'open' : 'all'}
                    onChange={(value) =>
                      setPrefs((p) => ({ ...p, openOnly: value === 'open' }))
                    }
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
                    allowAny
                    onClearAny={() => setPrefs((p) => ({ ...p, level: null }))}
                  />
                </Section>

                <Section
                  title="Subject area"
                  hint="Pick a common subject or type a 3-digit code (e.g. 198)."
                >
                  <select
                    value={prefs.subjectCode ?? ''}
                    onChange={(event) => handleSubjectSelect(event.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-surface-1 px-3 text-sm font-medium text-foreground outline-none transition focus:border-action focus:ring-2 focus:ring-action/30"
                  >
                    <option value="">Any subject</option>
                    {COMMON_SUBJECTS.map((subject) => (
                      <option key={subject.code} value={subject.code}>
                        {subject.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{3}"
                    maxLength={3}
                    value={customSubject}
                    onChange={(event) => handleCustomSubject(event.target.value)}
                    placeholder="Or type a 3-digit subject code"
                    className="mt-2 h-10 w-full rounded-lg border border-border bg-surface-1 px-3 text-sm font-medium text-foreground outline-none transition focus:border-action focus:ring-2 focus:ring-action/30 placeholder:text-muted-foreground"
                  />
                </Section>

                <Section
                  title="Course modality"
                  hint="Pick any combination, or leave blank for any."
                >
                  <ChipGroup
                    options={MODALITY_OPTIONS}
                    selected={prefs.modalities}
                    onToggle={(value) => toggleModality(value as Modality)}
                  />
                </Section>

                <Section
                  title="Preferred time of day"
                  hint="Multi-select supported."
                >
                  <ChipGroup
                    options={TIME_OF_DAY_OPTIONS.map((opt) => ({
                      value: opt.value,
                      label: `${opt.label} · ${opt.hint}`,
                    }))}
                    selected={prefs.timesOfDay}
                    onToggle={(value) => toggleTimeOfDay(value as TimeOfDay)}
                  />
                </Section>

                <Section
                  title="Preferred days of the week"
                  hint="Pick the days you want classes on."
                >
                  <ChipGroup
                    options={DAY_OPTIONS}
                    selected={prefs.days}
                    onToggle={(value) => toggleDay(value as DayCode)}
                  />
                </Section>

                <Section
                  title="Desired credits"
                  hint={`Range between ${CREDITS_MIN} and ${CREDITS_MAX} credits.`}
                >
                  <div className="flex items-center gap-3">
                    <NumberStepper
                      label="Min"
                      value={prefs.creditsMin}
                      min={CREDITS_MIN}
                      max={prefs.creditsMax}
                      onChange={(value) => handleCreditsChange('min', value)}
                    />
                    <span className="text-sm text-muted-foreground">to</span>
                    <NumberStepper
                      label="Max"
                      value={prefs.creditsMax}
                      min={prefs.creditsMin}
                      max={CREDITS_MAX}
                      onChange={(value) => handleCreditsChange('max', value)}
                    />
                  </div>
                </Section>

                <Section
                  title="Desired difficulty"
                  hint="The agent infers difficulty from course level, credits, prereqs, and your past grades."
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
                    allowAny
                    onClearAny={() => setPrefs((p) => ({ ...p, difficulty: null }))}
                  />
                </Section>
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-border bg-surface-2 px-6 py-4">
              <p className="text-xs text-muted-foreground">
                The agent will use these as guidance — leaving fields blank is fine.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} />
                  Build schedules
                </button>
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
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">
          {title}
        </h4>
        {hint && (
          <span className="text-[11px] text-muted-foreground">{hint}</span>
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
  allowAny,
  onClearAny,
}: {
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
  allowAny?: boolean;
  onClearAny?: () => void;
}) {
  const noneSelected = selected.length === 0;
  return (
    <div className="flex flex-wrap gap-2">
      {allowAny && (
        <button
          type="button"
          onClick={() => onClearAny?.()}
          className={`focus-ring rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
            noneSelected
              ? 'border-action bg-action/15 text-action'
              : 'border-border bg-surface-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground'
          }`}
        >
          Any
        </button>
      )}
      {options.map((option) => {
        const isSelected = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onToggle(option.value)}
            className={`focus-ring rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              isSelected
                ? 'border-action bg-action/15 text-action'
                : 'border-border bg-surface-1 text-foreground hover:bg-surface-2'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-border bg-surface-1 p-1">
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`focus-ring rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              isSelected
                ? 'bg-surface-2 text-foreground shadow-elev-1'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function NumberStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="inline-flex items-center rounded-lg border border-border bg-surface-1">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          className="focus-ring flex h-9 w-8 items-center justify-center rounded-l-lg text-base font-semibold text-foreground transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-9 w-12 border-x border-border bg-transparent text-center text-sm font-semibold text-foreground outline-none [appearance:textfield] focus:bg-surface-2 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          className="focus-ring flex h-9 w-8 items-center justify-center rounded-r-lg text-base font-semibold text-foreground transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Increase ${label.toLowerCase()}`}
        >
          +
        </button>
      </div>
    </label>
  );
}
