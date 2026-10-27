import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { stripNearWhiteBackground } from '@/lib/logoBackground';

function makePng(pixels: [number, number, number][][]): Buffer {
  const height = pixels.length;
  const width = pixels[0]!.length;
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixels[y]![x]!;
      const offset = (width * y + x) * 4;
      png.data[offset] = r;
      png.data[offset + 1] = g;
      png.data[offset + 2] = b;
      png.data[offset + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function readPixelAlpha(bytes: Buffer, x: number, y: number): number {
  const png = PNG.sync.read(bytes);
  const offset = (png.width * y + x) * 4;
  return png.data[offset + 3]!;
}

describe('stripNearWhiteBackground', () => {
  it('makes a pure white pixel fully transparent', () => {
    const input = makePng([[[255, 255, 255]]]);
    const output = stripNearWhiteBackground(input);
    expect(readPixelAlpha(output, 0, 0)).toBe(0);
  });

  it('leaves a saturated color pixel fully opaque', () => {
    const input = makePng([[[20, 100, 180]]]);
    const output = stripNearWhiteBackground(input);
    expect(readPixelAlpha(output, 0, 0)).toBe(255);
  });

  it('treats an off-white background (e.g. JPEG re-export compression) as background too, using the default threshold', () => {
    const input = makePng([[[245, 246, 248]]]);
    const output = stripNearWhiteBackground(input);
    expect(readPixelAlpha(output, 0, 0)).toBe(0);
  });

  it('only strips pixels on the light side of a custom threshold, not darker ones', () => {
    const input = makePng([[[200, 200, 200]]]);
    expect(readPixelAlpha(stripNearWhiteBackground(input, 235), 0, 0)).toBe(255);
    expect(readPixelAlpha(stripNearWhiteBackground(input, 190), 0, 0)).toBe(0);
  });

  it('strips only the white background pixels, keeping a colored logo mark opaque in the same image', () => {
    const input = makePng([
      [
        [255, 255, 255],
        [200, 30, 30],
        [255, 255, 255],
      ],
    ]);
    const output = stripNearWhiteBackground(input);
    expect(readPixelAlpha(output, 0, 0)).toBe(0);
    expect(readPixelAlpha(output, 1, 0)).toBe(255);
    expect(readPixelAlpha(output, 2, 0)).toBe(0);
  });

  it('returns non-PNG bytes unchanged instead of throwing', () => {
    const notAPng = Buffer.from('this is not a png file at all');
    expect(stripNearWhiteBackground(notAPng)).toEqual(notAPng);
  });
});
