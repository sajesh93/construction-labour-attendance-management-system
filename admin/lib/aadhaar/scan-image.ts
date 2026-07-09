import jsQR from 'jsqr';
import { AadhaarData, decodeAadhaarQr } from './decoder';

/**
 * The card width below which a real photo is unlikely to decode.
 *
 * An Aadhaar Secure QR is a version 30–40 symbol (145–177 modules across)
 * printed on roughly 40% of the card's width, and a decoder wants ~3 pixels per
 * module — about 177 × 3 ÷ 0.4 ≈ 1300px across the card.
 *
 * A pristine, digitally-rendered symbol survives well below that. A photograph
 * does not: print texture, glare and JPEG noise eat the margin. Measured on a
 * real 484px-wide card scan, jsQR found nothing at any scale, and neither
 * upscaling (2×–4×) nor cropping the QR and upscaling 6× recovered it — the
 * detail was never captured. So this is advice for the admin, not a hard
 * physical limit: we still attempt the scan at any size, and only use this to
 * explain a failure.
 */
export const MIN_CARD_WIDTH_PX = 1200;

export interface AadhaarScan {
  data: AadhaarData | null;
  /** Natural width of the image scanned — drives the "too small" advice. */
  width: number;
  /** True when the image is small enough that resolution is the likely culprit. */
  tooSmall: boolean;
}

/**
 * Find and decode the Aadhaar Secure QR inside a photo of the card.
 *
 * Runs entirely in the browser, on the image in memory — the Aadhaar payload
 * never leaves the machine and never reaches the API. The stored card image is
 * untouched.
 *
 * A card with no readable QR is a normal outcome, not an error: the admin just
 * types the details in. `tooSmall` distinguishes "this image could never work"
 * from "the QR is there but unreadable", so the caller can give useful advice.
 */
export async function decodeAadhaarFromImage(file: Blob): Promise<AadhaarScan> {
  const bitmap = await createImageBitmap(file);
  try {
    const width = bitmap.width;

    // The Secure QR is dense. Too small and the binarizer loses modules; too
    // large and jsQR crawls. Try a few widths, biggest first, since a card
    // photo is usually shot close up. Never upscale: it adds no information.
    const tried = new Set<number>();
    for (const targetWidth of [2400, 1600, 3200, 1200]) {
      const w = Math.min(targetWidth, width);
      if (tried.has(w)) continue;
      tried.add(w);

      const data = rasterize(bitmap, targetWidth);
      if (!data) continue;
      const found = jsQR(data.data, data.width, data.height, {
        inversionAttempts: 'attemptBoth',
      });
      const decoded = found?.data ? decodeAadhaarQr(found.data) : null;
      if (decoded) return { data: decoded, width, tooSmall: false };
    }
    return { data: null, width, tooSmall: width < MIN_CARD_WIDTH_PX };
  } finally {
    bitmap.close();
  }
}

/**
 * Same, for a card already uploaded: pull the stored image back through the
 * photo proxy (which decrypts it) and scan that. Note the stored copy is
 * downscaled and JPEG-compressed on upload, so it is a worse scan target than
 * the original file — prefer decodeAadhaarFromImage() on the picked File when
 * one is still to hand.
 */
export async function decodeAadhaarFromPhotoId(photoId: string): Promise<AadhaarScan> {
  const res = await fetch(`/api/photo/${photoId}`);
  if (!res.ok) return { data: null, width: 0, tooSmall: false };
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
