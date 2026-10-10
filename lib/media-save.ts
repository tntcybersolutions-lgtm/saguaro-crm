'use client';
/**
 * Save or share one photo / video from the viewer.
 *
 *  • iPhone app: download → write to the app's cache → the iOS share sheet
 *    with the FILE, so "Save Image" / "Save Video", AirDrop and Messages work.
 *  • Browser with file sharing (iOS / Android Safari, Chrome): the same sheet.
 *  • Desktop: a normal download.
 *
 * The URL is the signed link the viewer already shows; nothing is published.
 */
import { isNative } from '@/lib/native';

export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

function extFor(type: string, fallback: string): string {
  if (/jpeg|jpg/.test(type)) return 'jpg';
  if (/png/.test(type)) return 'png';
  if (/webp/.test(type)) return 'webp';
  if (/heic/.test(type)) return 'heic';
  if (/quicktime/.test(type)) return 'mov';
  if (/mp4/.test(type)) return 'mp4';
  if (/webm/.test(type)) return 'webm';
  return fallback;
}

/** A filesystem-safe name like "Footing pour 3.jpg". */
export function mediaFileName(title: string | null | undefined, type: string, kind: 'image' | 'video'): string {
  const base = (title || (kind === 'video' ? 'Video' : 'Photo')).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'Saguaro';
  return `${base}.${extFor(type, kind === 'video' ? 'mp4' : 'jpg')}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

const isCancel = (e: unknown) => e instanceof DOMException ? e.name === 'AbortError' : /cancel/i.test(String((e as Error)?.message || e));

export async function saveMedia(item: { url: string; title?: string | null; kind: 'image' | 'video' }): Promise<SaveResult> {
  const res = await fetch(item.url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const blob = await res.blob();
  const name = mediaFileName(item.title, blob.type || '', item.kind);

  if (isNative()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const written = await Filesystem.writeFile({ path: `share/${Date.now()}-${name}`, data: await blobToBase64(blob), directory: Directory.Cache, recursive: true });
    try {
      await Share.share({ title: name, files: [written.uri] });
      return 'shared';
    } catch (e) {
      if (isCancel(e)) return 'cancelled';
      throw e;
    }
  }

  const file = new File([blob], name, { type: blob.type || (item.kind === 'video' ? 'video/mp4' : 'image/jpeg') });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  if (touch && nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if (isCancel(e)) return 'cancelled';
      // Some browsers refuse big files — fall through to a download.
    }
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
  return 'downloaded';
}

/* ── Files behind a signed-in link, in the iPhone app ─────────────────────── */

const EXT_BY_TYPE: Array<[RegExp, string]> = [
  [/pdf/, 'pdf'], [/spreadsheetml|excel/, 'xlsx'], [/csv/, 'csv'], [/wordprocessingml|msword/, 'docx'],
  [/zip/, 'zip'], [/png/, 'png'], [/jpe?g/, 'jpg'], [/html/, 'html'], [/plain/, 'txt'],
];

/** The server's file name (Content-Disposition), else the fallback with an extension from the type. */
export function fileNameFrom(disposition: string | null, type: string, fallback: string): string {
  const m = disposition && /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  if (m?.[1]) {
    try { return decodeURIComponent(m[1]).replace(/[\\/:*?"<>|]+/g, ' ').trim() || fallback; } catch { return m[1]; }
  }
  const base = fallback.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'Saguaro file';
  if (/\.[a-z0-9]{2,5}$/i.test(base)) return base;
  const ext = EXT_BY_TYPE.find(([re]) => re.test(type))?.[1];
  return ext ? `${base}.${ext}` : base;
}

/**
 * In the iPhone app a link that opens a new tab goes out to Safari, where the
 * user isn't signed in — so a file behind a signed-in route (/api/files/open,
 * an export) answers 401 there. This downloads it inside the app, with the
 * session, and opens the iOS share sheet (Files, AirDrop, Mail, Quick Look).
 */
export async function shareFileInApp(url: string, fallbackName: string): Promise<SaveResult> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const blob = await res.blob();
  const name = fileNameFrom(res.headers.get('content-disposition'), blob.type || res.headers.get('content-type') || '', fallbackName);
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const written = await Filesystem.writeFile({ path: `share/${Date.now()}-${name}`, data: await blobToBase64(blob), directory: Directory.Cache, recursive: true });
  try {
    await Share.share({ title: name, files: [written.uri] });
    return 'shared';
  } catch (e) {
    if (isCancel(e)) return 'cancelled';
    throw e;
  }
}

/** onClick for a new-tab file link: in the app it shares the file instead; on the web the link works as is. */
export function inAppFileClick(url: string, fallbackName: string, onError?: (message: string) => void) {
  return (e: { preventDefault: () => void }) => {
    if (!isNative()) return;
    e.preventDefault();
    shareFileInApp(url, fallbackName).catch((err) => {
      console.error(err);
      onError?.("Couldn't open that file. Check your signal and try again.");
    });
  };
}
