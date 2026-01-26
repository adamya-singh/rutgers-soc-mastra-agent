import React from 'react';

export type SearchResultDetail = {
  label: string;
  value: string;
};

export type SearchResultItem = {
  id: string;
  title: string;
  subtitle?: string;
  summary?: string;
  badges?: string[];
  details?: SearchResultDetail[];
};

interface SearchResultsProps {
  results: SearchResultItem[];
  title?: string;
  emptyState?: string;
}

export function SearchResults({
  results,
  title = 'Search Results',
  emptyState = 'No search results yet.',
}: SearchResultsProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
          {results.length} items
        </span>
      </div>

      {results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          {emptyState}
        </div>
      ) : (
        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-2">
          {results.map((result) => (
            <details
              key={result.id}
              className="group rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300"
            >
              <summary className="flex cursor-pointer list-none flex-col gap-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-semibold text-slate-900">{result.title}</div>
                    {result.subtitle && (
                      <div className="text-sm text-slate-500">{result.subtitle}</div>
                    )}
                  </div>
                  {result.badges && result.badges.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {result.badges.map((badge) => (
                        <span
                          key={badge}
                          className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {result.summary && (
                  <p className="text-sm text-slate-600">{result.summary}</p>
                )}
              </summary>
              {result.details && result.details.length > 0 && (
                <div className="border-t border-slate-100 px-4 pb-4 pt-3 text-sm text-slate-600">
                  <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,140px)_minmax(0,1fr)]">
                    {result.details.map((detail) => (
                      <React.Fragment key={`${result.id}-${detail.label}`}>
                        <dt className="font-medium text-slate-500">{detail.label}</dt>
                        <dd className="text-slate-700">{detail.value}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                </div>
              )}
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
