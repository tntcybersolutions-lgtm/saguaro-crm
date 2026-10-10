/**
 * Files a sub uploads from the portal's Compliance tab.
 *
 * The compliance form used to send only a typed file name — nothing was
 * uploaded and portal_sub_compliance_docs.file_url stayed null, so the GC's
 * Sub Portal screen listed every one as "missing". The bytes now go straight to
 * storage through a one-time signed upload URL (lib/media-upload putSigned, so
 * the ~4.5 MB serverless body limit doesn't apply), into the same bucket and
 * per-session folder the portal's Documents upload already uses:
 *
 *   project-files / <tenant>/projects/<job>/sub-portal/<sub or session>/…
 *
 * The record route refuses any path outside that folder, so a portal link can
 * only ever point a compliance record at its own upload. The Documents tab
 * now uploads the same way (see "Documents tab" below).
 */

export const SUB_FILES_BUCKET = 'project-files';

/** The Compliance tab's document slots — the values portal_sub_compliance_docs.doc_type takes from it. */
export const COMPLIANCE_DOC_TYPES = ['insurance', 'w9', 'lien_waiver', 'business_license', 'bond', 'safety_certification'] as const;
export type ComplianceDocType = (typeof COMPLIANCE_DOC_TYPES)[number];

export function isComplianceDocType(t: unknown): t is ComplianceDocType {
  return typeof t === 'string' && (COMPLIANCE_DOC_TYPES as readonly string[]).includes(t);
}

/** PDF, a photo of the certificate, or a Word file. */
export const COMPLIANCE_FILE_RE = /\.(pdf|png|jpe?g|webp|heic|docx?)$/i;
export const COMPLIANCE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,application/pdf,image/*';
export const COMPLIANCE_MAX_BYTES = 50 * 1024 * 1024;

/** The same character rule the portal's Documents upload uses for object names. */
export function safeFileName(name: string): string {
  const n = String(name || '').trim().replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '');
  return (n || 'file').slice(-120);
}

export type FileNameCheck = { ok: true; safeName: string } | { ok: false; message: string };

export function checkComplianceFileName(name: unknown): FileNameCheck {
  const raw = typeof name === 'string' ? name.trim() : '';
  if (!raw) return { ok: false, message: 'Choose the file to upload.' };
  const safeName = safeFileName(raw);
  if (!COMPLIANCE_FILE_RE.test(safeName)) {
    return { ok: false, message: 'Upload a PDF, a photo (JPG, PNG, HEIC) or a Word file.' };
  }
  return { ok: true, safeName };
}

/** Every object one portal session may upload lives under here — the Documents upload's folder. */
export function subPortalFilePrefix(s: { tenant_id: string; project_id: string | null; sub_id?: string | null; id: string }): string {
  return `${s.tenant_id}/projects/${s.project_id}/sub-portal/${s.sub_id || s.id}/`;
}

/** Compliance uploads sit in their own subfolder of the session's folder. */
export function complianceFolder(prefix: string): string {
  return `${prefix}compliance/`;
}

/** "<upload time>-<name>" — the same shape as the Documents upload, so the name reads back cleanly. */
export function complianceUploadPath(prefix: string, safeName: string, now = Date.now()): string {
  return `${complianceFolder(prefix)}${now}-${safeName}`;
}

/** True only for a path inside `prefix` with no way back out of it. */
export function ownsPath(prefix: string, path: unknown): path is string {
  if (typeof path !== 'string' || !prefix) return false;
  if (!path.startsWith(prefix) || path.length === prefix.length) return false;
  const rest = path.slice(prefix.length);
  return !rest.split('/').some((seg) => seg === '' || seg === '.' || seg === '..') && !/[\\\0]/.test(path);
}

/* ── Documents tab ──────────────────────────────────────────────────────────
 * The Documents tab used to post the file itself to /api/portal/sub/documents
 * (multipart), so the serverless request cap (~4.5 MB) refused anything bigger
 * while the page promised 100 MB. Its bytes now take the compliance upload's
 * road: a one-time signed URL from /api/portal/sub/documents/upload-url, a PUT
 * straight to storage, then a small JSON call that records the path. The
 * objects land where the multipart upload always put them — directly in the
 * session's folder, "<upload time>-<name>".
 */

/** PDF, Excel, Word, CSV, photos and video — what the Documents tab takes. */
export const DOCUMENT_FILE_RE = /\.(pdf|xlsx?|docx?|csv|png|jpe?g|webp|heic|mp4|mov|webm)$/i;
export const DOCUMENT_ACCEPT = '.pdf,.xls,.xlsx,.doc,.docx,.csv,image/*,video/*';
/** The limit the Documents tab states. The bucket itself takes more; this is the promise on screen. */
export const DOCUMENT_MAX_MB = 100;
export const DOCUMENT_MAX_BYTES = DOCUMENT_MAX_MB * 1024 * 1024;

export function checkDocumentFileName(name: unknown): FileNameCheck {
  const raw = typeof name === 'string' ? name.trim() : '';
  if (!raw) return { ok: false, message: 'Choose the file to upload.' };
  const safeName = safeFileName(raw);
  if (!DOCUMENT_FILE_RE.test(safeName)) {
    return { ok: false, message: 'Unsupported file type. Upload a PDF, Excel, Word or CSV file, a photo (JPG, PNG, HEIC) or a video (MP4, MOV).' };
  }
  return { ok: true, safeName };
}

/** "<upload time>-<name>" directly in the session's folder — where Documents uploads have always lived. */
export function documentUploadPath(prefix: string, safeName: string, now = Date.now()): string {
  return `${prefix}${now}-${safeName}`;
}

/**
 * A Documents upload this session may record: directly in its own folder (not
 * a subfolder such as compliance/), and a file type the tab takes.
 */
export function ownsDocumentPath(prefix: string, path: unknown): path is string {
  if (!ownsPath(prefix, path)) return false;
  const rest = path.slice(prefix.length);
  return !rest.includes('/') && DOCUMENT_FILE_RE.test(rest);
}

const DOCUMENT_CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

/**
 * The content type recorded for an upload, from its extension. The server no
 * longer sees the bytes, and the tab sorts photos and video into the media grid
 * by this value, so it is decided here rather than taken from the browser.
 */
export function documentContentType(name: string): string {
  const ext = String(name || '').toLowerCase().split('.').pop() || '';
  return DOCUMENT_CONTENT_TYPES[ext] || 'application/octet-stream';
}

/** 'YYYY-MM-DD' that is a real calendar day, or null for blank. Anything else is invalid. */
export function expiryDay(v: unknown): { ok: true; day: string | null } | { ok: false } {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : null;
  if (s === null) return { ok: false };
  if (s === '') return { ok: true, day: null };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return { ok: false };
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return { ok: false };
  return { ok: true, day: s };
}
