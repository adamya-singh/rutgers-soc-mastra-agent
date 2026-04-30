'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Eraser, FileJson, RefreshCcw, Sparkles, X } from 'lucide-react';
import {
  PlanGraphProvider,
  usePlanGraph,
} from '@/components/plan/PlanGraphProvider';
import { PlanViewSwitcher } from '@/components/plan/PlanViewSwitcher';
import { PlanInspector } from '@/components/plan/PlanInspector';
import {
  buildPlanGraphFromExisting,
  type DnCapture,
} from '@/lib/planGraph/buildFromExisting';
import { buildMockPlanGraph } from '@/lib/planGraph/mockPlan';
import { emptyPlanGraph } from '@/lib/planGraph/types';
import {
  getActiveScheduleEntry,
  loadSchedule,
  type ScheduleSnapshot,
} from '@/lib/scheduleStorage';
import { supabaseClient } from '@/lib/supabaseClient';
import { buildMastraApiUrl } from '@/lib/mastraConfig';

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; nodeCount: number; edgeCount: number };

function loadActiveSchedule(): ScheduleSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const active = getActiveScheduleEntry();
    if (active) return active.snapshot;
    return loadSchedule();
  } catch {
    return null;
  }
}

async function fetchDegreeNavigatorCapture(): Promise<DnCapture | null> {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error || !data.session?.access_token) {
    return null;
  }
  const response = await fetch(
    buildMastraApiUrl('/degree-navigator/profile'),
    {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    },
  );
  if (!response.ok) {
    throw new Error(`Degree Navigator profile request failed (${response.status})`);
  }
  const body = (await response.json()) as { profile: DnCapture | null };
  return body.profile ?? null;
}

function PlanWorkspace() {
  const { graph, replaceGraph, validation } = usePlanGraph();
  const [loadState, setLoadState] = React.useState<LoadState>({ kind: 'idle' });
  const [showInspector, setShowInspector] = React.useState(false);

  const handleLoadMock = React.useCallback(() => {
    const next = buildMockPlanGraph();
    replaceGraph(next);
    setLoadState({
      kind: 'ready',
      nodeCount: next.nodes.length,
      edgeCount: next.edges.length,
    });
  }, [replaceGraph]);

  const handleClear = React.useCallback(() => {
    replaceGraph(emptyPlanGraph());
    setLoadState({ kind: 'idle' });
  }, [replaceGraph]);

  const handleLoadFromMyData = React.useCallback(async () => {
    setLoadState({ kind: 'loading' });
    try {
      const schedule = loadActiveSchedule();
      let capture: DnCapture | null = null;
      try {
        capture = await fetchDegreeNavigatorCapture();
      } catch (err) {
        if (!schedule) throw err;
        capture = null;
      }
      const next = buildPlanGraphFromExisting({ capture, schedule });
      replaceGraph(next);
      if (next.nodes.length === 0) {
        setLoadState({
          kind: 'error',
          message:
            'No schedule sections or Degree Navigator capture were found. Sign in and run a Degree Navigator sync first.',
        });
        return;
      }
      setLoadState({
        kind: 'ready',
        nodeCount: next.nodes.length,
        edgeCount: next.edges.length,
      });
    } catch (err) {
      setLoadState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to load data',
      });
    }
  }, [replaceGraph]);

  const sourceLabel = graph.meta?.source ?? 'manual';

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-1 px-4 py-3 shadow-elev-1">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Back
          </Link>
          <div>
            <h1 className="font-display text-lg font-semibold text-foreground">
              Plan Graph
            </h1>
            <p className="text-xs text-muted-foreground">
              Same DAG, three projections. {graph.nodes.length} nodes ·{' '}
              {graph.edges.length} edges · source: {sourceLabel}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!validation.ok && (
            <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
              Invalid graph
            </span>
          )}
          <button
            type="button"
            onClick={handleLoadMock}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2"
          >
            <Sparkles className="size-3.5" /> Load mock
          </button>
          <button
            type="button"
            onClick={handleLoadFromMyData}
            disabled={loadState.kind === 'loading'}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-50"
          >
            <RefreshCcw className="size-3.5" />
            {loadState.kind === 'loading' ? 'Loading…' : 'Load from my data'}
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2"
          >
            <Eraser className="size-3.5" /> Clear
          </button>
          <button
            type="button"
            onClick={() => setShowInspector((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
              showInspector
                ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                : 'border-border text-foreground hover:bg-surface-2'
            }`}
          >
            {showInspector ? (
              <X className="size-3.5" />
            ) : (
              <FileJson className="size-3.5" />
            )}
            {showInspector ? 'Hide JSON' : 'Inspector'}
          </button>
        </div>
      </div>

      {loadState.kind === 'error' && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {loadState.message}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="min-w-0 flex-1">
          <PlanViewSwitcher />
        </div>
        {showInspector && (
          <aside className="hidden w-[420px] shrink-0 flex-col rounded-xl border border-border bg-surface-1 shadow-elev-1 lg:flex">
            <PlanInspector />
          </aside>
        )}
      </div>
    </div>
  );
}

export default function PlanPage() {
  const initialGraph = React.useMemo(() => buildMockPlanGraph(), []);
  return (
    <main className="flex h-screen flex-col gap-4 bg-background p-4 text-foreground">
      <PlanGraphProvider initialGraph={initialGraph}>
        <PlanWorkspace />
      </PlanGraphProvider>
    </main>
  );
}
