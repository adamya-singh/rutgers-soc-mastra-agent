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
  emptyState?: string;
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
    <div className="rounded-xl border border-border bg-surface-1 shadow-sm transition hover:border-border-subtle hover:shadow-elev-1">
      {/* Card header */}
      <button
        type="button"
        onClick={() => hasContent && setOpen(!open)}
        className={`flex w-full flex-col gap-1.5 p-4 text-left ${hasContent ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{result.title}</span>
              {/* Open/Closed badge */}
              {isSection && sectionOpen !== undefined && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${sectionOpen
                      ? 'bg-success/10 text-success'
                      : 'bg-destructive/10 text-destructive'
                    }`}
                >
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${sectionOpen ? 'bg-success' : 'bg-destructive'}`} />
                  {sectionOpen ? 'Open' : 'Closed'}
                </span>
              )}
            </div>
            {result.subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">{result.subtitle}</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Add section button */}
            {isSection && result.section?.indexNumber && onAddSection && (
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-action/10 text-action transition hover:bg-action/20 active:scale-95"
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
                width="14"
                height="14"
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
        </div>

        {/* Meeting time pills + badges row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {meetingTimes.length > 0 &&
            meetingTimes.map((mt, i) => (
              <span
                key={i}
                className="rounded-md bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {formatTimePill(mt)}
              </span>
            ))}
          {result.badges &&
            result.badges.map((badge) => (
              <span
                key={badge}
                className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
              >
                {badge}
              </span>
            ))}
        </div>

        {result.summary && !open && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{result.summary}</p>
        )}
      </button>

      {/* Expandable content */}
      <AnimatePresence initial={false}>
        {open && hasContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-4 pb-4 pt-3 text-sm text-muted-foreground">
              {result.summary && (
                <p className="mb-3 text-sm text-muted-foreground">{result.summary}</p>
              )}
              {result.misc?.body && (
                <p className="mb-3 text-sm text-muted-foreground">{result.misc.body}</p>
              )}
              <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,120px)_minmax(0,1fr)]">
                {(result.details ?? result.misc?.fields ?? []).map((detail) => (
                  <React.Fragment key={`${result.id}-${detail.label}`}>
                    <dt className="text-xs font-medium text-muted-foreground">{detail.label}</dt>
                    <dd className="text-xs text-foreground/80">{detail.value}</dd>
                  </React.Fragment>
                ))}
              </dl>
              {result.misc?.href && (
                <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {result.misc.href}
                </div>
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
  title = 'Search Results',
  emptyState = 'No search results yet.',
  onAddSection,
}: SearchResultsProps) {
  return (
    <section className="flex min-h-[350px] flex-col rounded-xl border border-border bg-surface-2 p-5 shadow-elev-1">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {results.length > 0 && (
          <span className="rounded-full bg-surface-1 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {results.length}
          </span>
        )}
      </div>

      {results.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface-1 px-4 py-10 text-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground opacity-40">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <p className="text-sm text-muted-foreground">{emptyState}</p>
          <p className="text-xs text-muted-foreground/60">
            Try asking: &ldquo;Show open CS classes&rdquo; or &ldquo;Find 3-credit QQ courses&rdquo;
          </p>
        </div>
      ) : (
        <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
          {results.map((result) => (
            <ResultCard key={result.id} result={result} onAddSection={onAddSection} />
          ))}
        </div>
      )}
    </section>
  );
}
