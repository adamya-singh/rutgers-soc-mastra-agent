'use client';

import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { usePlanGraph } from '@/components/plan/PlanGraphProvider';
import {
  getChildren,
  getNodesByKind,
  type AcademicPlanGraph,
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

const STATUS_LABEL: Record<CourseStatus, string> = {
  completed: 'Completed',
  in_progress: 'In progress',
  planned: 'Planned',
  recommended: 'Recommended',
  unmet: 'Unmet',
  unknown: 'Unknown',
};

function CourseRow({ node }: { node: PlanNode<'course'> }) {
  const data = node.data;
  const status: CourseStatus = data?.status ?? 'unknown';
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border-subtle bg-surface-1 px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {data?.title ?? node.label}
        </div>
        {data?.title && (
          <div className="font-mono text-xs text-muted-foreground">{data.courseCode}</div>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {data?.credits !== undefined && <span>{data.credits} cr</span>}
          {data?.termLabel && <span>{data.termLabel}</span>}
          {data?.grade && <span>Grade {data.grade}</span>}
        </div>
      </div>
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_TONE[status]}`}
      >
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}

function AnnotationRow({ node }: { node: PlanNode }) {
  const data = node.data as { body?: string; severity?: string } | undefined;
  const severity = data?.severity ?? 'info';
  const tone =
    severity === 'critical'
      ? 'border-destructive/40 bg-destructive/10 text-destructive'
      : severity === 'warn'
        ? 'border-warning/40 bg-warning/10 text-warning'
        : 'border-chart-2/40 bg-chart-2/10 text-chart-2';
  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${tone}`}>
      <div className="font-semibold uppercase tracking-wide opacity-80">{node.kind}</div>
      <div className="mt-0.5 text-sm font-medium">{node.label}</div>
      {data?.body && <div className="mt-1 text-xs opacity-90">{data.body}</div>}
    </div>
  );
}

type CollapsibleProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

function Collapsible({ title, subtitle, defaultOpen, children }: CollapsibleProps) {
  const [open, setOpen] = React.useState(defaultOpen ?? false);
  return (
    <div className="rounded-lg border border-border bg-surface-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-surface-3"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {open ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
          {title}
        </div>
        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      </button>
      {open && <div className="space-y-2 px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

function RequirementBlock({
  graph,
  requirement,
}: {
  graph: AcademicPlanGraph;
  requirement: PlanNode<'requirement'>;
}) {
  const courses = getChildren(graph, requirement.id, ['satisfies']).filter(
    (n): n is PlanNode<'course'> => n.kind === 'course',
  );
  const noteChildren = getChildren(graph, requirement.id, ['contains']);

  const data = requirement.data;
  const subtitle = (() => {
    const parts: string[] = [];
    if (data?.completedCount !== undefined && data?.totalCount !== undefined) {
      parts.push(`${data.completedCount}/${data.totalCount} satisfied`);
    } else if (data?.completedCount !== undefined) {
      parts.push(`${data.completedCount} courses`);
    }
    if (data?.neededCount && data.neededCount > 0) {
      parts.push(`${data.neededCount} still needed`);
    }
    if (data?.status) parts.push(data.status);
    return parts.join(' · ');
  })();

  return (
    <Collapsible title={requirement.label} subtitle={subtitle} defaultOpen={false}>
      {data?.summary && <p className="text-xs text-muted-foreground">{data.summary}</p>}
      {courses.length === 0 && noteChildren.length === 0 && (
        <p className="text-xs italic text-muted-foreground">No courses linked yet.</p>
      )}
      <div className="space-y-2">
        {courses.map((course) => (
          <CourseRow key={course.id} node={course} />
        ))}
        {noteChildren.map((note) => (
          <AnnotationRow key={note.id} node={note} />
        ))}
      </div>
    </Collapsible>
  );
}

function ProgramBlock({
  graph,
  program,
}: {
  graph: AcademicPlanGraph;
  program: PlanNode<'program'>;
}) {
  const requirements = getChildren(graph, program.id, ['contains']).filter(
    (n): n is PlanNode<'requirement'> => n.kind === 'requirement',
  );
  const data = program.data;

  const subtitleParts: string[] = [];
  if (data?.programCode) subtitleParts.push(data.programCode);
  if (data?.versionTerm) subtitleParts.push(data.versionTerm);
  if (data?.gpa !== undefined) subtitleParts.push(`GPA ${data.gpa.toFixed(3)}`);

  return (
    <Collapsible defaultOpen title={program.label} subtitle={subtitleParts.join(' · ')}>
      {data?.overallStatus && <p className="text-xs text-muted-foreground">{data.overallStatus}</p>}
      <div className="space-y-2">
        {requirements.map((req) => (
          <RequirementBlock key={req.id} graph={graph} requirement={req} />
        ))}
      </div>
    </Collapsible>
  );
}

export function TreeView() {
  const { graph } = usePlanGraph();
  const programs = getNodesByKind(graph, 'program');
  const annotations = [
    ...getNodesByKind(graph, 'recommendation'),
    ...getNodesByKind(graph, 'warning'),
    ...getNodesByKind(graph, 'goal'),
  ];

  if (programs.length === 0 && graph.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Empty graph. Load mock or your data to see the tree.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {programs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface-2 p-4 text-sm text-muted-foreground">
          No program nodes in the graph. The tree view groups data under programs.
        </div>
      ) : (
        programs.map((program) => <ProgramBlock key={program.id} graph={graph} program={program} />)
      )}

      {annotations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Agent annotations
          </h3>
          <div className="space-y-2">
            {annotations.map((note) => (
              <AnnotationRow key={note.id} node={note} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
