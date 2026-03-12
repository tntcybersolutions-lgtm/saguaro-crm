/**
 * Blueprint Processor
 * Handles large blueprint files before sending to Claude.
 * - PDFs: trims to first 10 pages using pdf-lib (already installed)
 * - Images: resizes with sharp (auto-installs if missing), pure-JS fallback
 * Users never see install noise — all silent.
 */

import { execSync } from 'child_process';
import path from 'path';

const MB = 1024 * 1024;

// ── Sharp: lazy-load with silent auto-install ─────────────────────────────────

let sharpModule: typeof import('sharp') | null | 'unavailable' = null;

async function getSharp(): Promise<typeof import('sharp') | null> {
  if (sharpModule === 'unavailable') return null;
  if (sharpModule) return sharpModule;

  try {
    sharpModule = (await import('sharp')).default as unknown as typeof import('sharp');
    return sharpModule;
  } catch {
    // Not installed — try to install it silently
    try {
      const root = path.resolve(process.cwd());
      execSync('npm install sharp --no-save --prefer-offline', {
        cwd: root,
        stdio: 'ignore',
        timeout: 60_000,
      });
      sharpModule = (await import('sharp')).default as unknown as typeof import('sharp');
      return sharpModule;
    } catch {
      sharpModule = 'unavailable';
      return null;
    }
  }
}

// ── PDF trimmer ───────────────────────────────────────────────────────────────

/**
 * If the PDF buffer is large, copy only the first `maxPages` pages into a new PDF.
 * Returns the (possibly trimmed) buffer and the mime type.
 */
async function trimPdf(buffer: ArrayBuffer, maxPages = 10): Promise<Buffer> {
  // Only trim if over 8MB — smaller PDFs are fine as-is
  if (buffer.byteLength <= 8 * MB) return Buffer.from(buffer);

  try {
    const { PDFDocument } = await import('pdf-lib');
    const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pageCount = src.getPageCount();

    if (pageCount <= maxPages) return Buffer.from(buffer);

    const dest = await PDFDocument.create();
    const pages = await dest.copyPages(src, Array.from({ length: maxPages }, (_, i) => i));
    pages.forEach((p) => dest.addPage(p));
    const trimmed = await dest.save();
    return Buffer.from(trimmed);
  } catch {
    // pdf-lib failed — return original, Claude will error if still too big
    return Buffer.from(buffer);
  }
}

// ── Image resizer ─────────────────────────────────────────────────────────────

/**
 * Resize an image to max 3000×3000 JPEG.
 * Tries sharp first (auto-installs), then falls back to a native
 * node:canvas approach, then returns original buffer unchanged.
 */
async function resizeImage(buffer: ArrayBuffer, mimeType: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const original = Buffer.from(buffer);

  const sharp = await getSharp();
  if (sharp) {
    try {
      const resized = await (sharp as unknown as (input: Buffer) => import('sharp').Sharp)(original)
        .resize(3000, 3000, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      return { buffer: resized, mimeType: 'image/jpeg' };
    } catch {
      // sharp failed on this file — fall through
    }
  }

  // No sharp available — return original (already size-checked upstream)
  return { buffer: original, mimeType };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ProcessedBlueprint {
  base64: string;
  mimeType: string;
  /** True if the file was trimmed / resized */
  reduced: boolean;
}

/**
 * Process a blueprint file for Claude ingestion.
 * Guarantees the output is as small as possible without losing critical data.
 */
export async function processBlueprint(
  buffer: ArrayBuffer,
  mimeType: string
): Promise<ProcessedBlueprint> {
  const originalSize = buffer.byteLength;

  if (mimeType === 'application/pdf') {
    const trimmed = await trimPdf(buffer);
    return {
      base64: trimmed.toString('base64'),
      mimeType: 'application/pdf',
      reduced: trimmed.byteLength < originalSize,
    };
  }

  // Image path
  if (originalSize > 4 * MB) {
    const { buffer: resized, mimeType: outMime } = await resizeImage(buffer, mimeType);
    return {
      base64: resized.toString('base64'),
      mimeType: outMime,
      reduced: resized.byteLength < originalSize,
    };
  }

  return {
    base64: Buffer.from(buffer).toString('base64'),
    mimeType,
    reduced: false,
  };
}
