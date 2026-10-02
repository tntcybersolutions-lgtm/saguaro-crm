import { getSupabaseBrowser } from '@/lib/supabase-browser';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DirectUploadOpts {
  projectId?: string | null;
  folder?: string | null;
  category?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

/**
 * Upload ONE file straight to storage via a signed upload URL, bypassing the
 * ~4.5 MB serverless request-body limit so large files (site video, big drawing
 * sets) actually upload — then record the project_files row. Returns the
 * recorded row in the same shape as /api/files/upload rows.
 *
 * Three steps: get a signed upload URL → PUT the bytes to Supabase directly →
 * record the metadata. Only the two small JSON calls touch the function; the
 * bytes never do.
 */
export async function uploadFileDirect(file: File, opts: DirectUploadOpts = {}): Promise<any> {
  // 1) signed upload URL
  const urlRes = await fetch('/api/files/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, projectId: opts.projectId ?? null }),
  });
  const urlJson = await urlRes.json().catch(() => ({}));
  if (!urlRes.ok) throw new Error(urlJson?.error || 'Could not start upload');
  const { bucket, path, token } = urlJson as { bucket: string; path: string; token: string };

  // 2) bytes straight to storage — no function in the path
  const supabase = getSupabaseBrowser();
  const { error: upErr } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(path, token, file, { contentType: file.type || 'application/octet-stream' });
  if (upErr) throw new Error(upErr.message);

  // 3) record the metadata row
  const recRes = await fetch('/api/files/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type || 'application/octet-stream',
      projectId: opts.projectId ?? null,
      folder: opts.folder ?? null,
      category: opts.category ?? null,
      entityType: opts.entityType ?? null,
      entityId: opts.entityId ?? null,
    }),
  });
  const recJson = await recRes.json().catch(() => ({}));
  if (!recRes.ok) throw new Error(recJson?.error || 'Could not record upload');
  return recJson.file;
}
