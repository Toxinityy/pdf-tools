import { RotateCw, Trash2, X } from 'lucide-react';
import { Thumb } from './Thumb';
import type { PageRef, SourceFile } from '../lib/pages';

export function FileCard({ file, first, count, onRemove }: {
  file: SourceFile; first: PageRef; count: number; onRemove: () => void;
}) {
  return (
    <>
      <span className="tag" style={{ background: file.color }} />
      <Thumb file={file} index={first.index} rotation={first.rotation} />
      <div className="card-body">
        <p className="card-title" title={file.name}>{file.name}</p>
        <p className="card-meta">
          {count === file.pageCount ? plural(count, 'page') : `${count} of ${file.pageCount} pages`}
        </p>
      </div>
      <button className="icon-btn corner" onClick={onRemove} aria-label={`Remove ${file.name}`} title="Remove file">
        <X size={18} aria-hidden />
      </button>
    </>
  );
}

export function PageCard({ file, page, position, onRotate, onDelete }: {
  file: SourceFile; page: PageRef; position: number; onRotate: () => void; onDelete: () => void;
}) {
  return (
    <>
      <span className="tag" style={{ background: file.color }} />
      <span className="badge" aria-hidden>{position}</span>
      <div className="actions">
        <button className="icon-btn" onClick={onRotate} aria-label={`Rotate page ${position}`} title="Rotate">
          <RotateCw size={18} aria-hidden />
        </button>
        <button className="icon-btn danger" onClick={onDelete} aria-label={`Delete page ${position}`} title="Delete">
          <Trash2 size={18} aria-hidden />
        </button>
      </div>
      <Thumb file={file} index={page.index} rotation={page.rotation} />
      <div className="card-body">
        <p className="card-meta" title={file.name}>
          <span className="dot" style={{ background: file.color }} aria-hidden />
          <span className="truncate">{file.name}</span>
          <span className="nowrap"> · p.{page.index + 1}</span>
        </p>
      </div>
    </>
  );
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Dark enough for white label text (≥ 4.5:1).
export const COLORS = ['#1d4ed8', '#be185d', '#047857', '#b45309', '#6d28d9', '#0e7490', '#b91c1c', '#4d7c0f'];
