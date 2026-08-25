/**
 * lib/image-decode.ts — normalise ANY photo a jobsite device produces into
 * bytes that sharp can read.
 *
 * WHY THIS EXISTS
 * The pipeline in lib/image-thumb.ts used to refuse an iPhone .heic outright.
 * That was honest but it was a dead end: four real field photos are sitting in
 * production storage that no browser and no Android device can display, and
 * every future iPhone upload would have hit the same wall. sharp's bundled
 * libvips ships an AVIF decoder but NOT HEVC, and an iPhone .heic is HEVC —
 * `sharp.format.heif.input.fileSuffix` is literally ['.avif'].
 *
 * So decoding is now a CHAIN rather than a single attempt, and every format a
 * crew is realistically going to produce has a route through it:
 *
 *   iPhone            .heic / .heif (HEVC)  -> heic-convert -> JPEG -> sharp
 *   iPhone (modern)   .avif                 -> sharp directly
 *   Android / DSLR    .jpg .png .webp .tif  -> sharp directly
 *   Screenshots       .png                  -> sharp directly
 *   Scanners          .tiff .gif            -> sharp directly
 *   anything else                           -> typed UnsupportedImageError
 *                                              naming what was actually seen
 *
 * DESIGN NOTES
 * - The decoder is resolved through a dynamic import and is OPTIONAL. If
 *   heic-convert is ever dropped from the bundle, HEIC degrades to the same
 *   typed error as before instead of crashing the route.
 * - Detection is by MAGIC BYTES first, filename second. A phone that uploads
 *   IMG_1234.jpg containing HEVC bytes (it happens — some share sheets rename
 *   without transcoding) is still handled correctly.
 * - Nothing here writes or uploads. It returns bytes and a description of what
 *   it had to do, so callers can log honestly and users can be told the truth.
 */

import type { Buffer as NodeBuffer } from 'node:buffer';

/** ISO-BMFF major brands that mean "HEIF container holding HEVC".
 *  `avif`/`avis` are deliberately absent — sharp decodes those natively. */
const HEVC_HEIF_BRANDS = new Set([
  'heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1',
]);

/** Formats sharp reads without help, by magic bytes. */
const SHARP_NATIVE = ['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif', 'svg'] as const;

export type SourceKind =
  | 'jpeg' | 'png' | 'webp' | 'avif' | 'tiff' | 'gif' | 'svg'
  | 'heic'          // HEIF container, HEVC-coded — needs transcoding
  | 'unknown';

export class UnsupportedImageError extends Error {
  readonly code = 'UNSUPPORTED_IMAGE';
  readonly kind: SourceKind;
  constructor(message: string, kind: SourceKind) {
    super(message);
    this.name = 'UnsupportedImageError';
    this.kind = kind;
  }
}

export interface DecodedSource {
  /** Bytes sharp can definitely open. Identical to the input unless transcoded. */
  buffer: NodeBuffer;
  /** What the ORIGINAL actually was, by bytes — not by file extension. */
  sourceKind: SourceKind;
  /** True when we had to convert to get here (HEIC today). */
  transcoded: boolean;
  /** Human-readable account of what happened, for logs and warnings. */
  note: string | null;
}

/**
 * Identify a buffer by its own bytes. Filenames lie; magic numbers do not.
 */
export function sniff(input: NodeBuffer): SourceKind {
  if (input.length < 12) return 'unknown';

  // ISO-BMFF (HEIF/AVIF): bytes 4-8 are 'ftyp', 8-12 the major brand.
  if (input.toString('latin1', 4, 8) === 'ftyp') {
    const brand = input.toString('latin1', 8, 12).toLowerCase();
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (HEVC_HEIF_BRANDS.has(brand)) return 'heic';
    // An unrecognised ftyp brand is still most likely HEIF from some device;
    // let the chain try to transcode it rather than refusing on a guess.
    return 'heic';
  }

  if (input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return 'jpeg';
  if (input.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (input.toString('latin1', 0, 4) === 'RIFF' && input.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (input.toString('latin1', 0, 3) === 'GIF') return 'gif';
  // TIFF: II*\0 (little-endian) or MM\0* (big-endian)
  if ((input[0] === 0x49 && input[1] === 0x49 && input[2] === 0x2a) ||
      (input[0] === 0x4d && input[1] === 0x4d && input[2] === 0x00)) return 'tiff';
  // SVG is text; look for a root element in the opening bytes.
  const head = input.toString('utf8', 0, Math.min(input.length, 256)).trimStart();
  if (head.startsWith('<?xml') || head.startsWith('<svg')) return 'svg';

  return 'unknown';
}

/** Load heic-convert lazily. Returns null when it is not installed. */
async function loadHeicDecoder(): Promise<((o: { buffer: NodeBuffer; format: 'JPEG'; quality: number }) => Promise<ArrayBuffer | NodeBuffer>) | null> {
  try {
    const mod: unknown = await import('heic-convert');
    const fn = (mod as { default?: unknown }).default ?? mod;
    return typeof fn === 'function' ? (fn as never) : null;
  } catch {
    return null;
  }
}

/**
 * Turn any supported source into sharp-readable bytes.
 *
 * @param input        the raw uploaded/downloaded bytes
 * @param filename     optional, used only to enrich error messages
 * @param heicQuality  JPEG quality for the HEIC transcode (0-1). 0.92 keeps a
 *                     12MP photo visually lossless while staying well under the
 *                     original's size; the display copy is re-encoded later
 *                     anyway, so this is an intermediate, not the stored file.
 */
export async function decodeToSharpReadable(
  input: NodeBuffer,
  filename?: string | null,
  heicQuality = 0.92,
): Promise<DecodedSource> {
  const kind = sniff(input);

  if ((SHARP_NATIVE as readonly string[]).includes(kind)) {
    return { buffer: input, sourceKind: kind, transcoded: false, note: null };
  }

  if (kind === 'heic') {
    const convert = await loadHeicDecoder();
    if (!convert) {
      throw new UnsupportedImageError(
        `${filename || 'This photo'} is an iPhone HEIC and no HEIC decoder is installed on the server, ` +
        `so it cannot be converted. Install heic-convert, or set the iPhone to ` +
        `Settings > Camera > Formats > Most Compatible so it captures JPEG.`,
        'heic',
      );
    }
    try {
      const out = await convert({ buffer: input, format: 'JPEG', quality: heicQuality });
      const buf = (Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer)) as NodeBuffer;
      if (!buf.length) throw new Error('decoder returned no bytes');
      return {
        buffer: buf,
        sourceKind: 'heic',
        transcoded: true,
        note: `HEIC transcoded to JPEG (${(input.length / 1024 / 1024).toFixed(2)} MB -> ${(buf.length / 1024 / 1024).toFixed(2)} MB) — browsers and Android cannot render HEIC.`,
      };
    } catch (e: unknown) {
      const why = e instanceof Error ? e.message : String(e);
      throw new UnsupportedImageError(
        `${filename || 'This photo'} looks like an iPhone HEIC but could not be decoded: ${why}`,
        'heic',
      );
    }
  }

  throw new UnsupportedImageError(
    `${filename || 'This file'} is not an image this server can read ` +
    `(detected: ${kind}). Supported: JPEG, PNG, WebP, AVIF, TIFF, GIF and iPhone HEIC.`,
    kind,
  );
}
