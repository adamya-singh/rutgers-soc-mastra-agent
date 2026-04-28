'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export type SearchResultDetail = {
  label: string;
  value: string;
};

export type SearchResultMeetingTime = {
  day?: string;
  startTimeMilitary?: string;
  endTimeMilitary?: string;
  startTime?: string;
  endTime?: string;
  building?: string;
  room?: string;
  campus?: string;
  mode?: string;
  isOnline?: boolean;
};

export type SearchResultSection = {
  indexNumber: string;
  sectionId?: number;
  courseString?: string;
  courseTitle?: string;
  credits?: number;
  sectionNumber?: string;
  instructors?: string[];
  isOpen?: boolean;
  meetingTimes?: SearchResultMeetingTime[];
  isOnline?: boolean;
  sessionDates?: string;
};

export type SearchResultMisc = {
  body?: string;
  fields?: SearchResultDetail[];
  href?: string;
};

export type SearchResultItem = {
  id: string;
  type?: 'section' | 'course' | 'misc';
  title: string;
  subtitle?: string;
  summary?: string;
  badges?: string[];
  details?: SearchResultDetail[];
  section?: SearchResultSection;
  misc?: SearchResultMisc;
  termYear?: number;
  termCode?: string;
  campus?: string;
};

interface SearchResultsProps {
  results: SearchResultItem[];
  title?: string;
  onAddSection?: (payload: {
    section: SearchResultSection;
    termYear?: number;
    termCode?: string;
    campus?: string;
  }) => void | Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  Helper: format meeting times into compact day/time pills           */
/* ------------------------------------------------------------------ */

function formatTimePill(mt: SearchResultMeetingTime): string {
  if (mt.isOnline) return 'Online';
  const day = mt.day ?? '';
  const start = mt.startTime || formatMil(mt.startTimeMilitary);
  const end = mt.endTime || formatMil(mt.endTimeMilitary);
  if (start === 'TBA') return day ? `${day} TBA` : 'TBA';
  return `${day} ${start}–${end}`.trim();
}

function formatMil(time?: string | null): string {
  if (!time) return 'TBA';
  const raw = time.trim().padStart(4, '0');
  const h = Number(raw.slice(0, 2));
  const m = Number(raw.slice(2, 4));
  if (Number.isNaN(h) || Number.isNaN(m)) return 'TBA';
  const period = h >= 12 ? 'p' : 'a';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${m.toString().padStart(2, '0')}${period}`;
}

/* ------------------------------------------------------------------ */
/*  Single Result Card                                                 */
/* ------------------------------------------------------------------ */

function ResultCard({
  result,
  onAddSection,
}: {
  result: SearchResultItem;
  onAddSection?: SearchResultsProps['onAddSection'];
}) {
  const [open, setOpen] = React.useState(false);
  const hasContent =
    (result.details && result.details.length > 0) ||
    result.misc?.body ||
    (result.misc?.fields && result.misc.fields.length > 0);

  const isSection = result.type === 'section' && result.section;
  const sectionOpen = result.section?.isOpen;
  const meetingTimes = result.section?.meetingTimes ?? [];

  return (
    <div className="border-b border-border last:border-b-0">
      {/* Card header — single, dense row */}
      <button
        type="button"
        onClick={() => hasContent && setOpen(!open)}
        className={`flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-surface-2 ${hasContent ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {/* Open/closed dot */}
        {isSection && sectionOpen !== undefined ? (
          <span
            className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${sectionOpen ? 'bg-success' : 'bg-destructive'}`}
            title={sectionOpen ? 'Open' : 'Closed'}
            aria-label={sectionOpen ? 'Open' : 'Closed'}
          />
        ) : (
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium text-foreground">{result.title}</span>
            {result.subtitle && (
              <span className="truncate text-xs text-muted-foreground">{result.subtitle}</span>
            )}
          </div>
          {(meetingTimes.length > 0 || (result.badges && result.badges.length > 0)) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              {meetingTimes.map((mt, i) => (
                <span key={i}>{formatTimePill(mt)}</span>
              ))}
              {result.badges &&
                result.badges.map((badge) => (
                  <span key={badge} className="text-muted-foreground/80">
                    · {badge}
                  </span>
                ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* Add section button */}
          {isSection && result.section?.indexNumber && onAddSection && (
            <button
              type="button"
              className="focus-ring flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
              onClick={(e) => {
                e.stopPropagation();
                onAddSection({
                  section: result.section!,
                  termYear: result.termYear,
                  termCode: result.termCode,
                  campus: result.campus,
                });
              }}
              title="Add to schedule"
              aria-label="Add to schedule"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="8" y1="4" x2="8" y2="12" />
                <line x1="4" y1="8" x2="12" y2="8" />
              </svg>
            </button>
          )}

          {/* Expand chevron */}
          {hasContent && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          )}
        </div>
      </button>

      {/* Expandable content */}
      <AnimatePresence initial={false}>
        {open && hasContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 text-sm">
              {result.summary && (
                <p className="mb-2 text-xs text-muted-foreground">{result.summary}</p>
              )}
              {result.misc?.body && (
                <p className="mb-2 text-xs text-muted-foreground">{result.misc.body}</p>
              )}
              <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,110px)_minmax(0,1fr)]">
                {(result.details ?? result.misc?.fields ?? []).map((detail) => (
                  <React.Fragment key={`${result.id}-${detail.label}`}>
                    <dt className="text-xs text-muted-foreground">{detail.label}</dt>
                    <dd className="text-xs text-foreground/85">{detail.value}</dd>
                  </React.Fragment>
                ))}
              </dl>
              {result.misc?.href && (
                <div className="mt-2 text-xs text-muted-foreground">{result.misc.href}</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main SearchResults Component                                       */
/* ------------------------------------------------------------------ */

export function SearchResults({
  results,
  title = 'Results',
  onAddSection,
}: SearchResultsProps) {
  if (results.length === 0) {
    return null;
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border bg-surface-1">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </h3>
          <span className="text-xs text-muted-foreground">{results.length}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {results.map((result) => (
          <ResultCard key={result.id} result={result} onAddSection={onAddSection} />
        ))}
      </div>
    </section>
  );
}
