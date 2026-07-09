import { describe, expect, it } from 'vitest';
import { scanWidths } from './scan-image';

/**
 * The ladder that made a real 484px card scan decode. Its QR sits at roughly a
 * 1px module pitch, and ZXing only locks onto the grid once the image is
 * magnified — measured: it reads at 1936px (4×) and not below.
 */
describe('scanWidths', () => {
  it('magnifies a small card up to 4x, in increasing order', () => {
    expect(scanWidths(484)).toEqual([484, 968, 1452, 1936]);
  });

  it('reaches 4x for the real 484px card scan that only decodes there', () => {
    expect(scanWidths(484)).toContain(484 * 4);
  });

  it('stops magnifying before the raster gets wasteful', () => {
    // 1200 * 4 = 4800 > 4000, so the 4x rung is dropped.
    expect(scanWidths(1200)).toEqual([1200, 2400, 3600]);
    for (const w of scanWidths(1200)) expect(w).toBeLessThanOrEqual(4000);
  });

  it('never magnifies an image that is already big enough', () => {
    // A phone photo: scan a downscaled copy first (fast), then full resolution.
    expect(scanWidths(3000)).toEqual([2400, 3000]);
    expect(scanWidths(2400)).toEqual([2400, 2400]);
  });

  it('tries the cheap raster before the expensive one', () => {
    const widths = scanWidths(600);
    expect(widths[0]).toBe(600);
    expect(widths[widths.length - 1]).toBe(2400);
  });
});
