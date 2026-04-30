'use client';

import React from 'react';
import { usePlanGraph } from '@/components/plan/PlanGraphProvider';
import {
  getIncomingEdges,
  getNodesByKind,
  getOutgoingEdges,
  type CourseStatus,
  type PlanNode,
} from '@/lib/planGraph/types';

const STATUS_TONE: Record<CourseStatus, string> = {
  completed: 'border-success/30 bg-success/10 text-success',
  in_progress: 'border-warning/30 bg-warning/10 text-warning',
  planned: 'border-chart-4/30 bg-chart-4/10 text-chart-4',
  recommended: 'border-chart-2/30 bg-chart-2/10 text-chart-2',
  unmet: 'border-destructive/30 bg-destructive/10 text-destructive',
  unknown: 'border-border bg-surface-2 text-muted-foreground',
};

type ColumnEntry = {
  course: PlanNode<'course'>;
  fromAnnotations: PlanNode[];
};

export function TimelineView() {
  const { graph } = usePlanGraph();
  const terms = getNodesByKind(graph, 'term')
    .slice()
    .sort((a, b) => {
      const ak = a.data?.termKey ?? 0;
      const bk = b.data?.termKey ?? 0;
      return ak - bk;
    });

  const courseAnnotations = React.useMemo(() => {
    const byCourse = new Map<string, PlanNode[]>();
    for (const note of [
      ...getNodesByKind(graph, 'recommendation'),
      ...getNodesByKind(graph, 'warning'),
      ...getNodesByKind(graph, 'note'),
    ]) {
      for (const edge of getOutgoingEdges(graph, note.id, ['recommends'])) {
        const list = byCourse.get(edge.to) ?? [];
        list.push(note);
        byCourse.set(edge.to, list);
      }
    }
    return byCourse;
  }, [graph]);

  if (terms.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No term nodes in the graph yet.
      </div>
    );
  }

  const unscheduled = getNodesByKind(graph, 'course').filter((course) => {
    const outgoingTermEdges = getOutgoingEdges(graph, course.id, ['planned_in']);
    return outgoingTermEdges.length === 0;
  });

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
        {terms.map((term) => {
          const courseEdges = getIncomingEdges(graph, term.id, ['planned_in']);
          const seen = new Set<string>();
          const courseEntries: ColumnEntry[] = [];
          for (const edge of courseEdges) {
            const node = graph.nodes.find((n) => n.id === edge.from);
            if (!node || node.kind !== 'course') continue;
            if (seen.has(node.id)) continue;
            seen.add(node.id);
            courseEntries.push({
              course: node as PlanNode<'course'>,
              fromAnnotations: courseAnnotations.get(node.id) ?? [],
            });
          }
          courseEntries.sort((a, b) =>
            (a.course.data?.courseCode ?? '').localeCompare(b.course.data?.courseCode ?? ''),
          );

          const totalCredits = courseEntries.reduce(
            (sum, entry) => sum + (entry.course.data?.credits ?? 0),
            0,
          );
          const isPlanned = Boolean(term.data?.isPlanned);

          const termAnnotations = getIncomingEdges(graph, term.id, ['recommends'])
            .map((edge) => graph.nodes.find((n) => n.id === edge.from))
            .filter((node): node is PlanNode => Boolean(node));

          return (
            <div
              key={term.id}
              className={`flex w-64 shrink-0 flex-col rounded-xl border ${
                isPlanned
                  ? 'border-dashed border-chart-4/40 bg-chart-4/5'
                  : 'border-border bg-surface-2'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2 border-b border-border-subtle px-3 py-2">
                <div>
                  <div className="text-sm font-semibold text-foreground">{term.label}</div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {isPlanned ? 'Planned' : 'Past / current'}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{totalCredits} cr</div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
                {courseEntries.length === 0 && (
                  <p className="text-xs italic text-muted-foreground">No courses placed.</p>
                )}
                {courseEntries.map(({ course, fromAnnotations }) => {
                  const status: CourseStatus = course.data?.status ?? 'unknown';
                  return (
                    <div
                      key={course.id}
                      className={`rounded-md border px-2 py-1.5 text-xs ${STATUS_TONE[status]}`}
                    >
                      <div className="text-xs font-medium text-foreground">
                        {course.data?.title ?? course.label}
                      </div>
                      {course.data?.title && (
                        <div className="font-mono text-[10px] opacity-80">
                          {course.data.courseCode}
                        </div>
                      )}
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] opacity-80">
                        <span>{course.data?.credits ?? '?'} cr</span>
                        {course.data?.grade && <span>Grade {course.data.grade}</span>}
                      </div>
                      {fromAnnotations.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {fromAnnotations.map((note) => (
                            <div
                              key={note.id}
                              className="truncate text-[10px] text-muted-foreground"
                              title={(note.data as { body?: string } | undefined)?.body}
                            >
                              · {note.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {termAnnotations.length > 0 && (
                  <div className="space-y-1 border-t border-border-subtle pt-2">
                    {termAnnotations.map((note) => (
                      <div
                        key={note.id}
                        className="rounded border border-warning/30 bg-warning/10 px-2 py-1 text-[10px] text-warning"
                      >
                        <div className="font-semibold">{note.label}</div>
                        {(note.data as { body?: string } | undefined)?.body && (
                          <div className="mt-0.5 opacity-90">
                            {(note.data as { body?: string }).body}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {unscheduled.length > 0 && (
        <div className="rounded-lg border border-dashed border-border bg-surface-2 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Unscheduled ({unscheduled.length})
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {unscheduled.map((course) => (
              <span
                key={course.id}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_TONE[course.data?.status ?? 'unknown']}`}
                title={course.data?.title ?? course.label}
              >
                {course.data?.title ?? course.data?.courseCode ?? course.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
