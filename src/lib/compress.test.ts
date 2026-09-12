import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef } from 'pdf-lib';
import { zlibSync } from 'fflate';
import { compressPdf, compressToSize, LADDER, type Reencode } from './compress';

// A PDF whose page content is stored uncompressed, plus a big Flate RGB image and its soft mask.
async function makePdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 400]);
  const ctx = doc.context;
  const text = 'BT /F1 12 Tf 20 20 Td (Hello hello hello) Tj ET\n'.repeat(400);
  const content = ctx.register(ctx.stream(text));
  page.node.set(PDFName.of('Contents'), content);

  const w = 300, h = 200;
  let seed = 1; // pseudo-random pixels so the image doesn't deflate to nothing (like a real photo)
  const rgb = new Uint8Array(w * h * 3).map(() => (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24);
  const mask = ctx.register(ctx.flateStream(new Uint8Array(w * h).fill(255), {
    Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceGray', BitsPerComponent: 8,
  }));
  const image = ctx.register(PDFRawStream.of(ctx.obj({
    Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8,
    Filter: 'FlateDecode', SMask: mask,
  }), zlibSync(rgb)));
  return { bytes: await doc.save({ useObjectStreams: false }), content, image, mask };
}

const streamAt = async (bytes: Uint8Array, ref: PDFRef) =>
  (await PDFDocument.load(bytes)).context.lookup(ref) as PDFRawStream;

describe('compressPdf', () => {
  it('light: deflates uncompressed streams without touching images', async () => {
    const { bytes, content, image } = await makePdf();
    const out = await compressPdf(bytes, {});
    expect(out.length).toBeLessThan(bytes.length);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(1);
    expect((await streamAt(out, content)).dict.get(PDFName.of('Filter'))).toBe(PDFName.of('FlateDecode'));
    expect((await streamAt(out, image)).dict.get(PDFName.of('Filter'))).toBe(PDFName.of('FlateDecode'));
  });

  it('images: re-encodes eligible images as JPEG and leaves soft masks alone', async () => {
    const { bytes, image, mask } = await makePdf();
    const seen: string[] = [];
    const reencode: Reencode = async (img) => {
      seen.push(`${img.kind} ${img.width}x${img.height}${img.kind === 'raw' ? ` c${img.channels} ${img.pixels.length}` : ''}`);
      return { bytes: new Uint8Array(100).fill(1), width: 150, height: 100 };
    };
    const progress: string[] = [];
    const out = await compressPdf(bytes, {
      images: { maxSide: 150, quality: 0.5 }, reencode, onProgress: (d, t) => progress.push(`${d}/${t}`),
    });

    expect(seen).toEqual(['raw 300x200 c3 180000']); // the mask was not offered
    expect(progress.at(-1)).toBe('1/1');
    const img = await streamAt(out, image);
    expect(img.dict.get(PDFName.of('Filter'))).toBe(PDFName.of('DCTDecode'));
    expect(img.dict.get(PDFName.of('ColorSpace'))).toBe(PDFName.of('DeviceRGB'));
    expect((img.dict.get(PDFName.of('Width')) as PDFNumber).asNumber()).toBe(150);
    expect(img.dict.get(PDFName.of('SMask'))).toBe(mask);
    expect(img.getContents().length).toBe(100);
  });

  describe('compressToSize', () => {
    // Fake encoder: output size grows with resolution and quality, like a real JPEG encoder.
    const tried: number[] = [];
    const reencode: Reencode = async (_img, { maxSide, quality }) => {
      tried.push(maxSide);
      return { bytes: new Uint8Array(Math.round(maxSide * quality * 50)), width: 10, height: 10 };
    };
    const sizeAt = async (bytes: Uint8Array, i: number) => (await compressPdf(bytes, { images: LADDER[i], reencode })).length;

    it('picks the mildest setting that fits under the limit', async () => {
      const { bytes } = await makePdf();
      // A limit that step 3 fits but step 2 doesn't.
      const limit = Math.floor(((await sizeAt(bytes, 2)) + (await sizeAt(bytes, 3))) / 2);
      tried.length = 0;
      const r = await compressToSize(bytes, limit, { reencode });
      expect(r.fits).toBe(true);
      expect(r.bytes.length).toBeLessThanOrEqual(limit);
      expect(r.bytes.length).toBe(await sizeAt(bytes, 3));
      expect(new Set(tried).size).toBeLessThanOrEqual(4); // binary search, not every step
    });

    it('returns lossless output without touching images when that already fits', async () => {
      const { bytes } = await makePdf();
      tried.length = 0;
      const r = await compressToSize(bytes, bytes.length, { reencode });
      expect(r).toMatchObject({ fits: true, lossless: true });
      expect(tried).toEqual([]);
    });

    it('reports the smallest result when nothing fits', async () => {
      const { bytes } = await makePdf();
      const r = await compressToSize(bytes, 10, { reencode });
      expect(r.fits).toBe(false);
      expect(r.bytes.length).toBe(await sizeAt(bytes, LADDER.length - 1));
    });
  });

  it('keeps the original image when re-encoding would not make it smaller', async () => {
    const { bytes, image } = await makePdf();
    const before = (await streamAt(bytes, image)).getContents().length;
    const out = await compressPdf(bytes, {
      images: { maxSide: 150, quality: 0.5 },
      reencode: async () => ({ bytes: new Uint8Array(before + 1), width: 150, height: 100 }),
    });
    expect((await streamAt(out, image)).dict.get(PDFName.of('Filter'))).toBe(PDFName.of('FlateDecode'));
  });
});
