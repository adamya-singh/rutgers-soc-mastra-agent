'use client';

import React from 'react';
import {
  emptyPlanGraph,
  validateDag,
  type AcademicPlanGraph,
  type DagValidation,
  type PlanEdge,
  type PlanNode,
} from '@/lib/planGraph/types';

type Action =
  | { type: 'replace'; graph: AcademicPlanGraph }
  | { type: 'upsertNode'; node: PlanNode }
  | { type: 'removeNode'; id: string }
  | { type: 'upsertEdge'; edge: PlanEdge }
  | { type: 'removeEdge'; id: string }
  | { type: 'clear' };

const reducer = (
  state: AcademicPlanGraph,
  action: Action,
): AcademicPlanGraph => {
  switch (action.type) {
    case 'replace':
      return action.graph;
    case 'clear':
      return emptyPlanGraph();
    case 'upsertNode': {
      const exists = state.nodes.some((node) => node.id === action.node.id);
      const nodes = exists
        ? state.nodes.map((node) =>
            node.id === action.node.id ? action.node : node,
          )
        : [...state.nodes, action.node];
      return { ...state, nodes };
    }
    case 'removeNode': {
      const nodes = state.nodes.filter((node) => node.id !== action.id);
      const edges = state.edges.filter(
        (edge) => edge.from !== action.id && edge.to !== action.id,
      );
      return { ...state, nodes, edges };
    }
    case 'upsertEdge': {
      const exists = state.edges.some((edge) => edge.id === action.edge.id);
      const edges = exists
        ? state.edges.map((edge) =>
            edge.id === action.edge.id ? action.edge : edge,
          )
        : [...state.edges, action.edge];
      return { ...state, edges };
    }
    case 'removeEdge': {
      return {
        ...state,
        edges: state.edges.filter((edge) => edge.id !== action.id),
      };
    }
    default:
      return state;
  }
};

type PlanGraphContextValue = {
  graph: AcademicPlanGraph;
  validation: DagValidation;
  replaceGraph: (graph: AcademicPlanGraph) => void;
  upsertNode: (node: PlanNode) => void;
  removeNode: (id: string) => void;
  upsertEdge: (edge: PlanEdge) => void;
  removeEdge: (id: string) => void;
  clear: () => void;
};

const PlanGraphContext = React.createContext<PlanGraphContextValue | null>(
  null,
);

export function PlanGraphProvider({
  initialGraph,
  children,
}: {
  initialGraph?: AcademicPlanGraph;
  children: React.ReactNode;
}) {
  const [graph, dispatch] = React.useReducer(
    reducer,
    initialGraph ?? emptyPlanGraph(),
  );

  const validation = React.useMemo(() => validateDag(graph), [graph]);

  const value = React.useMemo<PlanGraphContextValue>(
    () => ({
      graph,
      validation,
      replaceGraph: (next) => dispatch({ type: 'replace', graph: next }),
      upsertNode: (node) => dispatch({ type: 'upsertNode', node }),
      removeNode: (id) => dispatch({ type: 'removeNode', id }),
      upsertEdge: (edge) => dispatch({ type: 'upsertEdge', edge }),
      removeEdge: (id) => dispatch({ type: 'removeEdge', id }),
      clear: () => dispatch({ type: 'clear' }),
    }),
    [graph, validation],
  );

  return (
    <PlanGraphContext.Provider value={value}>
      {children}
    </PlanGraphContext.Provider>
  );
}

export function usePlanGraph(): PlanGraphContextValue {
  const ctx = React.useContext(PlanGraphContext);
  if (!ctx) {
    throw new Error(
      'usePlanGraph must be used inside <PlanGraphProvider>',
    );
  }
  return ctx;
}
