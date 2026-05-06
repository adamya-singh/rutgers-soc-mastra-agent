import React, { useState } from 'react';
import { ChevronRight, Wrench, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from 'cedar-os';

type ToolState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error';

export interface ToolPartLike {
  type: string;
  state?: ToolState;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  toolCallId?: string;
}

interface ToolPartProps {
  part: ToolPartLike;
}

function getToolDisplayName(part: ToolPartLike): string {
  if (part.type === 'dynamic-tool') {
    return part.toolName ?? 'tool';
  }
  return part.type.replace(/^tool-/, '');
}

function formatJson(value: unknown): string {
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export const ToolPart: React.FC<ToolPartProps> = ({ part }) => {
  const [open, setOpen] = useState(false);
  const state: ToolState = part.state ?? 'output-available';
  const name = getToolDisplayName(part);

  const hasInput = part.input !== undefined && part.input !== null;
  const hasOutput = part.output !== undefined && part.output !== null;
  const hasError = state === 'output-error' && Boolean(part.errorText);

  const renderStatus = () => {
    if (state === 'input-streaming' || state === 'input-available') {
      return (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="animate-pulse">
            {state === 'input-streaming' ? 'preparing' : 'running'}
          </span>
        </span>
      );
    }
    if (state === 'output-error') {
      return (
        <span className="flex items-center gap-1 text-destructive">
          <AlertTriangle className="h-3 w-3" />
          error
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-success">
        <CheckCircle2 className="h-3 w-3" />
        done
      </span>
    );
  };

  return (
    <div className="my-2 rounded-lg border border-border-subtle bg-surface-2/60">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs',
          'text-muted-foreground transition-colors hover:text-foreground',
        )}
      >
        <ChevronRight
          className={cn('h-3 w-3 transition-transform', open && 'rotate-90')}
        />
        <Wrench className="h-3 w-3" />
        <span className="font-mono text-foreground/90">{name}</span>
        <span className="ml-auto text-[11px]">{renderStatus()}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border-subtle px-3 py-2 text-xs">
          {hasInput && (
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                Input
              </div>
              <pre className="overflow-x-auto rounded-md border border-border-subtle bg-surface-1 p-2 font-mono text-[11px] text-foreground/90">
                {formatJson(part.input)}
              </pre>
            </div>
          )}
          {hasOutput && (
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                Output
              </div>
              <pre className="overflow-x-auto rounded-md border border-border-subtle bg-surface-1 p-2 font-mono text-[11px] text-foreground/90">
                {formatJson(part.output)}
              </pre>
            </div>
          )}
          {hasError && (
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-destructive">
                Error
              </div>
              <pre className="overflow-x-auto rounded-md border border-destructive/30 bg-destructive/10 p-2 font-mono text-[11px] text-destructive">
                {part.errorText}
              </pre>
            </div>
          )}
          {!hasInput && !hasOutput && !hasError && (
            <div className="text-[11px] text-muted-foreground">No payload yet.</div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToolPart;
