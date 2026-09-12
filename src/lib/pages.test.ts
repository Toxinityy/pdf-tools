import { describe, expect, it } from 'vitest';
import {
  deletePage, fileOrder, initialState, movePage, moveFile, pagesForFile, reducer, removeFile, rotatePage,
  type PageRef, type SourceFile,
} from './pages';

const ids = (pages: PageRef[]) => pages.map((p) => `${p.fileId}${p.index}`);
const file = (id: string, pageCount: number): SourceFile =>
  ({ id, name: `${id}.pdf`, bytes: new Uint8Array(), pageCount, color: '#000' });

// a: 2 pages, b: 3 pages
const start = () => [...pagesForFile('a', 2), ...pagesForFile('b', 3)];

describe('page list', () => {
  it('creates one page per source page, unrotated', () => {
    expect(ids(start())).toEqual(['a0', 'a1', 'b0', 'b1', 'b2']);
    expect(start().every((p) => p.rotation === 0)).toBe(true);
  });

  it('moves a page to another page position', () => {
    const p = start();
    expect(ids(movePage(p, p[4].id, p[0].id))).toEqual(['b2', 'a0', 'a1', 'b0', 'b1']);
    expect(ids(movePage(p, p[0].id, p[2].id))).toEqual(['a1', 'b0', 'a0', 'b1', 'b2']);
  });

  it('rotates clockwise and wraps at 360', () => {
    let p = start();
    const id = p[1].id;
    for (let i = 0; i < 3; i++) p = rotatePage(p, id);
    expect(p[1].rotation).toBe(270);
    expect(rotatePage(p, id)[1].rotation).toBe(0);
  });

  it('deletes a page and removes a whole file', () => {
    const p = start();
    expect(ids(deletePage(p, p[0].id))).toEqual(['a1', 'b0', 'b1', 'b2']);
    expect(ids(removeFile(p, 'a'))).toEqual(['b0', 'b1', 'b2']);
  });

  it('orders files by first appearance', () => {
    const p = start();
    expect(fileOrder(movePage(p, p[2].id, p[0].id))).toEqual(['b', 'a']);
  });

  it('moves a file as one block, keeping its page order', () => {
    const p = start();
    expect(ids(moveFile(p, 'b', 'a'))).toEqual(['b0', 'b1', 'b2', 'a0', 'a1']);
    // interleaved pages regroup by file
    const mixed = movePage(p, p[2].id, p[0].id); // b0 a0 a1 b1 b2
    expect(ids(moveFile(mixed, 'a', 'b'))).toEqual(['a0', 'a1', 'b0', 'b1', 'b2']);
  });
});

describe('reducer', () => {
  it('adds files, then undoes back to empty', () => {
    let s = reducer(initialState, { type: 'add', files: [file('a', 2)] });
    expect(ids(s.pages)).toEqual(['a0', 'a1']);
    s = reducer(s, { type: 'set', pages: deletePage(s.pages, s.pages[0].id) });
    expect(ids(s.pages)).toEqual(['a1']);
    s = reducer(s, { type: 'undo' });
    expect(ids(s.pages)).toEqual(['a0', 'a1']);
    s = reducer(s, { type: 'undo' });
    expect(s.pages).toEqual([]);
    expect(reducer(s, { type: 'undo' })).toBe(s); // nothing left to undo
  });

  it('keeps file bytes after removal so undo can restore them', () => {
    let s = reducer(initialState, { type: 'add', files: [file('a', 1)] });
    s = reducer(s, { type: 'set', pages: removeFile(s.pages, 'a') });
    expect(s.files.a).toBeDefined();
  });
});
