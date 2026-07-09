import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { AadhaarData, decodeAadhaarQr } from './decoder';

/**
 * Find and decode the Aadhaar Secure QR inside a photo of the card.
 *
 * Runs entirely in the browser, on the image in memory — the Aadhaar payload
 * never leaves the machine and never reaches the API. The stored card image is
 * untouched.
 *
 * The reader is ZXing (via WebAssembly), not jsQR. That is not a preference:
 * an Aadhaar Secure QR is a version 30–40 symbol (145–177 modules across) and
 * on a modest image its modules land near one pixel each. Measured on a real
 * 484px-wide card scan, whose QR spans ~185px at a ~1.0px module pitch, jsQR
 * failed under every treatment tried — 1×–6× upscaling, both smoothing modes,
 * gamma/contrast curves and four binarisation thresholds, about ninety
 * combinations. ZXing reads the same image, and the payload decodes to a
 * complete V5 record. Its grid sampler simply reconstructs the module grid
 * where jsQR's binarizer gives up.
 *
 * A card with no readable QR is a normal outcome, not an error: the admin just
 * types the details in.
 */

// Serve the WebAssembly binary from our own origin. zxing-wasm otherwise pulls
// it from a CDN at first use, which a strict CSP blocks and an offline site
// cannot reach at all.
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? '/zxing/zxing_reader.wasm' : prefix + path,
  },
  fireImmediately: false,
});

/** Widest raster we hand the decoder; beyond this it is slow for no gain. */
const MAX_SCAN_WIDTH = 2400;
/** Small images are magnified up to this width before decoding. */
const MAX_UPSCALE_WIDTH = 4000;

export interface AadhaarScan {
  data: AadhaarData | null;
  /** Natural width of the image scanned. */
  width: number;
}

export async function decodeAadhaarFromImage(file: Blob): Promise<AadhaarScan> {
  const bitmap = await createImageBitmap(file);
  try {
    for (const width of scanWidths(bitmap.width)) {
      const image = rasterize(bitmap, width);
      if (!image) continue;

      const results = await readBarcodes(image, {
        formats: ['QRCode'],
        // The symbol is dense and may be skewed, glared or low-contrast: let
        // ZXing spend the extra passes rather than give up on a card we can
        // only ask the admin to re-photograph.
        tryHarder: true,
        tryInvert: true,
        tryDownscale: true,
        maxNumberOfSymbols: 1,
      });

      const text = results[0]?.text;
      const decoded = text ? decodeAadhaarQr(text) : null;
      if (decoded) return { data: decoded, width: bitmap.width };
    }
    return { data: null, width: bitmap.width };
  } finally {
    bitmap.close();
  }
}

/**
 * Same, for a card already uploaded: pull the stored image back through the
 * photo proxy (which decrypts it) and scan that. The stored copy is downscaled
 * and JPEG-compressed, so prefer scanning the picked File when one is to hand.
 */
export async function decodeAadhaarFromPhotoId(photoId: string): Promise<AadhaarScan> {
  const res = await fetch(`/api/photo/${photoId}`);
  if (!res.ok) return { data: null, width: 0 };
  return decodeAadhaarFromImage(await res.blob());
}

/**
 * Widths to try, in order. A large photo is scanned near its own resolution.
 * A small one is magnified: ZXing needs a few pixels per module to lock onto
 * the grid, and nearest-neighbour magnification hands it exactly that without
 * inventing detail. The real 484px card only decoded at 4×.
 */
export function scanWidths(naturalWidth: number): number[] {
  if (naturalWidth >= MAX_SCAN_WIDTH) return [MAX_SCAN_WIDTH, naturalWidth];

  const widths = [naturalWidth];
  for (const factor of [2, 3, 4]) {
    const scaled = naturalWidth * factor;
    if (scaled <= MAX_UPSCALE_WIDTH) widths.push(scaled);
  }
  return widths;
}

/** Draw the bitmap at `targetWidth` and read the pixels back. */
function rasterize(bitmap: ImageBitmap, targetWidth: number): ImageData | null {
  const scale = targetWidth / bitmap.width;
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  // Magnifying: keep hard module edges. Shrinking: let the browser average.
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
