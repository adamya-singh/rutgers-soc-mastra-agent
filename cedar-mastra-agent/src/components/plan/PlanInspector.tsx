'use client';

import React from 'react';
import { usePlanGraph } from '@/components/plan/PlanGraphProvider';
import {
  isPlanGraph,
  validateDag,
  type AcademicPlanGraph,
} from '@/lib/planGraph/types';

type State =
  | { kind: 'clean' }
  | { kind: 'dirty'; text: string }
  | { kind: 'error'; text: string; message: string };

const stringify = (graph: AcademicPlanGraph) => JSON.stringify(graph, null, 2);

export function PlanInspector() {
  const { graph, replaceGraph, validation } = usePlanGraph();
  const [state, setState] = React.useState<State>({ kind: 'clean' });

  const text = state.kind === 'clean' ? stringify(graph) : state.text;

  const handleApply = React.useCallback(() => {
    if (state.kind !== 'dirty') return;
    try {
      const parsed = JSON.parse(state.text);
      if (!isPlanGraph(parsed)) {
        setState({
          kind: 'error',
          text: state.text,
          message: 'JSON is not a valid AcademicPlanGraph (need version=1, nodes[], edges[])',
        });
        return;
      }
      const result = validateDag(parsed);
      if (!result.ok) {
        setState({ kind: 'error', text: state.text, message: result.reason });
        return;
      }
      replaceGraph(parsed);
      setState({ kind: 'clean' });
    } catch (err) {
      setState({
        kind: 'error',
        text: state.text,
        message:
          err instanceof Error ? err.message : 'Could not parse JSON',
      });
    }
  }, [replaceGraph, state]);

  const handleReset = React.useCallback(() => {
    setState({ kind: 'clean' });
  }, []);

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Plan Graph JSON
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span
            className={`rounded-full border px-2 py-0.5 ${
              validation.ok
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
            }`}
          >
            {validation.ok ? 'Valid DAG' : 'Invalid'}
          </span>
          <span className="text-muted-foreground">
            {graph.nodes.length} nodes · {graph.edges.length} edges
          </span>
        </div>
      </div>

      {state.kind === 'error' && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {state.message}
        </div>
      )}
      {!validation.ok && state.kind !== 'error' && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Current graph is invalid: {validation.reason}
        </div>
      )}

      <textarea
        value={text}
        spellCheck={false}
        onChange={(event) =>
          setState({ kind: 'dirty', text: event.target.value })
        }
        className="min-h-[240px] flex-1 resize-none rounded-md border border-border bg-surface-1 p-3 font-mono text-[11px] leading-relaxed text-foreground shadow-inner outline-none focus:border-primary"
      />

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleReset}
          disabled={state.kind === 'clean'}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-50"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={state.kind !== 'dirty'}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
