import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { mergePages, PdfError, readPdf, splitPdf } from './pdf';
import { pagesForFile, rotatePage, type SourceFile } from './pages';

// Each page gets a distinct width so we can check order in the output.
async function makePdf(widths: number[], encrypt = false): Promise<Uint8Array<ArrayBuffer>> {
  const doc = await PDFDocument.create();
  for (const w of widths) doc.addPage([w, 500]);
  const bytes = (await doc.save({ useObjectStreams: false })) as Uint8Array<ArrayBuffer>; // classic trailer, patched below
  if (!encrypt) return bytes;
  // pdf-lib can't encrypt; an /Encrypt entry in the trailer is enough for detection.
  const text = new TextDecoder('latin1').decode(bytes).replace('trailer\n<<', 'trailer\n<<\n/Encrypt 1 0 R');
  return new Uint8Array([...text].map((c) => c.charCodeAt(0)));
}

const src = (id: string, bytes: Uint8Array, pageCount: number): SourceFile =>
  ({ id, name: `${id}.pdf`, bytes, pageCount, color: '#000' });

describe('readPdf', () => {
  it('returns bytes and page count', async () => {
    const r = await readPdf(new File([await makePdf([100, 200, 300])], 'x.pdf'));
    expect(r.pageCount).toBe(3);
  });

  it('rejects non-PDF, corrupt and encrypted files with a reason', async () => {
    const reason = (f: File) => readPdf(f).catch((e: PdfError) => e.reason);
    expect(await reason(new File(['hello'], 'notes.txt'))).toBe('not-pdf');
    expect(await reason(new File(['%PDF-1.7 garbage'], 'bad.pdf'))).toBe('corrupt');
    expect(await reason(new File([await makePdf([100], true)], 'locked.pdf'))).toBe('encrypted');
  });
});

describe('mergePages', () => {
  it('merges pages in the given order with rotation applied', async () => {
    const a = src('a', await makePdf([100, 200]), 2);
    const b = src('b', await makePdf([300]), 1);
    let pages = [...pagesForFile('b', 1), ...pagesForFile('a', 2)].reverse(); // a1 a0 b0
    pages = rotatePage(pages, pages[2].id); // rotate b0 by 90

    const out = await PDFDocument.load(await mergePages(pages, { a, b }));
    expect(out.getPages().map((p) => p.getWidth())).toEqual([200, 100, 300]);
    expect(out.getPages().map((p) => p.getRotation().angle)).toEqual([0, 0, 90]);
  });
});

describe('splitPdf', () => {
  it('makes one PDF per group with the right pages', async () => {
    const outs = await splitPdf(await makePdf([100, 200, 300, 400]), [[0, 1], [3], [2]]);
    const widths = await Promise.all(outs.map(async (b) =>
      (await PDFDocument.load(b)).getPages().map((p) => p.getWidth())));
    expect(widths).toEqual([[100, 200], [400], [300]]);
  });
});
