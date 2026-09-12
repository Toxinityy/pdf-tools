// Reading and writing PDFs with pdf-lib. No DOM needed, so this runs in tests too.
import { degrees, PDFDocument } from 'pdf-lib';
import type { PageRef, SourceFile } from './pages';

export type PdfErrorReason = 'not-pdf' | 'encrypted' | 'corrupt';

export class PdfError extends Error {
  constructor(public reason: PdfErrorReason, public fileName: string) {
    super(`${fileName}: ${reason}`);
  }
}

export async function readPdf(file: File): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Real PDFs start with "%PDF-" (a few tolerate junk before it, so look in the first 1 KB).
  if (!new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF-')) {
    throw new PdfError('not-pdf', file.name);
  }
  let doc: PDFDocument;
  let pageCount = 0;
  try {
    // pdf-lib parses leniently; broken files often only fail once pages are read.
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    pageCount = doc.getPageCount();
  } catch {
    throw new PdfError('corrupt', file.name);
  }
  // pdf-lib can't decrypt, so copied pages from encrypted files would come out blank or broken.
  if (doc.isEncrypted) throw new PdfError('encrypted', file.name);
  if (pageCount === 0) throw new PdfError('corrupt', file.name);
  return { bytes, pageCount };
}

// One new PDF per group of 0-based page indices. The source is parsed once.
export async function splitPdf(bytes: Uint8Array, groups: number[][]): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(bytes, { updateMetadata: false });
  const outs: Uint8Array[] = [];
  for (const group of groups) {
    const doc = await PDFDocument.create();
    for (const page of await doc.copyPages(src, group)) doc.addPage(page);
    outs.push(await doc.save());
  }
  return outs;
}

export async function mergePages(pages: PageRef[], files: Record<string, SourceFile>): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const loaded = new Map<string, PDFDocument>();
  for (const id of new Set(pages.map((p) => p.fileId))) {
    loaded.set(id, await PDFDocument.load(files[id].bytes, { updateMetadata: false }));
  }
  for (const ref of pages) {
    const [page] = await out.copyPages(loaded.get(ref.fileId)!, [ref.index]);
    page.setRotation(degrees((page.getRotation().angle + ref.rotation) % 360));
    out.addPage(page);
  }
  return out.save();
}
