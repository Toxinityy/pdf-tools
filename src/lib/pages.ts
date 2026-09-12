// Pure page-list logic. `pages` is the output order; everything else is derived from it.
import { arrayMove } from '@dnd-kit/sortable';

export type Rotation = 0 | 90 | 180 | 270;
export type SourceFile = { id: string; name: string; bytes: Uint8Array; pageCount: number; color: string };
export type PageRef = { id: string; fileId: string; index: number; rotation: Rotation };

export const pagesForFile = (fileId: string, count: number): PageRef[] =>
  Array.from({ length: count }, (_, index) => ({ id: crypto.randomUUID(), fileId, index, rotation: 0 }));

export function movePage(pages: PageRef[], fromId: string, toId: string): PageRef[] {
  return arrayMove(pages, pages.findIndex((p) => p.id === fromId), pages.findIndex((p) => p.id === toId));
}

export const rotatePage = (pages: PageRef[], id: string): PageRef[] =>
  pages.map((p) => (p.id === id ? { ...p, rotation: ((p.rotation + 90) % 360) as Rotation } : p));

export const deletePage = (pages: PageRef[], id: string) => pages.filter((p) => p.id !== id);

export const removeFile = (pages: PageRef[], fileId: string) => pages.filter((p) => p.fileId !== fileId);

export const fileOrder = (pages: PageRef[]) => [...new Set(pages.map((p) => p.fileId))];

// Moving a file regroups the list by file: each file's pages become one contiguous block.
export function moveFile(pages: PageRef[], fromFileId: string, toFileId: string): PageRef[] {
  const order = fileOrder(pages);
  const next = arrayMove(order, order.indexOf(fromFileId), order.indexOf(toFileId));
  return next.flatMap((id) => pages.filter((p) => p.fileId === id));
}

// App state. `files` is append-only so undo can bring back removed files.
export type State = { files: Record<string, SourceFile>; pages: PageRef[]; past: PageRef[][] };
export type Action =
  | { type: 'add'; files: SourceFile[] }
  | { type: 'set'; pages: PageRef[] }
  | { type: 'undo' };

export const initialState: State = { files: {}, pages: [], past: [] };
const HISTORY = 50;

export function reducer(s: State, a: Action): State {
  const push = (pages: PageRef[]) => ({ pages, past: [...s.past, s.pages].slice(-HISTORY) });
  switch (a.type) {
    case 'add':
      return {
        files: { ...s.files, ...Object.fromEntries(a.files.map((f) => [f.id, f])) },
        ...push([...s.pages, ...a.files.flatMap((f) => pagesForFile(f.id, f.pageCount))]),
      };
    case 'set':
      return { ...s, ...push(a.pages) };
    case 'undo':
      return s.past.length ? { ...s, pages: s.past[s.past.length - 1], past: s.past.slice(0, -1) } : s;
  }
}
