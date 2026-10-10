'use client';
/**
 * Shrink a photo on the phone before it uploads.
 *
 * A phone photo is 12 MP and 3–6 MB; the server keeps a 2000 px display copy
 * and a 400 px thumbnail (lib/image-thumb.ts), so most of those bytes are
 * thrown away after crossing a jobsite's cell signal. Re-encoding to 2400 px
 * on the long edge first sends roughly a fifth of the bytes with no visible
 * difference in what's stored.
 *
 * Safe by construction: any failure, an unsupported type, a small file, or a
 * result that isn't smaller hands back the ORIGINAL file untouched.
 *
 * Orientation: decoded through an <img>, which applies the EXIF rotation, and
 * drawn as displayed (every current browser draws EXIF-oriented images onto a
 * canvas upright) — so the upright pixels are what get re-encoded.
 */

/** Long edge sent to the server (it renders its own 2000 px copy from this). */
export const UPLOAD_MAX_EDGE = 2400;
const QUALITY = 0.86;
/** Below this, the saving isn't worth a re-encode. */
const MIN_BYTES = 900_000;

const SHRINKABLE = /^image\/(jpeg|jpg|pjpeg|heic|heif|webp)$/i;
const SHRINKABLE_EXT = /\.(jpe?g|heic|heif|webp)$/i;

function decode(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

export async function shrinkForUpload(file: File, maxEdge = UPLOAD_MAX_EDGE): Promise<File> {
  try {
    if (typeof document === 'undefined') return file;
    if (!(SHRINKABLE.test(file.type) || (!file.type && SHRINKABLE_EXT.test(file.name)))) return file;
    if (file.size < MIN_BYTES) return file;
    const img = await decode(file);
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    if (!w0 || !h0) return file;
    const scale = Math.min(1, maxEdge / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    canvas.width = 0; canvas.height = 0; // release the bitmap memory on iOS
    if (!blob || blob.size >= file.size * 0.9) return file;
    const name = (file.name || 'photo').replace(/\.(jpe?g|heic|heif|webp)$/i, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified || Date.now() });
  } catch {
    return file;
  }
}
