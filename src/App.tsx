import { useEffect, useState } from 'react';
import { ArrowRight, Combine, FileStack, Minimize2, Scissors, ShieldCheck } from 'lucide-react';
import { MergeTool } from './tools/MergeTool';
import { SplitTool } from './tools/SplitTool';
import { CompressTool } from './tools/CompressTool';

const TOOLS = [
  { id: 'merge', name: 'Merge', title: 'Merge PDF', icon: Combine, blurb: 'Combine PDFs into one. Reorder, rotate or delete pages first.' },
  { id: 'split', name: 'Split', title: 'Split PDF', icon: Scissors, blurb: 'Break a PDF into several files, or pull out the pages you need.' },
  { id: 'compress', name: 'Compress', title: 'Compress PDF', icon: Minimize2, blurb: 'Make a PDF smaller for email or upload. Text stays sharp.' },
] as const;

type Route = 'home' | (typeof TOOLS)[number]['id'];

const readRoute = (): Route => {
  const id = location.hash.replace(/^#\/?/, '');
  return TOOLS.some((t) => t.id === id) ? (id as Route) : 'home';
};

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // New screen: update the tab title and move focus to its heading for screen readers.
  useEffect(() => {
    const tool = TOOLS.find((t) => t.id === route);
    document.title = tool ? `${tool.title} · PDF Tools` : 'PDF Tools';
    document.querySelector<HTMLElement>(`[data-screen="${route}"] h1`)?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [route]);

  return (
    <div className="app">
      <nav className="topbar" aria-label="Main">
        <a href="#/" className="brand"><FileStack size={22} aria-hidden /> PDF Tools</a>
        <ul className="nav">
          {TOOLS.map((t) => (
            <li key={t.id}>
              <a href={`#/${t.id}`} aria-current={route === t.id ? 'page' : undefined}>
                <t.icon size={18} aria-hidden /> {t.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div data-screen="home" hidden={route !== 'home'}>
        <main className="main home">
          <h1 tabIndex={-1}>Simple PDF tools</h1>
          <p className="subtitle">Pick a tool to get started.</p>
          <ul className="tool-grid">
            {TOOLS.map((t) => (
              <li key={t.id}>
                <a className="tool-card" href={`#/${t.id}`}>
                  <span className="tool-icon"><t.icon size={26} aria-hidden /></span>
                  <b>{t.title}</b>
                  <span className="muted">{t.blurb}</span>
                  <span className="open">Open <ArrowRight size={16} aria-hidden /></span>
                </a>
              </li>
            ))}
          </ul>
          <p className="private"><ShieldCheck size={16} aria-hidden /> Everything runs in your browser. Your files are never uploaded.</p>
        </main>
      </div>
      {/* Tools stay mounted so switching tabs keeps your work. */}
      <div data-screen="merge" hidden={route !== 'merge'}><MergeTool active={route === 'merge'} /></div>
      <div data-screen="split" hidden={route !== 'split'}><SplitTool active={route === 'split'} /></div>
      <div data-screen="compress" hidden={route !== 'compress'}><CompressTool active={route === 'compress'} /></div>
    </div>
  );
}
