// PDF compression. Lossless part: deflate streams stored raw, pack objects into object streams.
// Lossy part (optional): re-encode large embedded images as smaller JPEGs. Text and vector art are
// never touched, so text stays sharp and selectable.
import { unzlibSync, zlibSync } from 'fflate';
import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, type PDFDict, type PDFObject } from 'pdf-lib';

export type ImageInput =
  | { kind: 'jpeg'; bytes: Uint8Array; width: number; height: number }
  | { kind: 'raw'; pixels: Uint8Array; channels: 1 | 3; width: number; height: number };
export type ImageOptions = { maxSide: number; quality: number };
// Returns a baseline RGB JPEG, or null to leave the image alone. Browser version lives in reencode.ts.
export type Reencode = (img: ImageInput, opts: ImageOptions) => Promise<{ bytes: Uint8Array; width: number; height: number } | null>;

type Options = { images?: ImageOptions; reencode?: Reencode; onProgress?: (done: number, total: number) => void };

const N = (s: string) => PDFName.of(s);
const MIN_PIXELS = 200 * 200; // smaller images aren't worth the quality loss

export async function compressPdf(bytes: Uint8Array, { images, reencode, onProgress }: Options): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const ctx = doc.context;
  const streams = ctx.enumerateIndirectObjects()
    .filter((e): e is [PDFRef, PDFRawStream] => e[1] instanceof PDFRawStream);

  // Lossless: compress streams that were stored uncompressed.
  for (const [ref, s] of streams) {
    if (s.dict.has(N('Filter'))) continue;
    const packed = zlibSync(s.getContents(), { level: 9 });
    if (packed.length < s.getContents().length) {
      const dict = s.dict.clone(ctx);
      dict.set(N('Filter'), N('FlateDecode'));
      ctx.assign(ref, PDFRawStream.of(dict, packed));
    }
  }

  if (images && reencode) {
    const current = ctx.enumerateIndirectObjects()
      .filter((e): e is [PDFRef, PDFRawStream] => e[1] instanceof PDFRawStream);
    // Soft masks are alpha channels; turning them into RGB JPEGs would break transparency.
    const masks = new Set(current.map(([, s]) => s.dict.get(N('SMask'))).filter(Boolean));
    const todo = current
      .filter(([ref]) => !masks.has(ref))
      .map(([ref, s]) => [ref, s, toInput(s, ctx)] as const)
      .filter((e) => e[2] !== null);

    let done = 0;
    // ponytail: runs on the main thread (~1s per 6 MP photo); move to a worker if the UI stutters on big files.
    for (const [ref, s, input] of todo) {
      const out = await reencode(input!, images).catch(() => null);
      if (out && out.bytes.length < s.getContents().length) {
        const dict = s.dict.clone(ctx);
        dict.set(N('Filter'), N('DCTDecode'));
        dict.set(N('ColorSpace'), N('DeviceRGB'));
        dict.set(N('BitsPerComponent'), PDFNumber.of(8));
        dict.set(N('Width'), PDFNumber.of(out.width));
        dict.set(N('Height'), PDFNumber.of(out.height));
        dict.delete(N('DecodeParms'));
        ctx.assign(ref, PDFRawStream.of(dict, out.bytes));
      }
      onProgress?.(++done, todo.length);
    }
  }

  return doc.save({ useObjectStreams: true });
}

// Image settings from mildest to most aggressive, used to hit a target size.
export const LADDER: ImageOptions[] = [
  { maxSide: 3200, quality: 0.9 },
  { maxSide: 2400, quality: 0.85 },
  { maxSide: 2000, quality: 0.8 },
  { maxSide: 1600, quality: 0.72 },
  { maxSide: 1300, quality: 0.62 },
  { maxSide: 1000, quality: 0.5 },
  { maxSide: 800, quality: 0.4 },
  { maxSide: 600, quality: 0.32 },
  { maxSide: 450, quality: 0.25 },
];

export type SizeProgress = { attempt: number; done: number; total: number };
export type SizeResult = { bytes: Uint8Array; fits: boolean; lossless: boolean };

// Mildest compression that fits under `limit` bytes. Lossless first, then a binary search over LADDER
// (output size shrinks as the step index grows), so at most 4 full passes for 9 steps.
export async function compressToSize(
  bytes: Uint8Array, limit: number,
  { reencode, onProgress }: { reencode: Reencode; onProgress?: (p: SizeProgress) => void },
): Promise<SizeResult> {
  const lossless = await compressPdf(bytes, {});
  if (lossless.length <= limit) return { bytes: lossless, fits: true, lossless: true };

  let lo = 0, hi = LADDER.length - 1, attempt = 0;
  let best: Uint8Array | null = null;
  let smallest = lossless;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    attempt++;
    const out = await compressPdf(bytes, {
      images: LADDER[mid], reencode, onProgress: (done, total) => onProgress?.({ attempt, done, total }),
    });
    if (out.length < smallest.length) smallest = out;
    if (out.length <= limit) { best = out; hi = mid - 1; } else lo = mid + 1;
  }
  return best ? { bytes: best, fits: true, lossless: false } : { bytes: smallest, fits: false, lossless: false };
}

// Decide whether an image stream is safe to re-encode, and extract what the encoder needs.
function toInput(s: PDFRawStream, ctx: PDFDocument['context']): ImageInput | null {
  const d = s.dict;
  if (d.get(N('Subtype')) !== N('Image')) return null;
  const num = (k: string) => (d.lookup(N(k)) instanceof PDFNumber ? (d.lookup(N(k)) as PDFNumber).asNumber() : 0);
  const width = num('Width'), height = num('Height');
  if (width * height < MIN_PIXELS) return null;
  // Masks, custom decode ranges and odd bit depths change how pixels map to colour. Skip them.
  if (d.lookup(N('ImageMask'))?.toString() === 'true' || d.has(N('Decode')) || num('BitsPerComponent') !== 8) return null;
  const channels = components(d.lookup(N('ColorSpace')), ctx);
  if (channels !== 1 && channels !== 3) return null; // CMYK, indexed, etc.

  const filter = d.lookup(N('Filter'));
  const filters = filter instanceof PDFArray ? filter.asArray() : filter ? [filter] : [];
  if (filters.length !== 1) return null;
  if (filters[0] === N('DCTDecode')) return { kind: 'jpeg', bytes: s.getContents(), width, height };
  if (filters[0] === N('FlateDecode') && !d.has(N('DecodeParms'))) {
    try {
      const pixels = unzlibSync(s.getContents());
      if (pixels.length !== width * height * channels) return null;
      return { kind: 'raw', pixels, channels, width, height };
    } catch {
      return null;
    }
  }
  return null;
}

function components(cs: PDFObject | undefined, ctx: PDFDocument['context']): number | null {
  if (cs === N('DeviceRGB')) return 3;
  if (cs === N('DeviceGray')) return 1;
  if (cs instanceof PDFArray && cs.lookup(0) === N('ICCBased')) {
    const profile = ctx.lookup(cs.get(1));
    const n = profile instanceof PDFRawStream ? (profile.dict as PDFDict).lookup(N('N')) : undefined;
    return n instanceof PDFNumber ? n.asNumber() : null;
  }
  return null;
}
