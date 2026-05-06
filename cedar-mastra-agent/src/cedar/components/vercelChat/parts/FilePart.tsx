import React from 'react';
import Image from 'next/image';
import { Paperclip } from 'lucide-react';

export interface FilePartLike {
  type: 'file';
  mediaType: string;
  url: string;
  filename?: string;
}

interface FilePartProps {
  part: FilePartLike;
}

export const FilePart: React.FC<FilePartProps> = ({ part }) => {
  const isImage = part.mediaType.startsWith('image/');
  if (isImage) {
    return (
      <div className="my-2">
        <Image
          src={part.url}
          alt={part.filename ?? 'Uploaded image'}
          width={640}
          height={360}
          unoptimized
          className="max-h-72 w-auto max-w-full rounded-lg border border-border-subtle object-contain"
        />
      </div>
    );
  }

  return (
    <a
      href={part.url}
      target="_blank"
      rel="noopener noreferrer"
      className="my-2 inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-2 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
    >
      <Paperclip className="h-3.5 w-3.5" />
      <span className="max-w-[16rem] truncate">{part.filename ?? part.mediaType}</span>
    </a>
  );
};

export default FilePart;
