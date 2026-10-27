import { PNG } from 'pngjs';

/**
 * Returns PNG image bytes with near-white pixels made fully transparent, so
 * a logo exported with a plain white (or off-white) background blends into
 * the certificate's cream background instead of showing as a visible white
 * box. Pixels are compared per-channel against `threshold` (out of 255) —
 * only genuinely light pixels are affected, so the logo's own artwork
 * (unless it's itself near-white) is untouched.
 *
 * JPEG/WEBP bytes can't represent transparency at all, and any input that
 * isn't a well-formed PNG is returned unchanged rather than throwing — this
 * is a cosmetic improvement, never a reason to fail rendering a certificate.
 */
export function stripNearWhiteBackground(bytes: Buffer, threshold = 235): Buffer {
  let png: PNG;
  try {
    png = PNG.sync.read(bytes);
  } catch {
    return bytes;
  }

  const { data, width, height } = png;
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    const r = data[offset]!;
    const g = data[offset + 1]!;
    const b = data[offset + 2]!;
    if (r >= threshold && g >= threshold && b >= threshold) {
      data[offset + 3] = 0;
    }
  }

  return PNG.sync.write(png);
}
