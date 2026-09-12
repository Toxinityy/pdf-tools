// Page previews via pdf.js. Each file is parsed once; each (page, rotation) is rendered once.
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { SourceFile } from './pages';

GlobalWorkerOptions.workerSrc = workerUrl;

const docs = new Map<string, Promise<PDFDocumentProxy>>();
const images = new Map<string, Promise<string>>();
const BOX = 240; // px; about 1.5x the on-screen size so previews stay sharp

export function thumbnail(file: SourceFile, index: number, rotation: number): Promise<string> {
  const key = `${file.id}:${index}:${rotation}`;
  if (!images.has(key)) images.set(key, render(file, index, rotation));
  return images.get(key)!;
}

async function render(file: SourceFile, index: number, rotation: number): Promise<string> {
  if (!docs.has(file.id)) {
    // pdf.js takes ownership of the buffer it is given, so hand it a copy.
    docs.set(file.id, getDocument({ data: file.bytes.slice() }).promise);
  }
  const page = await (await docs.get(file.id)!).getPage(index + 1);
  const angle = (page.rotate + rotation) % 360;
  const base = page.getViewport({ scale: 1, rotation: angle });
  const viewport = page.getViewport({ scale: BOX / Math.max(base.width, base.height), rotation: angle });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.85));
  if (!blob) throw new Error('render failed');
  return URL.createObjectURL(blob);
}
