'use client';

import React from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import { usePlanGraph } from '@/components/plan/PlanGraphProvider';
import type {
  AcademicPlanGraph,
  EdgeKind,
  NodeKind,
  PlanEdge,
  PlanNode,
} from '@/lib/planGraph/types';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 64;

const NODE_STYLES: Record<NodeKind, { background: string; border: string; color: string }> = {
  program: { background: '#cc0033', border: '#a8002b', color: '#ffffff' },
  requirement: { background: '#1f2937', border: '#0b1220', color: '#f8fafc' },
  course: { background: '#ffffff', border: '#cbd5e1', color: '#0b1220' },
  section: { background: '#ede9fe', border: '#a78bfa', color: '#312e81' },
  term: { background: '#ecfeff', border: '#22d3ee', color: '#155e75' },
  note: { background: '#f1f5f9', border: '#cbd5e1', color: '#0f172a' },
  recommendation: { background: '#ecfdf5', border: '#10b981', color: '#065f46' },
  warning: { background: '#fffbeb', border: '#f59e0b', color: '#78350f' },
  goal: { background: '#fef2f2', border: '#ef4444', color: '#7f1d1d' },
};

const EDGE_STYLES: Record<EdgeKind, { stroke: string; dash?: string; label?: string }> = {
  contains: { stroke: '#94a3b8' },
  satisfies: { stroke: '#0ea5e9' },
  planned_in: { stroke: '#a78bfa' },
  prerequisite_for: { stroke: '#22c55e' },
  alternative_to: { stroke: '#f97316', dash: '4 4' },
  recommends: { stroke: '#10b981', dash: '6 3' },
  conflicts_with: { stroke: '#ef4444', dash: '2 4' },
};

type Direction = 'LR' | 'TB';

function nodeLabel(node: PlanNode): string {
  if (node.kind === 'course') {
    const data = node.data as { courseCode?: string; title?: string } | undefined;
    if (data?.courseCode) {
      return data.title ? `${data.title}\n${data.courseCode}` : data.courseCode;
    }
  }
  return node.label;
}

function buildLayout(
  graph: AcademicPlanGraph,
  direction: Direction,
): { nodes: Node[]; edges: Edge[] } {
  const dag = new dagre.graphlib.Graph();
  dag.setDefaultEdgeLabel(() => ({}));
  dag.setGraph({ rankdir: direction, nodesep: 40, ranksep: 60 });

  for (const node of graph.nodes) {
    dag.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of graph.edges) {
    if (graph.nodes.find((n) => n.id === edge.from) && graph.nodes.find((n) => n.id === edge.to)) {
      dag.setEdge(edge.from, edge.to);
    }
  }

  dagre.layout(dag);

  const nodes: Node[] = graph.nodes.map((node) => {
    const layout = dag.node(node.id);
    const style = NODE_STYLES[node.kind];
    return {
      id: node.id,
      position: {
        x: (layout?.x ?? 0) - NODE_WIDTH / 2,
        y: (layout?.y ?? 0) - NODE_HEIGHT / 2,
      },
      data: { label: nodeLabel(node) },
      style: {
        width: NODE_WIDTH,
        background: style.background,
        border: `1px solid ${style.border}`,
        color: style.color,
        borderRadius: 8,
        padding: 8,
        fontSize: 11,
        lineHeight: 1.2,
        whiteSpace: 'pre-wrap',
        textAlign: 'center',
      },
    };
  });

  const edges: Edge[] = graph.edges.map((edge: PlanEdge) => {
    const style = EDGE_STYLES[edge.kind];
    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: edge.label,
      animated: edge.kind === 'recommends',
      style: {
        stroke: style.stroke,
        strokeDasharray: style.dash,
        strokeWidth: 1.5,
      },
      labelStyle: { fontSize: 10 },
      labelBgStyle: { fill: 'rgba(255,255,255,0.85)' },
    };
  });

  return { nodes, edges };
}

const NODE_KINDS: NodeKind[] = [
  'program',
  'requirement',
  'course',
  'section',
  'term',
  'recommendation',
  'warning',
  'goal',
  'note',
];

const EDGE_KINDS: EdgeKind[] = [
  'contains',
  'satisfies',
  'planned_in',
  'prerequisite_for',
  'alternative_to',
  'recommends',
  'conflicts_with',
];

function GraphLegend() {
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 max-w-[220px] rounded-lg border border-border bg-surface-1/90 p-3 text-[11px] shadow-elev-1 backdrop-blur">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Nodes
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
        {NODE_KINDS.map((kind) => (
          <div key={kind} className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-sm"
              style={{
                background: NODE_STYLES[kind].background,
                border: `1px solid ${NODE_STYLES[kind].border}`,
              }}
            />
            <span className="capitalize text-foreground/80">{kind}</span>
          </div>
        ))}
      </div>
      <div className="mb-1 mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Edges
      </div>
      <div className="space-y-0.5">
        {EDGE_KINDS.map((kind) => (
          <div key={kind} className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-5"
              style={{
                background: EDGE_STYLES[kind].stroke,
                opacity: EDGE_STYLES[kind].dash ? 0.7 : 1,
              }}
            />
            <span className="text-foreground/80">{kind.replace(/_/g, ' ')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GraphCanvas() {
  const { graph, validation } = usePlanGraph();
  const [direction, setDirection] = React.useState<Direction>('LR');

  const { nodes, edges } = React.useMemo(() => {
    if (!validation.ok) return { nodes: [] as Node[], edges: [] as Edge[] };
    return buildLayout(graph, direction);
  }, [graph, direction, validation.ok]);

  if (!validation.ok) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-destructive">
        Cannot render graph: {validation.reason}
      </div>
    );
  }

  if (graph.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Empty graph. Load mock or your data to see the DAG.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-border bg-surface-1/90 p-1 text-xs shadow-elev-1 backdrop-blur">
        <button
          type="button"
          onClick={() => setDirection('LR')}
          className={`rounded-md px-2 py-1 transition ${
            direction === 'LR'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-surface-2'
          }`}
        >
          Horizontal
        </button>
        <button
          type="button"
          onClick={() => setDirection('TB')}
          className={`rounded-md px-2 py-1 transition ${
            direction === 'TB'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-surface-2'
          }`}
        >
          Vertical
        </button>
      </div>
      <GraphLegend />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls position="bottom-right" showInteractive={false} />
        <MiniMap pannable zoomable position="bottom-left" />
      </ReactFlow>
    </div>
  );
}

export function GraphView() {
  return (
    <ReactFlowProvider>
      <GraphCanvas />
    </ReactFlowProvider>
  );
}
