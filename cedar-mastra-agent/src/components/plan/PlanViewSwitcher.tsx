'use client';

import React from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/cedar/components/ui/tabs';
import { TreeView } from './views/TreeView';
import { TimelineView } from './views/TimelineView';
import { GraphView } from './views/GraphView';

export type PlanViewId = 'tree' | 'timeline' | 'dag';

const VIEWS: Array<{ id: PlanViewId; label: string }> = [
  { id: 'tree', label: 'Tree' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'dag', label: 'DAG' },
];

export function PlanViewSwitcher({
  defaultView = 'tree',
}: {
  defaultView?: PlanViewId;
}) {
  return (
    <Tabs
      defaultValue={defaultView}
      className="flex h-full min-h-0 flex-col gap-3"
    >
      <TabsList>
        {VIEWS.map((view) => (
          <TabsTrigger key={view.id} value={view.id}>
            {view.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent
        value="tree"
        className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-surface-1"
      >
        <TreeView />
      </TabsContent>
      <TabsContent
        value="timeline"
        className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-surface-1"
      >
        <TimelineView />
      </TabsContent>
      <TabsContent
        value="dag"
        className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-surface-1"
      >
        <GraphView />
      </TabsContent>
    </Tabs>
  );
}
