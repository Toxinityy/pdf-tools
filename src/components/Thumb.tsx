import { useEffect, useRef, useState } from 'react';
import { thumbnail } from '../lib/thumbs';
import type { SourceFile } from '../lib/pages';

// Renders only once scrolled near the viewport, so big files don't block the page.
export function Thumb({ file, index, rotation }: { file: SourceFile; index: number; rotation: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '300px' });
    io.observe(ref.current!);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    thumbnail(file, index, rotation).then(
      (url) => live && setSrc(url),
      () => live && setFailed(true),
    );
    return () => { live = false; };
  }, [visible, file, index, rotation]);

  return (
    <div ref={ref} className="thumb">
      {src ? <img src={src} alt="" draggable={false} />
        : failed ? <span className="thumb-note">No preview</span>
        : <span className="skeleton" />}
    </div>
  );
}
