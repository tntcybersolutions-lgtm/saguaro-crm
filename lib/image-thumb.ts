/**
 * SERVER-SIDE IMAGE DOWNSCALE + THUMBNAIL RENDERING (sharp)
 * ─────────────────────────────────────────────────────────
 * WHY THIS EXISTS (the phone-freezing bug):
 *
 * Real photos in this tenant's storage are 2.4–3.6 MB, 12-megapixel JPEGs
 * straight off a phone camera. Every image grid renders `photos.url` — the
 * FULL-RESOLUTION original — in every tile, ~18 tiles up front. Eighteen 12MP
 * decodes is several hundred megabytes of bitmap on the UI thread: the app stops
 * responding and low-memory devices get killed. The `photos` table has carried a
 * `thumbnail_url` column the whole time with ZERO rows populated.
 *
 * WHAT WE DO NOT DO: Supabase image transformation (`createSignedUrl(..., {
 * transform: { width } })`). It is a paid add-on that is NOT enabled on this
 * project and it fails SILENTLY — HTTP 200, a perfectly valid signed URL, then
 * byte-identical full-size bytes (measured: 3,071,644 bytes either way). Any fix
 * built on that parameter passes code review and fixes nothing on the phone.
 *
 * SO: we render real bytes at UPLOAD time, with sharp (already a dependency,
 * already used server-side by /api/takeoff/decode-image), and store both:
 *   (a) a DISPLAY original — long edge capped at MAX_DISPLAY_EDGE, JPEG q80.
 *       A jobsite record does not need 12MP; 2000px is still a sharp
 *       full-screen photo on any phone or laptop.
 *   (b) a THUMB — 400px wide, JPEG q72 — written to a `thumbs/` sibling path and
 *       stored in `thumbnail_url` for grids to read.
 *
 * THUMB PATH + QUALITY ARE DELIBERATELY IDENTICAL to scripts/backfill-photo-thumbs.ts
 * (`<dir>/thumbs/<stem>.jpg`, width 400, q72, mozjpeg) so a live upload and a
 * backfill of the historical rows converge on the same object rather than
 * scattering two competing thumbnails per photo.
 *
 * HEIC/HEIF — READ THIS BEFORE "FIXING" IT:
 * The prebuilt libvips inside sharp ships an AVIF (AV1) codec but NO HEVC codec.
 * `sharp.format.heif.input.fileSuffix` is literally `['.avif']`, and encoding
 * `heif({compression:'hevc'})` fails with "Unsupported compression". An iPhone
 * .heic is HEVC-coded, so sharp CANNOT decode it here. Browsers and Android
 * cannot render it either, so storing one as-is means an image that displays
 * nowhere — exactly the bug. This module therefore reports HEIC it cannot decode
 * as an explicit, typed failure (`UnsupportedImageError`) instead of quietly
 * storing an undecodable object and calling the upload a success. The mobile app
 * transcodes HEIC to JPEG on-device (iOS has the codec), which is where those
 * bytes should be converted.
 */
import sharp from 'sharp';
import {
  decodeToSharpReadable,
  UnsupportedImageError as DecodeUnsupportedError,
} from './image-decode';

/** Long-edge cap for the stored "display original". Still sharp full-screen. */
export const MAX_DISPLAY_EDGE = 2000;
/** JPEG quality for the stored display original. */
export const DISPLAY_QUALITY = 80;
/** Thumbnail width. Matches scripts/backfill-photo-thumbs.ts. */
export const THUMB_WIDTH = 400;
/** Thumbnail JPEG quality. Matches scripts/backfill-photo-thumbs.ts. */
export const THUMB_QUALITY = 72;

/** A set of bytes we actually rendered, with everything the caller needs to store it. */
export interface RenderedImage {
  buffer: Buffer;
  /** MIME to store the object under. */
  contentType: string;
  /** File extension (no dot) matching `contentType`. */
  extension: string;
  width: number;
  height: number;
  bytes: number;
}

export interface SourceInfo {
  /** sharp's detected container format (`jpeg`, `png`, `heif`, …), or null. */
  format: string | null;
  width: number | null;
  height: number | null;
  bytes: number;
}

export type ImageProcessResult =
  | {
      kind: 'processed';
      display: RenderedImage;
      /** null only when the thumbnail render failed; `thumbError` then says why. */
      thumb: RenderedImage | null;
      source: SourceInfo;
      thumbError?: string;
    }
  | {
      /** Not something we re-encode (PDF, animated GIF, SVG, unknown). Store the original. */
      kind: 'passthrough';
      reason: string;
    };

/**
 * The upload is an image we can identify but provably cannot decode on this
 * server — in practice an HEVC-coded .heic. Callers must NOT store these: the
 * object would render on no browser and no Android device.
 */
export class UnsupportedImageError extends Error {
  readonly code = 'UNSUPPORTED_IMAGE';
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedImageError';
  }
}

/** ISO-BMFF brands that mean "HEIF container". `avif`/`avis` are excluded — sharp reads those. */
const HEIF_BRANDS = new Set([
  'heic',
  'heix',
  'heim',
  'heis',
  'hevc',
  'hevx',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
]);

/**
 * Sniff the ISO-BMFF major brand from the file's own bytes. More trustworthy
 * than the filename or the browser-supplied content type, both of which are
 * routinely wrong ('application/octet-stream' for a real JPEG, '.jpg' on a HEIC).
 */
export function heifBrandOf(input: Buffer): string | null {
  if (input.length < 12) return null;
  if (input.toString('latin1', 4, 8) !== 'ftyp') return null;
  const brand = input.toString('latin1', 8, 12).toLowerCase();
  return HEIF_BRANDS.has(brand) ? brand : null;
}

/** True when the bytes are an HEVC-family HEIF that sharp's libvips cannot decode. */
export function isHeicLike(input: Buffer, filename?: string | null, contentType?: string | null): boolean {
  if (heifBrandOf(input)) return true;
  const name = (filename ?? '').toLowerCase();
  const type = (contentType ?? '').toLowerCase();
  return /\.(heic|heif)$/.test(name) || type.includes('heic') || type.includes('heif');
}

/** Extension (no dot, lowercased) for a rendered format. */
function extensionForFormat(format: 'jpeg' | 'png' | 'webp'): string {
  return format === 'jpeg' ? 'jpg' : format;
}

/** MIME for a rendered format. */
function contentTypeForFormat(format: 'jpeg' | 'png' | 'webp'): string {
  return format === 'jpeg' ? 'image/jpeg' : format === 'png' ? 'image/png' : 'image/webp';
}

/**
 * Rewrite a filename's extension so it matches the bytes we actually wrote.
 * A file transcoded to JPEG must not keep a `.heic`/`.png` name — a lying
 * extension is how an object ends up in an `<img>` tag that cannot render it.
 */
export function withExtension(name: string, extension: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem}.${extension}`;
}

/**
 * `projects/x/photos/1712-a.jpg` → `projects/x/photos/thumbs/1712-a.jpg`.
 * Deterministic from the display object's path, and BYTE-IDENTICAL to the rule in
 * scripts/backfill-photo-thumbs.ts so the two paths can never diverge.
 */
export function thumbPathFor(objectPath: string, extension = 'jpg'): string {
  const slash = objectPath.lastIndexOf('/');
  const dir = slash >= 0 ? objectPath.slice(0, slash) : '';
  const base = slash >= 0 ? objectPath.slice(slash + 1) : objectPath;
  const stem = base.replace(/\.[^.]+$/, '') || base;
  const prefix = dir ? `${dir}/` : '';
  return `${prefix}thumbs/${stem}.${extension}`;
}

/** Formats we re-encode. Anything else is passed through untouched. */
const RESIZABLE = new Set(['jpeg', 'png', 'webp', 'tiff', 'heif', 'avif', 'jp2']);

export interface ProcessOptions {
  maxDisplayEdge?: number;
  displayQuality?: number;
  thumbWidth?: number;
  thumbQuality?: number;
  /** Skip the thumbnail render when nothing will store a thumbnail url. */
  wantThumb?: boolean;
  /** Original filename, used only to make decode errors name the file. */
  fileName?: string | null;
}

/**
 * Downscale an uploaded image and render its grid thumbnail.
 *
 * Returns `kind: 'passthrough'` for anything that is not a still image we can
 * safely re-encode (PDFs, animated GIFs, SVG) — the caller stores the original.
 * Throws `UnsupportedImageError` for HEIC/HEIF this server has no codec for, so
 * the caller can refuse the upload rather than store bytes nothing can display.
 * Any OTHER sharp failure is also thrown, with the underlying message attached —
 * this module never returns a success shape for work it did not do.
 */
export async function processImageUpload(
  input: Buffer,
  opts: ProcessOptions = {},
): Promise<ImageProcessResult> {
  const maxEdge = opts.maxDisplayEdge ?? MAX_DISPLAY_EDGE;
  const displayQ = opts.displayQuality ?? DISPLAY_QUALITY;
  const thumbW = opts.thumbWidth ?? THUMB_WIDTH;
  const thumbQ = opts.thumbQuality ?? THUMB_QUALITY;
  const wantThumb = opts.wantThumb !== false;

  if (!input || input.length === 0) {
    throw new Error('The uploaded file was empty — nothing to store.');
  }

  /* DECODE FIRST, then process.
   *
   * This used to refuse a HEVC-branded HEIF outright, because sharp's libvips
   * ships an AVIF codec but no HEVC one. Honest, but a dead end: it left real
   * iPhone photos in storage that no browser and no Android device can render,
   * and every future iPhone upload hit the same wall.
   *
   * lib/image-decode.ts now normalises the source first — sharp-native formats
   * pass straight through untouched, HEIC is transcoded to JPEG via a real
   * decoder, and anything genuinely unreadable still raises the same typed
   * UnsupportedImageError. Detection is by magic bytes, so a HEVC file that a
   * share sheet renamed to .jpg is handled correctly too.
   *
   * `decoded.buffer` is what the rest of this function must use. `input` may be
   * bytes sharp cannot open. */
  let decoded;
  try {
    decoded = await decodeToSharpReadable(input, opts.fileName ?? null);
  } catch (e: unknown) {
    if (e instanceof DecodeUnsupportedError) {
      // Re-raise as this module's own error type so existing callers (the
      // upload route's 415 branch) keep working unchanged.
      throw new UnsupportedImageError(e.message);
    }
    throw e;
  }
  const decodedInput = decoded.buffer;
  const transcodeNote = decoded.note;

  // `failOn: 'none'` keeps slightly-truncated phone JPEGs usable instead of
  // rejecting a photo that every viewer opens fine.
  let meta: sharp.Metadata;
  try {
    meta = await sharp(decodedInput, { failOn: 'none' }).metadata();
  } catch (e: unknown) {
    return { kind: 'passthrough', reason: `not a decodable image (${errText(e)}) — stored as uploaded` };
  }

  const format = meta.format ?? null;
  const source: SourceInfo = {
    format,
    width: typeof meta.width === 'number' ? meta.width : null,
    height: typeof meta.height === 'number' ? meta.height : null,
    bytes: input.length,
  };

  if (!format || !RESIZABLE.has(format)) {
    // Animated GIF (re-encoding destroys the animation), SVG (vector), PDF, or
    // whatever else was posted to a photo endpoint. Store it as it arrived.
    return { kind: 'passthrough', reason: `${format ?? 'unknown format'} is not re-encoded — stored as uploaded` };
  }

  // PNG and WEBP keep their own format: these carry signatures and markup
  // overlays, and flattening transparency into JPEG paints a black box behind a
  // signature. WEBP likewise stays WEBP so an animated/alpha asset is not ruined.
  const outFormat: 'jpeg' | 'png' | 'webp' = format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpeg';

  let display: RenderedImage;
  try {
    display = await render(decodedInput, {
      resize: { width: maxEdge, height: maxEdge, fit: 'inside' },
      format: outFormat,
      quality: displayQ,
      flatten: false,
    });
  } catch (e: unknown) {
    if (isHeicLike(input)) {
      throw new UnsupportedImageError(
        `This HEIC/HEIF image cannot be decoded on the server (${errText(e)}). Export it as JPEG and upload again.`,
      );
    }
    // Not a silent fallback: the caller decides, and it is told the render failed.
    throw new Error(`Could not process this image: ${errText(e)}`);
  }

  if (!wantThumb) {
    return { kind: 'processed', display, thumb: null, source };
  }

  // Render the thumb from the DISPLAY bytes, not the 12MP original: a 2000px
  // decode is ~1/9th the pixels, so this stage costs almost nothing. Thumbs are
  // always JPEG — matching the backfill — so alpha is flattened onto white
  // rather than becoming a black block behind a signature.
  let thumb: RenderedImage | null = null;
  let thumbError: string | undefined;
  try {
    thumb = await render(display.buffer, {
      resize: { width: thumbW },
      format: 'jpeg',
      quality: thumbQ,
      flatten: outFormat !== 'jpeg',
    });
  } catch (e: unknown) {
    // Survivable and reported: the photo itself is already rendered and will be
    // stored. The row simply keeps a null thumbnail_url, and the caller says so.
    thumbError = errText(e);
  }

  return { kind: 'processed', display, thumb, source, thumbError };
}

interface RenderSpec {
  resize: { width: number; height?: number; fit?: keyof sharp.FitEnum };
  format: 'jpeg' | 'png' | 'webp';
  quality: number;
  /** Composite onto white before encoding — required when going alpha → JPEG. */
  flatten: boolean;
}

async function render(input: Buffer, spec: RenderSpec): Promise<RenderedImage> {
  // `.rotate()` with no argument applies the EXIF orientation tag and then drops
  // it. It MUST run before `.resize()`, otherwise a portrait phone photo is
  // resized against its stored (landscape) dimensions and lands sideways once
  // the orientation tag is stripped by the re-encode.
  // `input` here is render()'s own parameter — the caller has already passed
  // DECODED bytes (see processImageUpload), so this is safe for HEIC sources.
  let pipeline = sharp(input, { failOn: 'none' }).rotate();

  if (spec.flatten) pipeline = pipeline.flatten({ background: '#ffffff' });

  pipeline = pipeline.resize({
    width: spec.resize.width,
    height: spec.resize.height,
    fit: spec.resize.fit ?? 'inside',
    // Never upscale: a 300px signature must not be blown up to 2000px.
    withoutEnlargement: true,
  });

  if (spec.format === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: spec.quality, mozjpeg: true, chromaSubsampling: '4:2:0' });
  } else if (spec.format === 'png') {
    pipeline = pipeline.png({ compressionLevel: 9 });
  } else {
    pipeline = pipeline.webp({ quality: spec.quality });
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    buffer: data,
    contentType: contentTypeForFormat(spec.format),
    extension: extensionForFormat(spec.format),
    width: info.width,
    height: info.height,
    bytes: data.length,
  };
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message.split('\n')[0] : String(e);
}
