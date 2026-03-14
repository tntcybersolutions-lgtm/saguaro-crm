/**
 * Blueprint Processor — bulletproof fallback chain
 *
 * NEVER throws an unhandled error. Every path returns a result or a friendly error.
 *
 * PDF fallback chain:
 *   1. pdf-lib trims to first 8 pages → base64 → document type
 *   2. pdf-lib fails → send raw PDF as-is (up to 20MB)
 *   3. Over 20MB → convert first page to image via sharp → image type
 *
 * Image fallback chain:
 *   4. sharp resizes to max 2000×2000 JPEG → image type
 *   5. sharp fails → send original if under 5MB
 *   6. Over 5MB with no sharp → friendly error
 *
 * Special cases:
 *   7. DWG → friendly error with instructions
 *   8. Unknown type → attempt as PDF, log warning
 *   9. ANY error → catch, log, use original buffer, never crash
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const MB = 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/tiff'];

// ── Sharp: lazy-load (no auto-install — sharp is in package.json) ────────────

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
    console.warn('[blueprint-processor] sharp not available — image fallbacks limited');
    return null;
  }
}

// ── PDF: trim to first N pages ───────────────────────────────────────────────

async function trimPdf(buffer: Buffer, maxPages = 8): Promise<{ buffer: Buffer; pageCount: number; trimmed: boolean }> {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pageCount = src.getPageCount();

    if (pageCount <= maxPages) {
      return { buffer, pageCount, trimmed: false };
    }

    const dest = await PDFDocument.create();
    const pages = await dest.copyPages(src, Array.from({ length: maxPages }, (_, i) => i));
    pages.forEach((p) => dest.addPage(p));
    const trimmedBytes = await dest.save();
    console.log(`[blueprint-processor] PDF trimmed: ${pageCount} → ${maxPages} pages`);
    return { buffer: Buffer.from(trimmedBytes), pageCount, trimmed: true };
  } catch (err) {
    console.warn('[blueprint-processor] pdf-lib trim failed:', err instanceof Error ? err.message : err);
    throw err; // let caller handle fallback
  }
}

// ── PDF: convert first page to image via sharp ───────────────────────────────

async function pdfFirstPageToImage(buffer: Buffer): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const sharp = await getSharp();
  if (!sharp) return null;

  try {
    const resized = await sharp(buffer, { density: 200, pages: 1 })
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    console.log(`[blueprint-processor] PDF→image: ${(buffer.byteLength / MB).toFixed(1)}MB → ${(resized.byteLength / MB).toFixed(1)}MB`);
    return { buffer: resized, mimeType: 'image/jpeg' };
  } catch (err) {
    console.warn('[blueprint-processor] PDF→image failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Image: resize ────────────────────────────────────────────────────────────

async function resizeImage(buffer: Buffer): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const sharp = await getSharp();
  if (!sharp) return null;

  try {
    const resized = await sharp(buffer)
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { buffer: resized, mimeType: 'image/jpeg' };
  } catch (err) {
    console.warn('[blueprint-processor] sharp resize failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ── PDF page count (non-throwing) ────────────────────────────────────────────

export async function getPdfPageCount(buffer: Buffer | ArrayBuffer): Promise<number> {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return src.getPageCount();
  } catch {
    return 0;
  }
}

// ── Generate thumbnail from first page ───────────────────────────────────────

export async function generateThumbnail(buffer: Buffer, mimeType: string): Promise<Buffer | null> {
  const sharp = await getSharp();
  if (!sharp) return null;

  try {
    const input = mimeType === 'application/pdf'
      ? sharp(buffer, { density: 150, pages: 1 })
      : sharp(buffer);

    return await input
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
  } catch (err) {
    console.warn('[blueprint-processor] thumbnail generation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface ProcessedBlueprint {
  base64: string;
  mimeType: string;
  /** True if the file was trimmed / resized */
  reduced: boolean;
  /** Friendly error — if set, do NOT send to Claude */
  error?: string;
}

/**
 * Process a blueprint file for Claude ingestion.
 * NEVER throws. Returns { error } for unsupported scenarios.
 */
export async function processBlueprint(
  rawBuffer: ArrayBuffer,
  mimeType: string
): Promise<ProcessedBlueprint> {
  const buffer = Buffer.from(rawBuffer);

  try {
    // ── DWG detection (rule 7) ─────────────────────────────────────────────
    if (
      mimeType === 'application/acad' ||
      mimeType === 'application/x-acad' ||
      mimeType === 'image/vnd.dwg' ||
      mimeType === 'application/dwg'
    ) {
      return {
        base64: '',
        mimeType,
        reduced: false,
        error: 'DWG files coming soon. Please export as PDF from AutoCAD first.',
      };
    }

    const isPdf = mimeType === 'application/pdf';
    const isImage = IMAGE_TYPES.includes(mimeType);

    // ── Unknown type → attempt as PDF with warning (rule 8) ────────────────
    if (!isPdf && !isImage) {
      console.warn(`[blueprint-processor] Unknown MIME "${mimeType}" — attempting as PDF`);
      return processPdf(buffer);
    }

    // ── PDF path (rules 1-3) ───────────────────────────────────────────────
    if (isPdf) {
      return processPdf(buffer);
    }

    // ── Image path (rules 4-6) ─────────────────────────────────────────────
    return processImage(buffer, mimeType);

  } catch (err) {
    // RULE 9: ANY error → catch, log, use original buffer, never crash
    console.error('[blueprint-processor] Unexpected error, using raw buffer:', err);
    return safeRawReturn(buffer, mimeType);
  }
}

// ── PDF processing with full fallback chain ──────────────────────────────────

async function processPdf(buffer: Buffer): Promise<ProcessedBlueprint> {
  const size = buffer.byteLength;

  // Rule 1: pdf-lib trim to 8 pages
  try {
    const { buffer: trimmed, trimmed: wasTrimmed } = await trimPdf(buffer, 4);

    // If trimmed result is under 20MB, send as document
    if (trimmed.byteLength <= 20 * MB) {
      return {
        base64: trimmed.toString('base64'),
        mimeType: 'application/pdf',
        reduced: wasTrimmed,
      };
    }
    // Trimmed but still over 20MB → fall to image conversion below
  } catch {
    // pdf-lib failed entirely → Rule 2: raw PDF if under 20MB
    if (size <= 20 * MB) {
      console.log(`[blueprint-processor] pdf-lib failed, sending raw PDF (${(size / MB).toFixed(1)}MB)`);
      return {
        base64: buffer.toString('base64'),
        mimeType: 'application/pdf',
        reduced: false,
      };
    }
  }

  // Rule 3: Over 20MB → convert first page to image via sharp
  const imageResult = await pdfFirstPageToImage(buffer);
  if (imageResult) {
    return {
      base64: imageResult.buffer.toString('base64'),
      mimeType: imageResult.mimeType,
      reduced: true,
    };
  }

  // Last resort: if under 20MB send raw, otherwise error
  if (size <= 20 * MB) {
    return {
      base64: buffer.toString('base64'),
      mimeType: 'application/pdf',
      reduced: false,
    };
  }

  return {
    base64: '',
    mimeType: 'application/pdf',
    reduced: false,
    error: `Blueprint PDF is too large (${Math.round(size / MB)}MB). Please reduce to under 20MB, or export fewer pages.`,
  };
}

// ── Image processing with full fallback chain ────────────────────────────────

async function processImage(buffer: Buffer, mimeType: string): Promise<ProcessedBlueprint> {
  const size = buffer.byteLength;

  // Rule 4: sharp resize to 2000×2000
  const resized = await resizeImage(buffer);
  if (resized) {
    return {
      base64: resized.buffer.toString('base64'),
      mimeType: resized.mimeType,
      reduced: resized.buffer.byteLength < size,
    };
  }

  // Rule 5: no sharp → send original if under 5MB
  if (size <= 5 * MB) {
    const safeMime = IMAGE_TYPES.includes(mimeType) ? mimeType : 'image/jpeg';
    return {
      base64: buffer.toString('base64'),
      mimeType: safeMime,
      reduced: false,
    };
  }

  // Rule 6: over 5MB, no sharp → friendly error
  return {
    base64: '',
    mimeType,
    reduced: false,
    error: `Image is too large (${Math.round(size / MB)}MB) and image processing is unavailable. Please resize to under 5MB, or export as PDF instead.`,
  };
}

// ── Safe raw return (rule 9 — never crash) ───────────────────────────────────

function safeRawReturn(buffer: Buffer, mimeType: string): ProcessedBlueprint {
  try {
    if (buffer.byteLength > 20 * MB) {
      return {
        base64: '',
        mimeType,
        reduced: false,
        error: `File is too large (${Math.round(buffer.byteLength / MB)}MB) for processing. Please reduce file size and try again.`,
      };
    }
    return {
      base64: buffer.toString('base64'),
      mimeType: mimeType || 'application/pdf',
      reduced: false,
    };
  } catch {
    return {
      base64: '',
      mimeType: mimeType || 'application/octet-stream',
      reduced: false,
      error: 'Failed to process file. Please try a different format (PDF or JPEG recommended).',
    };
  }
}
