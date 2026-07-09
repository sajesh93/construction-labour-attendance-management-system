import jsQR from 'jsqr';
import { AadhaarData, decodeAadhaarQr } from './decoder';

/**
 * Find and decode the Aadhaar Secure QR inside a photo of the card.
 *
 * Runs entirely in the browser, on the File the admin picked, before it is
 * uploaded — the Aadhaar payload never leaves the machine and never reaches
 * the API. The stored card image stays encrypted at rest as before; this only
 * reads the copy in memory.
 *
 * Returns null when the image holds no readable Aadhaar QR, which is the
 * common case for a blurred phone photo — callers must treat that as "type it
 * in yourself", not as an error.
 */
export async function decodeAadhaarFromImage(file: Blob): Promise<AadhaarData | null> {
  const bitmap = await createImageBitmap(file);
  try {
    // The Secure QR is dense (v20+ symbol). Too small and the binarizer loses
    // modules; too large and jsQR crawls. Try a few widths, biggest first,
    // since a card photo is usually shot close up.
    const tried = new Set<number>();
    for (const targetWidth of [2400, 1600, 3200, 1200, 800]) {
      // rasterize() never upscales, so on a small photo several targets
      // collapse to the same width — decode each width only once.
      const width = Math.min(targetWidth, bitmap.width);
      if (tried.has(width)) continue;
      tried.add(width);

      const data = rasterize(bitmap, targetWidth);
      if (!data) continue;
      const found = jsQR(data.data, data.width, data.height, {
        inversionAttempts: 'attemptBoth',
      });
      const decoded = found?.data ? decodeAadhaarQr(found.data) : null;
      if (decoded) return decoded;
    }
    return null;
  } finally {
    bitmap.close();
  }
}

/**
 * Same, for a card already uploaded: pull the stored image back through the
 * photo proxy (which decrypts it) and scan that. Lets an admin autofill from a
 * card that was attached earlier, not just from the file they just picked.
 */
export async function decodeAadhaarFromPhotoId(photoId: string): Promise<AadhaarData | null> {
  const res = await fetch(`/api/photo/${photoId}`);
  if (!res.ok) return null;
  return decodeAadhaarFromImage(await res.blob());
}

/** Draw the bitmap scaled to `targetWidth` (never upscaled) and read it back. */
function rasterize(bitmap: ImageBitmap, targetWidth: number): ImageData | null {
  const scale = Math.min(1, targetWidth / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
