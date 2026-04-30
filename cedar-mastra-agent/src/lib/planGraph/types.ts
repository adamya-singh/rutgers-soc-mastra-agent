/**
 * AcademicPlanGraph
 *
 * Canonical, view-agnostic shape used to describe a student's academic plan
 * as a directed acyclic graph (DAG). The frontend renders this through
 * multiple projections (tree, semester timeline, freeform DAG) and the
 * agent will eventually emit/extend the same shape.
 *
 * The graph models programs, requirements, courses, planned sections, terms,
 * and agent annotations (notes, recommendations, warnings, goals). Edges are
 * typed so views can choose which relationships to show.
 */

export type NodeKind =
  | 'program'
  | 'requirement'
  | 'course'
  | 'section'
  | 'term'
  | 'note'
  | 'recommendation'
  | 'warning'
  | 'goal';

export type EdgeKind =
  | 'contains'
  | 'satisfies'
  | 'planned_in'
  | 'prerequisite_for'
  | 'alternative_to'
  | 'recommends'
  | 'conflicts_with';

export type CourseStatus =
  | 'completed'
  | 'in_progress'
  | 'planned'
  | 'recommended'
  | 'unmet'
  | 'unknown';

export type RequirementStatus =
  | 'complete'
  | 'projected'
  | 'in_progress'
  | 'incomplete'
  | 'unknown';

export type ProgramData = {
  programCode?: string;
  kind?: 'core' | 'major' | 'minor' | 'certificate' | 'other';
  campus?: string;
  versionTerm?: string;
  overallStatus?: string;
  gpa?: number;
};

export type RequirementData = {
  status?: RequirementStatus;
  summary?: string;
  completedCount?: number;
  totalCount?: number;
  neededCount?: number;
};

export type CourseData = {
  courseCode: string;
  title?: string;
  credits?: number;
  status?: CourseStatus;
  grade?: string;
  termLabel?: string;
};

export type SectionData = {
  indexNumber: string;
  sectionNumber?: string | null;
  instructors?: string[] | null;
  isOnline?: boolean | null;
  campus?: string | null;
};

export type TermData = {
  /** Sortable key, e.g. 2025.9 for Fall 2025. */
  termKey: number;
  termCode?: string;
  termYear?: number;
  termLabel?: string;
  isPlanned?: boolean;
};

export type AnnotationSeverity = 'info' | 'warn' | 'critical';

export type AnnotationData = {
  body?: string;
  severity?: AnnotationSeverity;
  source?: 'agent' | 'student' | 'system';
};

export type PlanNodeDataByKind = {
  program: ProgramData;
  requirement: RequirementData;
  course: CourseData;
  section: SectionData;
  term: TermData;
  note: AnnotationData;
  recommendation: AnnotationData;
  warning: AnnotationData;
  goal: AnnotationData;
};

export type PlanNode<K extends NodeKind = NodeKind> = {
  id: string;
  kind: K;
  label: string;
  data?: PlanNodeDataByKind[K] & Record<string, unknown>;
};

export type PlanEdge = {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
};

export type AcademicPlanGraph = {
  version: 1;
  nodes: PlanNode[];
  edges: PlanEdge[];
  rootIds?: string[];
  meta?: {
    title?: string;
    capturedAt?: string;
    source?: 'mock' | 'derived' | 'agent' | 'manual';
  };
};

/* -------------------------------------------------------------------------- */
/*  Selectors                                                                 */
/* -------------------------------------------------------------------------- */

export const getNodeById = (
  graph: AcademicPlanGraph,
  id: string,
): PlanNode | undefined => graph.nodes.find((node) => node.id === id);

export const getNodesByKind = <K extends NodeKind>(
  graph: AcademicPlanGraph,
  kind: K,
): PlanNode<K>[] =>
  graph.nodes.filter((node): node is PlanNode<K> => node.kind === kind);

export const getOutgoingEdges = (
  graph: AcademicPlanGraph,
  id: string,
  kinds?: ReadonlyArray<EdgeKind>,
): PlanEdge[] =>
  graph.edges.filter(
    (edge) => edge.from === id && (!kinds || kinds.includes(edge.kind)),
  );

export const getIncomingEdges = (
  graph: AcademicPlanGraph,
  id: string,
  kinds?: ReadonlyArray<EdgeKind>,
): PlanEdge[] =>
  graph.edges.filter(
    (edge) => edge.to === id && (!kinds || kinds.includes(edge.kind)),
  );

export const getChildren = (
  graph: AcademicPlanGraph,
  id: string,
  kinds?: ReadonlyArray<EdgeKind>,
): PlanNode[] => {
  const seen = new Set<string>();
  const result: PlanNode[] = [];
  for (const edge of getOutgoingEdges(graph, id, kinds)) {
    if (seen.has(edge.to)) continue;
    seen.add(edge.to);
    const node = getNodeById(graph, edge.to);
    if (node) result.push(node);
  }
  return result;
};

export const getParents = (
  graph: AcademicPlanGraph,
  id: string,
  kinds?: ReadonlyArray<EdgeKind>,
): PlanNode[] => {
  const seen = new Set<string>();
  const result: PlanNode[] = [];
  for (const edge of getIncomingEdges(graph, id, kinds)) {
    if (seen.has(edge.from)) continue;
    seen.add(edge.from);
    const node = getNodeById(graph, edge.from);
    if (node) result.push(node);
  }
  return result;
};

/* -------------------------------------------------------------------------- */
/*  Algorithms                                                                */
/* -------------------------------------------------------------------------- */

export type DagValidation =
  | { ok: true }
  | { ok: false; reason: string; cycle?: string[] };

/**
 * Returns a topological order of node ids, treating every edge as a dependency
 * from `from` to `to`. Returns `null` if a cycle is present.
 */
export function topoSort(graph: AcademicPlanGraph): string[] | null {
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of graph.nodes) {
    indegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (!indegree.has(edge.from) || !indegree.has(edge.to)) continue;
    adjacency.get(edge.from)!.push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  indegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  return order.length === graph.nodes.length ? order : null;
}

/**
 * Validates that the graph is a DAG, all edge endpoints exist, and node ids
 * are unique. Returns a typed result that callers (the JSON inspector,
 * builders) can render or throw on.
 */
export function validateDag(graph: AcademicPlanGraph): DagValidation {
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (ids.has(node.id)) {
      return { ok: false, reason: `Duplicate node id: ${node.id}` };
    }
    ids.add(node.id);
  }
  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      return { ok: false, reason: `Duplicate edge id: ${edge.id}` };
    }
    edgeIds.add(edge.id);
    if (!ids.has(edge.from)) {
      return {
        ok: false,
        reason: `Edge ${edge.id} references missing node from=${edge.from}`,
      };
    }
    if (!ids.has(edge.to)) {
      return {
        ok: false,
        reason: `Edge ${edge.id} references missing node to=${edge.to}`,
      };
    }
    if (edge.from === edge.to) {
      return {
        ok: false,
        reason: `Self loop on node ${edge.from} via edge ${edge.id}`,
      };
    }
  }

  const order = topoSort(graph);
  if (order === null) {
    return {
      ok: false,
      reason: 'Cycle detected; AcademicPlanGraph must be a DAG',
    };
  }
  return { ok: true };
}

export function assertDag(graph: AcademicPlanGraph): void {
  const result = validateDag(graph);
  if (!result.ok) {
    throw new Error(`Invalid AcademicPlanGraph: ${result.reason}`);
  }
}

/* -------------------------------------------------------------------------- */
/*  Empty / merge helpers                                                     */
/* -------------------------------------------------------------------------- */

export const emptyPlanGraph = (): AcademicPlanGraph => ({
  version: 1,
  nodes: [],
  edges: [],
  rootIds: [],
  meta: { source: 'manual' },
});

export const isPlanGraph = (value: unknown): value is AcademicPlanGraph => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<AcademicPlanGraph>;
  return (
    v.version === 1 && Array.isArray(v.nodes) && Array.isArray(v.edges)
  );
};
