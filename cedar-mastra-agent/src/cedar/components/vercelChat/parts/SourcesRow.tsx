import React from 'react';
import { ExternalLink, FileText } from 'lucide-react';

export interface SourceUrlLike {
  type: 'source-url';
  sourceId: string;
  url: string;
  title?: string;
}

export interface SourceDocumentLike {
  type: 'source-document';
  sourceId: string;
  mediaType: string;
  title: string;
  filename?: string;
}

export type SourceLike = SourceUrlLike | SourceDocumentLike;

interface SourcesRowProps {
  sources: SourceLike[];
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export const SourcesRow: React.FC<SourcesRowProps> = ({ sources }) => {
  if (sources.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-2">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Sources
      </span>
      {sources.map((source) => {
        if (source.type === 'source-url') {
          const label = source.title || getHostname(source.url);
          return (
            <a
              key={source.sourceId}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-[18rem] items-center gap-1.5 rounded-full border border-border-subtle bg-surface-2 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{label}</span>
            </a>
          );
        }
        return (
          <span
            key={source.sourceId}
            className="inline-flex max-w-[18rem] items-center gap-1.5 rounded-full border border-border-subtle bg-surface-2 px-2 py-1 text-[11px] text-muted-foreground"
          >
            <FileText className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{source.filename ?? source.title}</span>
          </span>
        );
      })}
    </div>
  );
};

export default SourcesRow;
