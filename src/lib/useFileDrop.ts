import { useEffect, useRef, useState } from 'react';

// Accept files dropped anywhere on the page while `active`. Returns whether files are being dragged over.
export function useFileDrop(active: boolean, onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const handler = useRef(onFiles);
  useEffect(() => { handler.current = onFiles; });

  useEffect(() => {
    if (!active) return;
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => { if (hasFiles(e)) { depth++; setDragging(true); } };
    const leave = (e: DragEvent) => { if (hasFiles(e) && --depth <= 0) { depth = 0; setDragging(false); } };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      handler.current([...e.dataTransfer!.files]);
    };
    const events = { dragenter: enter, dragleave: leave, dragover: over, drop } as const;
    for (const [name, fn] of Object.entries(events)) window.addEventListener(name, fn as EventListener);
    return () => {
      for (const [name, fn] of Object.entries(events)) window.removeEventListener(name, fn as EventListener);
    };
  }, [active]);

  return dragging;
}
