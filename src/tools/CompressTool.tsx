import { useRef, useState } from 'react';
import { CircleCheck, Download, Feather, FileText, Gauge, Info, Loader2, Minimize2, Replace, Target, TriangleAlert } from 'lucide-react';
import { plural } from '../components/Cards';
import { DropOverlay, DropZone } from '../components/DropZone';
import { Toast, useToast } from '../components/Toast';
import { readPdf } from '../lib/pdf';
import { compressPdf, compressToSize, type ImageOptions, type SizeProgress } from '../lib/compress';
import { reencode } from '../lib/reencode';
import { baseName, describeError, download, formatSize } from '../lib/files';
import { useFileDrop } from '../lib/useFileDrop';

type Level = 'light' | 'balanced' | 'smallest' | 'target';
type Unit = 'MB' | 'KB';

const LEVELS: { id: Level; icon: typeof Feather; title: string; blurb: string; images?: ImageOptions }[] = [
  { id: 'light', icon: Feather, title: 'Light', blurb: 'No quality loss. Usually saves a little.' },
  { id: 'balanced', icon: Gauge, title: 'Balanced', blurb: 'Photos get smaller, text stays sharp. Recommended.', images: { maxSide: 1600, quality: 0.72 } },
  { id: 'smallest', icon: Minimize2, title: 'Smallest', blurb: 'Lowest photo quality, smallest file.', images: { maxSide: 1000, quality: 0.5 } },
  { id: 'target', icon: Target, title: 'Target size', blurb: 'Set a maximum, like 4 MB. We find the best quality that fits.' },
];

const QUICK_LIMITS = [1, 2, 5, 10];
// Decimal units: "4 MB" = 4,000,000 bytes, which also fits forms that count 1 MB as 1,048,576 bytes.
const UNIT_BYTES: Record<Unit, number> = { MB: 1_000_000, KB: 1_000 };

type Loaded = { name: string; bytes: Uint8Array; pageCount: number };
type Result = { bytes: Uint8Array; level: Level; limit?: number; fits?: boolean; lossless?: boolean };

export function CompressTool({ active }: { active: boolean }) {
  const [file, setFile] = useState<Loaded | null>(null);
  const [level, setLevel] = useState<Level>('balanced');
  const [limitText, setLimitText] = useState('4');
  const [unit, setUnit] = useState<Unit>('MB');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<'reading' | 'compressing' | null>(null);
  const [progress, setProgress] = useState<SizeProgress | null>(null);
  const { toast, show, hide } = useToast();
  const input = useRef<HTMLInputElement>(null);

  const load = async (list: File[]) => {
    if (!list.length) return;
    const [f] = list;
    setBusy('reading');
    try {
      const { bytes, pageCount } = await readPdf(f);
      setFile({ name: f.name, bytes, pageCount });
      setResult(null);
      if (list.length > 1) show({ text: `Compress works on one PDF at a time, so only ${f.name} was opened.`, kind: 'info' });
      else hide();
    } catch (e) {
      show({ text: describeError(e, f.name), kind: 'error' });
    }
    setBusy(null);
  };

  const dragging = useFileDrop(active, load);
  const pick = () => input.current?.click();
  const outName = file ? `${baseName(file.name, 'document')}-compressed.pdf` : '';

  const before = file?.bytes.length ?? 0;
  const limitNum = Number(limitText.replace(',', '.'));
  const limit = Math.floor(limitNum * UNIT_BYTES[unit]);
  const limitLabel = `${limitText.replace(',', '.')} ${unit}`;
  const limitError = level !== 'target' ? null
    : !limitText.trim() || !Number.isFinite(limitNum) ? 'Enter a size, like 4.'
    : limitNum <= 0 ? 'The size must be more than 0.'
    : limit < 10_000 ? 'That\'s too small for a PDF. Try at least 10 KB.'
    : null;
  const alreadyFits = level === 'target' && !limitError && before <= limit;
  const changeSetting = (fn: () => void) => { fn(); setResult(null); };

  const compress = async () => {
    if (!file) return;
    setBusy('compressing');
    setProgress(null);
    try {
      if (level === 'target') {
        const r = await compressToSize(file.bytes, limit, { reencode, onProgress: setProgress });
        setResult({ bytes: r.bytes, level, limit, fits: r.fits, lossless: r.lossless });
      } else {
        const images = LEVELS.find((l) => l.id === level)!.images;
        const bytes = await compressPdf(file.bytes, {
          images, reencode, onProgress: (done, total) => setProgress({ attempt: 1, done, total }),
        });
        setResult({ bytes, level });
      }
    } catch {
      show({ text: 'Compression failed. The PDF may use features this tool can\'t handle.', kind: 'error' });
    }
    setBusy(null);
    setProgress(null);
  };

  const after = result?.bytes.length ?? 0;
  const smaller = result !== null && after < before;
  const saved = before ? Math.round((1 - after / before) * 100) : 0;

  return (
    <>
      <header className="header">
        <div>
          <h1 tabIndex={-1}>Compress PDF</h1>
          <p className="subtitle">Make a PDF smaller so it's easier to email or upload.</p>
        </div>
        {file && (
          <div className="toolbar">
            <span className="file-chip" title={file.name}>
              <FileText size={18} aria-hidden />
              <span className="truncate">{file.name}</span>
              <span className="muted nowrap">· {formatSize(before)}</span>
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
            steps={['Add a PDF', 'Pick a level or a size limit', 'Download the smaller file']}
          />
        ) : (
          <>
            <fieldset className="modes">
              <legend className="sr-only">Compression level</legend>
              {LEVELS.map((l) => (
                <label key={l.id} className={level === l.id ? 'mode on' : 'mode'}>
                  <input
                    type="radio" name="compress-level" className="sr-only" checked={level === l.id}
                    onChange={() => changeSetting(() => setLevel(l.id))} disabled={busy !== null}
                  />
                  <l.icon size={22} aria-hidden />
                  <span><b>{l.title}</b><small>{l.blurb}</small></span>
                </label>
              ))}
            </fieldset>

            {level === 'target' && (
              <div className="options stack-field">
                <label htmlFor="limit">Keep the file under</label>
                <div className="inline-field">
                  <input
                    id="limit" className="num wide" type="number" inputMode="decimal" min="0" step="0.1"
                    value={limitText} onChange={(e) => changeSetting(() => setLimitText(e.target.value))}
                    onWheel={(e) => e.currentTarget.blur()} /* scrolling the page shouldn't nudge the limit */
                    aria-invalid={!!limitError} aria-describedby="limit-help" disabled={busy !== null}
                  />
                  <select
                    className="num" value={unit} aria-label="Unit" disabled={busy !== null}
                    onChange={(e) => changeSetting(() => setUnit(e.target.value as Unit))}
                  >
                    <option>MB</option>
                    <option>KB</option>
                  </select>
                  <span className="chips" role="group" aria-label="Common limits">
                    {QUICK_LIMITS.map((n) => (
                      <button
                        key={n} type="button" className="chip" disabled={busy !== null}
                        aria-pressed={unit === 'MB' && limitNum === n}
                        onClick={() => changeSetting(() => { setLimitText(String(n)); setUnit('MB'); })}
                      >
                        {n} MB
                      </button>
                    ))}
                  </span>
                </div>
                <p id="limit-help" className={limitError ? 'help error' : 'help'} role={limitError ? 'alert' : undefined}>
                  {limitError ?? `Your file is ${formatSize(before)} now. We keep as much quality as the limit allows.`}
                </p>
              </div>
            )}

            <section className="result" aria-live="polite">
              {busy === 'compressing' ? (
                <>
                  <p className="result-title"><Loader2 className="spin" size={22} aria-hidden /> Compressing…</p>
                  {progress && (
                    <>
                      <p className="muted">
                        {level === 'target' && `Try ${progress.attempt}: `}Shrinking images {progress.done} of {progress.total}
                      </p>
                      <div className="meter"><span style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
                    </>
                  )}
                </>
              ) : alreadyFits ? (
                <>
                  <p className="result-title success"><CircleCheck size={24} aria-hidden /> Already under {limitLabel}</p>
                  <p className="muted">Your file is {formatSize(before)}, so you can use it as it is.</p>
                </>
              ) : !result ? (
                <>
                  <p className="result-title">{plural(file.pageCount, 'page')} · {formatSize(before)}</p>
                  <p className="muted">
                    {level === 'target' ? <>Press <b>Compress</b> to shrink it under your limit.</> : <>Pick a level, then press <b>Compress</b>.</>}
                    {' '}Your original file is not changed.
                  </p>
                </>
              ) : result.level === 'target' && !result.fits ? (
                <>
                  <p className="result-title warn"><TriangleAlert size={22} aria-hidden /> Couldn't get it under {limitLabel}</p>
                  <p className="muted">
                    {smaller
                      ? <>The smallest we could make it is <b>{formatSize(after)}</b> ({saved}% smaller). You can still download that version.</>
                      : <>This PDF is mostly text or drawings, which are already stored efficiently.</>}
                  </p>
                  {smaller && <div className="meter" aria-hidden><span style={{ width: `${Math.max(2, 100 - saved)}%` }} /></div>}
                </>
              ) : smaller ? (
                <>
                  <p className="result-title success">
                    <CircleCheck size={24} aria-hidden /> {result.level === 'target' ? `Under ${limitLabel}` : `${saved}% smaller`}
                  </p>
                  <p className="sizes">
                    <span className="muted">{formatSize(before)}</span> → <b>{formatSize(after)}</b>
                    {result.level === 'target' && <span className="muted"> · {saved}% smaller</span>}
                  </p>
                  <div className="meter" aria-hidden><span style={{ width: `${Math.max(2, 100 - saved)}%` }} /></div>
                  {result.lossless && <p className="muted">No quality was lost to get here.</p>}
                  {result.level !== 'target' && saved < 5 && result.level !== 'smallest' && (
                    <p className="muted">Only a small saving. Try <b>Smallest</b> if you need it smaller.</p>
                  )}
                </>
              ) : (
                <>
                  <p className="result-title"><Info size={22} aria-hidden /> Already as small as this level can make it</p>
                  <p className="muted">
                    Keep your original file.
                    {result.level !== 'smallest' && <> Try <b>Smallest</b> for more savings.</>}
                    {result.level === 'smallest' && <> This PDF is mostly text or drawings, which are already stored efficiently.</>}
                  </p>
                </>
              )}
            </section>
          </>
        )}
      </main>

      {file && (
        <footer className="exportbar">
          <p className="summary">{result && smaller ? outName : `Original: ${formatSize(before)}`}</p>
          {result && smaller ? (
            <button
              className="btn primary big"
              onClick={() => { download(result.bytes, outName, 'application/pdf'); show({ text: `Saved ${outName}.`, kind: 'info' }); }}
            >
              <Download size={20} aria-hidden /> Download ({formatSize(after)})
            </button>
          ) : (
            <button className="btn primary big" onClick={compress} disabled={busy !== null || !!limitError || alreadyFits}>
              {busy === 'compressing' ? <Loader2 className="spin" size={20} aria-hidden /> : <Minimize2 size={20} aria-hidden />}
              {busy === 'compressing' ? 'Compressing…' : level === 'target' && !limitError ? `Compress to under ${limitLabel}` : 'Compress'}
            </button>
          )}
        </footer>
      )}

      <Toast toast={toast} onClose={hide} />
      {dragging && <DropOverlay text="Drop a PDF to compress" />}
    </>
  );
}
