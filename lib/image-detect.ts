/**
 * lib/image-detect.ts
 *
 * Detect an image's REAL type from its magic bytes — never trust the
 * filename, extension, DB-stored mime, or HTTP content-type header. The
 * Anthropic vision API rejects the request when the declared media_type
 * disagrees with the actual bytes:
 *   "The image was specified using the image/jpeg media type, but the
 *    image appears to be a image/png image"
 *
 * `prepareImageForClaude` normalizes any input to a base64 + media_type
 * pair that Claude accepts:
 *   - respects EXIF orientation (iPhone photos come in sideways)
 *   - downscales anything wider than 2000px (faster upload + AI, same accuracy)
 *   - converts HEIC/HEIF (iPhone camera default) and unknown formats to JPEG
 *   - throws ImagePrepError (→ HTTP 422) when a file cannot be read as an image
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type ClaudeImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
export type DetectedType = ClaudeImageMediaType | 'application/pdf' | 'unknown';

/** Thrown when an image cannot be read/converted — routes should return 422. */
export class ImagePrepError extends Error {
  constructor(message = "Couldn't read that image. Use a photo (JPG/PNG) of the floor plan.") {
    super(message);
    this.name = 'ImagePrepError';
  }
}

/** Sniff the real container type from the leading magic bytes. */
export function detectImageType(buf: Buffer): DetectedType {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 4 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif'; // "GIF8"
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return 'unknown';
}

/** HEIC/HEIF — iPhone's default camera format. ISO-BMFF `ftyp` box with a heif brand. */
export function isHeic(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf.toString('ascii', 4, 8) !== 'ftyp') return false;
  const brand = buf.toString('ascii', 8, 12).toLowerCase();
  return ['heic', 'heix', 'hevc', 'heim', 'heis', 'heif', 'mif1', 'msf1'].includes(brand);
}

// ── sharp: lazy-load (declared in package.json; may be unavailable at runtime) ──
let sharpModule: any = null;
let sharpUnavailable = false;
async function getSharp(): Promise<any> {
  if (sharpUnavailable) return null;
  if (sharpModule) return sharpModule;
  try {
    sharpModule = (await import('sharp' as any)).default;
    return sharpModule;
  } catch {
    sharpUnavailable = true;
    console.warn('[image-detect] sharp not available — falling back to byte-detected passthrough');
    return null;
  }
}

const MAX_WIDTH = 2000;

/**
 * Normalize an arbitrary image buffer into a Claude-ready { base64, mediaType }.
 * The media_type is derived from the ACTUAL bytes (or the format we re-encode
 * to), so it can never disagree with the payload.
 */
export async function prepareImageForClaude(
  input: Buffer | ArrayBuffer
): Promise<{ base64: string; mediaType: ClaudeImageMediaType }> {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const detected = detectImageType(buf);
  const heic = detected === 'unknown' && isHeic(buf);

  const sharp = await getSharp();
  if (sharp) {
    try {
      const meta = await sharp(buf, { failOn: 'none' }).metadata();
      const needsResize = (meta.width ?? 0) > MAX_WIDTH;
      const base = () => {
        let p = sharp(buf, { failOn: 'none' }).rotate(); // rotate() bakes in EXIF orientation
        if (needsResize) p = p.resize({ width: MAX_WIDTH, withoutEnlargement: true });
        return p;
      };

      // Keep a supported format as-is (rotated/resized); everything else → JPEG.
      if (detected === 'image/png') {
        const out = await base().png().toBuffer();
        return { base64: out.toString('base64'), mediaType: 'image/png' };
      }
      if (detected === 'image/webp') {
        const out = await base().webp().toBuffer();
        return { base64: out.toString('base64'), mediaType: 'image/webp' };
      }
      if (detected === 'image/gif' && !needsResize) {
        // sharp flattens animation; a static GIF is fine for vision, but avoid
        // re-encoding when we don't have to — the bytes already match the type.
        return { base64: buf.toString('base64'), mediaType: 'image/gif' };
      }
      // jpeg, oversized gif, heic/heif, or unknown-but-decodable → JPEG
      const out = await base().jpeg({ quality: 88 }).toBuffer();
      return { base64: out.toString('base64'), mediaType: 'image/jpeg' };
    } catch (err) {
      console.warn('[image-detect] sharp normalize failed:', err instanceof Error ? err.message : err);
      // fall through to no-sharp handling
    }
  }

  // No sharp (or it failed): trust the DETECTED bytes, never the caller's label.
  if (detected === 'image/png' || detected === 'image/jpeg' || detected === 'image/gif' || detected === 'image/webp') {
    return { base64: buf.toString('base64'), mediaType: detected };
  }

  // HEIC / unrecognized and no working sharp → cannot safely send.
  throw new ImagePrepError(
    heic
      ? "Couldn't read that HEIC photo. Turn on 'Most Compatible' in iPhone Camera settings, or upload a JPG/PNG."
      : "Couldn't read that image. Use a photo (JPG/PNG) of the floor plan."
  );
}
