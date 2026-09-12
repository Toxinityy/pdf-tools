import { useRef, useState } from 'react';
import { zipSync } from 'fflate';
import { Check, Download, FileText, Files, ListOrdered, Loader2, MousePointerClick, Replace } from 'lucide-react';
import { Thumb } from '../components/Thumb';
import { COLORS, plural } from '../components/Cards';
import { DropOverlay, DropZone } from '../components/DropZone';
import { Toast, useToast } from '../components/Toast';
import { readPdf, splitPdf } from '../lib/pdf';
import { baseName, describeError, download } from '../lib/files';
import { everyN, outputFiles, parseRanges } from '../lib/split';
import { useFileDrop } from '../lib/useFileDrop';
import type { SourceFile } from '../lib/pages';

type Mode = 'every' | 'ranges' | 'pick';

const MODES = [
  { id: 'every', icon: Files, title: 'Every page', blurb: 'One file per page, or per group of pages.' },
  { id: 'ranges', icon: ListOrdered, title: 'By ranges', blurb: 'Type ranges like 1-3, 5. Each becomes a file.' },
  { id: 'pick', icon: MousePointerClick, title: 'Pick pages', blurb: 'Click pages to pull them into a new PDF.' },
] as const;

export function SplitTool({ active }: { active: boolean }) {
  const [file, setFile] = useState<SourceFile | null>(null);
  const [mode, setMode] = useState<Mode>('every');
  const [size, setSize] = useState('1');
  const [rangeText, setRangeText] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<'reading' | 'splitting' | null>(null);
  const { toast, show, hide } = useToast();
  const input = useRef<HTMLInputElement>(null);

  const load = async (list: File[]) => {
    if (!list.length) return;
    const [f] = list;
    setBusy('reading');
    try {
      const { bytes, pageCount } = await readPdf(f);
      setFile({ id: crypto.randomUUID(), name: f.name, bytes, pageCount, color: COLORS[0] });
      setPicked(new Set());
      setRangeText('');
      if (list.length > 1) show({ text: `Split works on one PDF at a time, so only ${f.name} was opened.`, kind: 'info' });
      else hide();
    } catch (e) {
      show({ text: describeError(e, f.name), kind: 'error' });
    }
    setBusy(null);
  };

  const dragging = useFileDrop(active, load);
  const pick = () => input.current?.click();
  const count = file?.pageCount ?? 0;

  const parsed = parseRanges(rangeText, count);
  const groups: number[][] =
    mode === 'every' ? everyN(count, Number(size))
    : mode === 'ranges' ? (parsed.ok ? parsed.ranges : [])
    : picked.size ? [[...picked].sort((a, b) => a - b)] : [];

  // Which output file each page lands in (first match wins if ranges overlap).
  const groupOf = new Map<number, number>();
  groups.forEach((g, i) => g.forEach((p) => { if (!groupOf.has(p)) groupOf.set(p, i); }));

  const toggle = (i: number) => setPicked((s) => {
    const next = new Set(s);
    if (!next.delete(i)) next.add(i);
    return next;
  });

  const run = async () => {
    if (!file) return;
    setBusy('splitting');
    const base = baseName(file.name, 'document');
    const outs = mode === 'pick' ? [{ name: `${base} (selected pages).pdf`, pages: groups[0] }] : outputFiles(base, groups);
    try {
      const pdfs = await splitPdf(file.bytes, outs.map((o) => o.pages));
      if (outs.length === 1) {
        download(pdfs[0], outs[0].name, 'application/pdf');
        show({ text: `Saved ${outs[0].name}.`, kind: 'info' });
      } else {
        // PDFs are already compressed, so store them in the zip as-is (fast).
        const zip = zipSync(Object.fromEntries(outs.map((o, i) => [o.name, pdfs[i]])), { level: 0 });
        download(zip, `${base}-split.zip`, 'application/zip');
        show({ text: `Saved ${base}-split.zip (${plural(outs.length, 'file')}).`, kind: 'info' });
      }
    } catch {
      show({ text: 'Splitting failed. The PDF may be damaged.', kind: 'error' });
    }
    setBusy(null);
  };

  const rangeError = mode === 'ranges' && rangeText.trim() !== '' && !parsed.ok ? parsed.error : null;
  const summary =
    mode === 'pick' ? `${plural(picked.size, 'page')} selected`
    : groups.length ? `Makes ${plural(groups.length, 'file')}${groups.length > 1 ? ' · downloads as a .zip' : ''}`
    : 'Nothing to split yet';

  return (
    <>
      <header className="header">
        <div>
          <h1 tabIndex={-1}>Split PDF</h1>
          <p className="subtitle">Break a PDF into smaller files, or pull out just the pages you need.</p>
        </div>
        {file && (
          <div className="toolbar">
            <span className="file-chip" title={file.name}>
              <FileText size={18} aria-hidden />
              <span className="truncate">{file.name}</span>
              <span className="muted nowrap">· {plural(count, 'page')}</span>
            </span>
            <button className="btn" onClick={pick}><Replace size={18} aria-hidden /> Change file</button>
          </div>
        )}
      </header>

      <input
        ref={input} type="file" accept="application/pdf,.pdf" hidden
        onChange={(e) => { if (e.target.files) load([...e.target.files]); e.target.value = ''; }}
      />

      <main className="main">
        {!file ? (
          <DropZone
            title="Drop a PDF here" button="Choose a PDF" busy={busy === 'reading'} onPick={pick}
            steps={['Add a PDF', 'Choose how to split', 'Download']}
          />
        ) : (
          <>
            <fieldset className="modes">
              <legend className="sr-only">How do you want to split it?</legend>
              {MODES.map((m) => (
                <label key={m.id} className={mode === m.id ? 'mode on' : 'mode'}>
                  <input type="radio" name="split-mode" checked={mode === m.id} onChange={() => setMode(m.id)} className="sr-only" />
                  <m.icon size={22} aria-hidden />
                  <span><b>{m.title}</b><small>{m.blurb}</small></span>
                </label>
              ))}
            </fieldset>

            <div className="options">
              {mode === 'every' && (
                <label className="inline-field">
                  Split every
                  <input
                    type="number" inputMode="numeric" min={1} max={count} value={size}
                    onChange={(e) => setSize(e.target.value)} className="num"
                  />
                  {Number(size) === 1 ? 'page' : 'pages'}
                </label>
              )}
              {mode === 'ranges' && (
                <div className="stack-field">
                  <label htmlFor="ranges">Page ranges</label>
                  <input
                    id="ranges" className="text" value={rangeText} onChange={(e) => setRangeText(e.target.value)}
                    placeholder="e.g. 1-3, 5, 8-10" spellCheck={false} autoComplete="off"
                    aria-invalid={!!rangeError} aria-describedby="ranges-help"
                  />
                  <p id="ranges-help" className={rangeError ? 'help error' : 'help'} role={rangeError ? 'alert' : undefined}>
                    {rangeError ?? `Separate with commas. "8-" means page 8 to the end. This PDF has ${plural(count, 'page')}.`}
                  </p>
                </div>
              )}
              {mode === 'pick' && (
                <div className="inline-field">
                  <button className="btn" onClick={() => setPicked(new Set(Array.from({ length: count }, (_, i) => i)))}>Select all</button>
                  <button className="btn" onClick={() => setPicked(new Set())} disabled={!picked.size}>Clear</button>
                  <span className="muted">Click pages to select them. They stay in their original order.</span>
                </div>
              )}
            </div>

            <ul className="grid" aria-label="Pages">
              {Array.from({ length: count }, (_, i) => {
                const g = groupOf.get(i);
                const inPick = mode === 'pick';
                const selected = picked.has(i);
                const body = (
                  <>
                    {g !== undefined && !inPick && (
                      <span className="group-badge" style={{ background: COLORS[g % COLORS.length] }}>File {g + 1}</span>
                    )}
                    {inPick && <span className={selected ? 'check on' : 'check'} aria-hidden>{selected && <Check size={16} />}</span>}
                    <Thumb file={file} index={i} rotation={0} />
                    <div className="card-body"><p className="card-meta">Page {i + 1}</p></div>
                  </>
                );
                return (
                  <li key={i} className={`card static${g === undefined && !inPick ? ' dim' : ''}${inPick && selected ? ' selected' : ''}`}>
                    {inPick ? (
                      <button className="card-btn" aria-pressed={selected} aria-label={`Page ${i + 1}`} onClick={() => toggle(i)}>
                        {body}
                      </button>
                    ) : body}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>

      {file && (
        <footer className="exportbar">
          <p className="summary">{summary}</p>
          <button className="btn primary big" onClick={run} disabled={busy !== null || !groups.length}>
            {busy === 'splitting' ? <Loader2 className="spin" size={20} aria-hidden /> : <Download size={20} aria-hidden />}
            {busy === 'splitting' ? 'Working…' : mode === 'pick' ? 'Extract & download' : 'Split & download'}
          </button>
        </footer>
      )}

      <Toast toast={toast} onClose={hide} />
      {dragging && <DropOverlay text="Drop a PDF to split" />}
    </>
  );
}
