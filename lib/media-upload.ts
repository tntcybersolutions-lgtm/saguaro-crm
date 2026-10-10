/**
 * Browser-side photo + video upload. Bytes go STRAIGHT to storage through a
 * one-time signed URL, so nothing is capped by the ~4.5 MB serverless request
 * body limit — a photo or a site video uploads at whatever size the bucket
 * takes (500 MB). Only small JSON calls touch our functions.
 *
 *   photo: /api/photos/upload-url → PUT bytes → /api/photos/ingest (shrink + thumbnail + photos row)
 *   video: /api/files/upload-url  → PUT bytes (+ poster frame) → /api/files/record (project_files row)
 *
 * The sub portal uses the same PUT + poster helpers with its own token-auth
 * endpoints (see app/api/portal/sub/media).
 */
import { getAuthHeaders, getSupabaseBrowser } from '@/lib/supabase-browser';
import { classifyKind } from '@/lib/filekind';
import { shrinkForUpload } from '@/lib/image-shrink';

export type MediaKind = 'image' | 'video';

/** image / video, or null for anything a gallery can't show. */
export function mediaKindOf(file: File): MediaKind | null {
  const k = classifyKind(file.type, file.name);
  return k === 'image' || k === 'video' ? k : null;
}

/** "IMG_2041.HEIC" → "IMG 2041". */
export function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || name;
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function fmtDuration(s: number | null | undefined): string {
  if (!s || !Number.isFinite(s)) return '';
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export interface SignedUpload {
  bucket: string;
  path: string;
  token: string;
  signedUrl?: string;
}

/**
 * PUT one file to a Supabase signed upload URL with progress. Same request
 * storage-js's uploadToSignedUrl makes for a Blob (multipart, x-upsert:false),
 * sent over XHR because fetch can't report upload progress. If the XHR path
 * fails for a reason other than the server refusing the file, fall back to
 * storage-js itself (no progress, but the upload still lands).
 */
export async function putSigned(
  up: SignedUpload,
  file: Blob,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const url =
    up.signedUrl ||
    `${base}/storage/v1/object/upload/sign/${up.bucket}/${up.path.split('/').map(encodeURIComponent).join('/')}?token=${encodeURIComponent(up.token)}`;

  const viaXhr = await new Promise<{ ok: boolean; status: number; text: string }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('x-upsert', 'false');
    if (key) xhr.setRequestHeader('apikey', key);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, text: xhr.responseText || '' });
    xhr.onerror = () => resolve({ ok: false, status: 0, text: '' });
    xhr.ontimeout = () => resolve({ ok: false, status: 0, text: '' });
    const fd = new FormData();
    fd.append('cacheControl', '3600');
    fd.append('', file);
    xhr.send(fd);
  });
  if (viaXhr.ok) {
    onProgress?.(1);
    return;
  }
  // A 4xx with a body is storage saying no (too big, wrong type) — retrying the
  // same bytes another way won't change the answer.
  if (viaXhr.status >= 400 && viaXhr.status < 500 && viaXhr.status !== 401 && viaXhr.status !== 403) {
    throw new Error(storageMessage(viaXhr.text) || 'Storage refused this file.');
  }
  const { error } = await getSupabaseBrowser().storage.from(up.bucket).uploadToSignedUrl(up.path, up.token, file);
  if (error) throw new Error(error.message || 'Upload failed');
  onProgress?.(1);
}

function storageMessage(body: string): string {
  try {
    const j = JSON.parse(body);
    const m = String(j?.message || j?.error || '');
    if (/maximum allowed size|too large|payload/i.test(m)) return 'That file is bigger than storage allows (500 MB).';
    return m;
  } catch {
    return '';
  }
}

export interface VideoInfo {
  poster: Blob | null;
  duration: number | null;
  width: number | null;
  height: number | null;
}

/**
 * Read a video's length and size and grab one frame as a small JPEG poster,
 * entirely on the device. Best effort: a codec the browser can't decode just
 * means no poster (the gallery shows a play glyph instead).
 */
export async function readVideoInfo(file: File, timeoutMs = 8000): Promise<VideoInfo> {
  const none: VideoInfo = { poster: null, duration: null, width: null, height: null };
  if (typeof document === 'undefined') return none;
  const src = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = src;
  const wait = (ev: string) =>
    new Promise<boolean>((res) => {
      const t = window.setTimeout(() => res(false), timeoutMs);
      v.addEventListener(ev, () => { window.clearTimeout(t); res(true); }, { once: true });
      v.addEventListener('error', () => { window.clearTimeout(t); res(false); }, { once: true });
    });
  try {
    if (!(await wait('loadedmetadata'))) return none;
    const info: VideoInfo = {
      poster: null,
      duration: Number.isFinite(v.duration) ? v.duration : null,
      width: v.videoWidth || null,
      height: v.videoHeight || null,
    };
    if (!v.videoWidth || !v.videoHeight) return info;
    v.currentTime = Math.min(0.5, (info.duration || 1) / 3);
    if (!(await wait('seeked'))) return info;
    const w = Math.min(640, v.videoWidth);
    const h = Math.round((w / v.videoWidth) * v.videoHeight);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return info;
    ctx.drawImage(v, 0, 0, w, h);
    info.poster = await new Promise<Blob | null>((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.78));
    return info;
  } catch {
    return none;
  } finally {
    v.removeAttribute('src');
    v.load();
    URL.revokeObjectURL(src);
  }
}

async function jsonOrThrow(r: Response, fallback: string): Promise<Record<string, unknown>> {
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(typeof j.error === 'string' && j.error ? j.error : fallback);
  return j;
}

export interface PhotoUploadOpts {
  projectId: string;
  album?: string;
  title?: string;
  description?: string;
  onProgress?: (fraction: number) => void;
}

/** One photo, any size, into the project's gallery. Returns the signed photos row. */
export async function uploadPhoto(original: File, o: PhotoUploadOpts): Promise<Record<string, unknown>> {
  // Send ~a fifth of the bytes: the server only keeps a 2000 px copy anyway.
  const file = await shrinkForUpload(original);
  const h = await getAuthHeaders();
  const start = await jsonOrThrow(
    await fetch('/api/photos/upload-url', {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: o.projectId, fileName: file.name || 'photo.jpg' }),
    }),
    "Couldn't start the upload.",
  );
  await putSigned(start as unknown as SignedUpload, file, (f) => o.onProgress?.(f * 0.9));
  const done = await jsonOrThrow(
    await fetch('/api/photos/ingest', {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: o.projectId,
        path: start.path,
        fileName: file.name || 'photo.jpg',
        contentType: file.type || null,
        album: o.album,
        title: o.title ?? titleFromFileName(original.name || 'Photo'),
        description: o.description,
        takenAt: original.lastModified ? new Date(original.lastModified).toISOString() : undefined,
      }),
    }),
    "The photo didn't save.",
  );
  o.onProgress?.(1);
  return (done.photo || {}) as Record<string, unknown>;
}

export interface VideoUploadOpts {
  projectId: string;
  folder?: string;
  onProgress?: (fraction: number) => void;
}

/** One video, any size up to the bucket limit, into the project's library. */
export async function uploadVideo(file: File, o: VideoUploadOpts): Promise<Record<string, unknown>> {
  const h = await getAuthHeaders();
  const info = await readVideoInfo(file);
  const sign = async (fileName: string) =>
    (await jsonOrThrow(
      await fetch('/api/files/upload-url', {
        method: 'POST',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: o.projectId, fileName }),
      }),
      "Couldn't start the upload.",
    )) as unknown as SignedUpload;

  const name = file.name || `video-${Date.now()}.mp4`;
  const up = await sign(name);
  await putSigned(up, file, (f) => o.onProgress?.(f * 0.95));

  let posterPath: string | null = null;
  if (info.poster) {
    try {
      const pUp = await sign(`${name.replace(/\.[^.]+$/, '')}-poster.jpg`);
      await putSigned(pUp, info.poster);
      posterPath = pUp.path;
    } catch {
      posterPath = null; // the video matters; a missing poster only costs the tile its frame
    }
  }

  const rec = await jsonOrThrow(
    await fetch('/api/files/record', {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: up.path,
        fileName: name,
        fileSize: file.size,
        contentType: file.type || 'video/mp4',
        projectId: o.projectId,
        folder: o.folder ?? 'Photos & Video',
        category: 'video',
        posterPath,
        durationSeconds: info.duration,
        width: info.width,
        height: info.height,
      }),
    }),
    "The video uploaded but didn't save to the job.",
  );
  o.onProgress?.(1);
  return (rec.file || {}) as Record<string, unknown>;
}

export interface SubMediaOpts {
  /** The sub's portal token — the link they already use; no Saguaro login. */
  token: string;
  destination: 'project' | 'gc';
  note?: string;
  /** One id per "send" so the GC gets one notification for the whole batch. */
  batchId: string;
  onProgress?: (fraction: number) => void;
}

/** One end-of-day photo or video from a sub's portal, any size. */
export async function uploadSubMedia(file: File, kind: MediaKind, o: SubMediaOpts): Promise<Record<string, unknown>> {
  const q = `token=${encodeURIComponent(o.token)}`;
  const headers = { 'Content-Type': 'application/json', 'x-portal-token': o.token };
  const sign = async (fileName: string) =>
    (await jsonOrThrow(
      await fetch(`/api/portal/sub/media/upload-url?${q}`, { method: 'POST', headers, body: JSON.stringify({ fileName }) }),
      "Couldn't start the upload.",
    )) as unknown as SignedUpload;

  const name = file.name || (kind === 'video' ? `video-${Date.now()}.mp4` : `photo-${Date.now()}.jpg`);
  const info = kind === 'video' ? await readVideoInfo(file) : null;
  const up = await sign(name);
  await putSigned(up, file, (f) => o.onProgress?.(f * 0.9));

  let posterPath: string | null = null;
  if (info?.poster) {
    try {
      const pUp = await sign(`${name.replace(/\.[^.]+$/, '')}-poster.jpg`);
      await putSigned(pUp, info.poster);
      posterPath = pUp.path;
    } catch {
      posterPath = null; // the video matters; a missing poster only costs the tile its frame
    }
  }

  const done = await jsonOrThrow(
    await fetch(`/api/portal/sub/media?${q}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        path: up.path,
        fileName: name,
        contentType: file.type || null,
        fileSize: file.size,
        posterPath,
        durationSeconds: info?.duration ?? null,
        destination: o.destination,
        note: o.note || '',
        batchId: o.batchId,
      }),
    }),
    "That upload didn't save.",
  );
  o.onProgress?.(1);
  return (done.item || {}) as Record<string, unknown>;
}
