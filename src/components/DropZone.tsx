import { FilePlus2, Loader2, ShieldCheck, Upload } from 'lucide-react';

export function DropZone({ title, button, steps, busy, onPick }: {
  title: string; button: string; steps: string[]; busy: boolean; onPick: () => void;
}) {
  return (
    <section className="dropzone">
      <Upload size={40} className="dropzone-icon" aria-hidden />
      <h2>{title}</h2>
      <p>or</p>
      <button className="btn primary big" onClick={onPick} disabled={busy}>
        {busy ? <Loader2 className="spin" size={20} aria-hidden /> : <FilePlus2 size={20} aria-hidden />}
        {busy ? 'Reading…' : button}
      </button>
      <ol className="steps">
        {steps.map((s, i) => <li key={s}><b>{i + 1}</b> {s}</li>)}
      </ol>
      <p className="private"><ShieldCheck size={16} aria-hidden /> Your files stay on this device. Nothing is uploaded.</p>
    </section>
  );
}

export function DropOverlay({ text }: { text: string }) {
  return (
    <div className="drop-overlay" aria-hidden>
      <div><Upload size={48} /> <p>{text}</p></div>
    </div>
  );
}
