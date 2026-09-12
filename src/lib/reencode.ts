// Browser JPEG re-encoder for compress.ts (needs canvas, so it's kept out of the unit-tested module).
import type { ImageInput, Reencode } from './compress';

export const reencode: Reencode = async (img, { maxSide, quality }) => {
  const bitmap = await createImageBitmap(img.kind === 'jpeg'
    ? new Blob([img.bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })
    : toImageData(img));
  // Browsers apply EXIF rotation, PDF viewers don't. A swapped shape means the result would come out sideways.
  if (bitmap.width !== img.width || bitmap.height !== img.height) {
    bitmap.close();
    return null;
  }
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
};

function toImageData(img: Extract<ImageInput, { kind: 'raw' }>): ImageData {
  const { pixels, channels, width, height } = img;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += channels) {
    rgba[i * 4] = pixels[j];
    rgba[i * 4 + 1] = pixels[channels === 3 ? j + 1 : j];
    rgba[i * 4 + 2] = pixels[channels === 3 ? j + 2 : j];
    rgba[i * 4 + 3] = 255;
  }
  return new ImageData(rgba, width, height);
}
