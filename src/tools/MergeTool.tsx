import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Download, FilePlus2, Files, LayoutGrid, Loader2, Undo2 } from 'lucide-react';
import { SortableGrid } from '../components/SortableGrid';
import { COLORS, FileCard, PageCard, plural } from '../components/Cards';
import { DropOverlay, DropZone } from '../components/DropZone';
import { Toast, useToast } from '../components/Toast';
import { mergePages, readPdf } from '../lib/pdf';
import { baseName, describeError, download } from '../lib/files';
import { useFileDrop } from '../lib/useFileDrop';
import {
  deletePage, fileOrder, initialState, moveFile, movePage, reducer, removeFile, rotatePage,
  type PageRef, type SourceFile,
} from '../lib/pages';

export function MergeTool({ active }: { active: boolean }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { files, pages, past } = state;
  const [view, setView] = useState<'files' | 'pages'>('files');
  const [name, setName] = useState('merged');
  const [busy, setBusy] = useState<'reading' | 'merging' | null>(null);
  const { toast, show, hide } = useToast();
  const input = useRef<HTMLInputElement>(null);

  const undo = useCallback(() => { dispatch({ type: 'undo' }); hide(); }, [hide]);
  const setPages = (next: PageRef[], undoText?: string) => {
    dispatch({ type: 'set', pages: next });
    if (undoText) show({ text: undoText, kind: 'info', undo });
  };

  const addFiles = async (list: File[]) => {
    setBusy('reading');
    const added: SourceFile[] = [];
    const errors: string[] = [];
    const used = Object.keys(files).length;
    for (const f of list) {
      try {
        const { bytes, pageCount } = await readPdf(f);
        added.push({ id: crypto.randomUUID(), name: f.name, bytes, pageCount, color: COLORS[(used + added.length) % COLORS.length] });
      } catch (e) {
        errors.push(describeError(e, f.name));
      }
    }
    if (added.length) dispatch({ type: 'add', files: added });
    if (errors.length) show({ text: errors.join(' '), kind: 'error' });
    setBusy(null);
  };

  const merge = async () => {
    setBusy('merging');
    const out = `${baseName(name, 'merged')}.pdf`;
    try {
      download(await mergePages(pages, files), out, 'application/pdf');
      show({ text: `Saved ${out} (${plural(pages.length, 'page')}).`, kind: 'info' });
    } catch {
      show({ text: 'Merging failed. Try removing files one at a time to find the one causing trouble.', kind: 'error' });
    }
    setBusy(null);
  };

  const dragging = useFileDrop(active, addFiles);

  // Ctrl/Cmd+Z undoes, except while typing in a field.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey
        && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, undo]);

  const order = fileOrder(pages);
  const empty = pages.length === 0;
  const pick = () => input.current?.click();

  return (
    <>
      <header className="header">
        <div>
          <h1 tabIndex={-1}>Merge PDF</h1>
          <p className="subtitle">Put your files in order, then merge them into one PDF.</p>
        </div>
        {!empty && (
          <div className="toolbar">
            <div className="segmented" role="group" aria-label="View">
              <button aria-pressed={view === 'files'} onClick={() => setView('files')}>
                <Files size={18} aria-hidden /> Files
              </button>
              <button aria-pressed={view === 'pages'} onClick={() => setView('pages')}>
                <LayoutGrid size={18} aria-hidden /> Pages
              </button>
            </div>
            <button className="btn" onClick={undo} disabled={!past.length}>
              <Undo2 size={18} aria-hidden /> Undo
            </button>
            <button className="btn" onClick={pick}>
              <FilePlus2 size={18} aria-hidden /> Add files
            </button>
          </div>
        )}
      </header>

      <input
        ref={input} type="file" accept="application/pdf,.pdf" multiple hidden
        onChange={(e) => { if (e.target.files) addFiles([...e.target.files]); e.target.value = ''; }}
      />

      <main className="main">
        {empty ? (
          <DropZone
            title="Drop PDF files here" button="Choose files" busy={busy === 'reading'} onPick={pick}
            steps={['Add PDFs', 'Drag to arrange', 'Merge & download']}
          />
        ) : view === 'files' ? (
          <>
            <p className="hint">Drag files to set the order. Switch to <b>Pages</b> to rotate, delete or move single pages.</p>
            <SortableGrid
              items={order}
              getId={(id) => id}
              label={(id) => files[id].name}
              onMove={(from, to) => setPages(moveFile(pages, from, to))}
            >
              {(id) => {
                const own = pages.filter((p) => p.fileId === id);
                return (
                  <FileCard
                    file={files[id]} first={own[0]} count={own.length}
                    onRemove={() => setPages(removeFile(pages, id), `Removed ${files[id].name}.`)}
                  />
                );
              }}
            </SortableGrid>
          </>
        ) : (
          <>
            <p className="hint">Drag pages to reorder them. The number shows each page's place in the merged file.</p>
            <SortableGrid
              items={pages}
              getId={(p) => p.id}
              label={(p) => `Page ${p.index + 1} of ${files[p.fileId].name}`}
              onMove={(from, to) => setPages(movePage(pages, from, to))}
            >
              {(p) => (
                <PageCard
                  file={files[p.fileId]} page={p} position={pages.indexOf(p) + 1}
                  onRotate={() => setPages(rotatePage(pages, p.id))}
                  onDelete={() => setPages(deletePage(pages, p.id), `Deleted page ${pages.indexOf(p) + 1}.`)}
                />
              )}
            </SortableGrid>
          </>
        )}
      </main>

      {!empty && (
        <footer className="exportbar">
          <p className="summary">{plural(order.length, 'file')} · {plural(pages.length, 'page')}</p>
          <label className="field">
            <span>File name</span>
            <span className="input-wrap">
              <input value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
              <span className="suffix">.pdf</span>
            </span>
          </label>
          <button className="btn primary big" onClick={merge} disabled={busy !== null}>
            {busy === 'merging' ? <Loader2 className="spin" size={20} aria-hidden /> : <Download size={20} aria-hidden />}
            {busy === 'merging' ? 'Merging…' : order.length > 1 ? 'Merge & download' : 'Save PDF'}
          </button>
        </footer>
      )}

      <Toast toast={toast} onClose={hide} />
      {dragging && <DropOverlay text="Drop to add PDFs" />}
      {busy === 'reading' && !empty && <div className="reading" role="status">Reading files…</div>}
    </>
  );
}
