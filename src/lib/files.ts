import { PdfError } from './pdf';

export function download(data: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// Safe file name without the .pdf extension.
export const baseName = (s: string, fallback: string) =>
  s.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\.pdf$/i, '').trim() || fallback;

// Decimal units (1 MB = 1,000,000 bytes) to match the size-limit input.
export function formatSize(bytes: number) {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(Math.floor(bytes / 100_000) / 10).toFixed(1)} MB`; // round down so "4.0 MB" never hides 4.04 MB
}

export function describeError(e: unknown, name: string) {
  const reason = e instanceof PdfError ? e.reason : 'corrupt';
  if (reason === 'not-pdf') return `${name} isn't a PDF, so it was skipped.`;
  if (reason === 'encrypted') return `${name} is password-protected. Unlock it first, then add it again.`;
  return `${name} couldn't be read. It may be damaged.`;
}
