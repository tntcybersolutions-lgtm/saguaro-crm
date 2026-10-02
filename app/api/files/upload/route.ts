import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { signStoredUrl } from '@/lib/storage-signing';
import { classifyKind } from '@/lib/filekind';
import { storeImageThumb } from '@/lib/file-thumbs';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';
/* eslint-disable @typescript-eslint/no-explicit-any */

const BUCKET = 'project-files';
const MAX_BYTES = 500 * 1024 * 1024; // matches the raised bucket limit

/**
 * Unified file upload. Was: anon client, wrong `file` field handling, returned a
 * PUBLIC url on a PRIVATE bucket (→ HTTP 400, files never opened), wrote NO DB row.
 * Now: service-role + tenant-scoped, tenant-prefixed path (RLS-safe), inserts a
 * canonical `project_files` row (kind/mime/bucket/path), returns a signed URL that
 * actually resolves. Accepts one or many files under `file` (or legacy `files`).
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const form = await req.formData();
    const projectId = (form.get('projectId') as string) || (form.get('project_id') as string) || null;
    const folder = (form.get('folder') as string) || null;
    const category = (form.get('category') as string) || null;
    const entityType = (form.get('entityType') as string) || null;
    const entityId = (form.get('entityId') as string) || null;

    const files = [...form.getAll('file'), ...form.getAll('files')].filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const admin = createServerClient() as any;
    const out: any[] = [];

    for (const file of files) {
      if (file.size > MAX_BYTES) { out.push({ name: file.name, error: 'File exceeds 500MB limit' }); continue; }
      const safeName = (file.name || `file-${Date.now()}`).replace(/[^\w.\-() ]+/g, '_');
      const ts = Date.now();
      const path = `${user.tenantId}/projects/${projectId || 'unfiled'}/files/${ts}-${safeName}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const contentType = file.type || 'application/octet-stream';

      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
      if (upErr) { console.error('[files/upload] storage:', upErr); out.push({ name: file.name, error: 'Upload to storage failed' }); continue; }

      // file_url is NOT NULL — store the (private-bucket) public URL form. It won't
      // open directly, but signUrl/signStoredUrl parse the path out of it on read.
      const publicUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const kind = classifyKind(contentType, safeName);
      /* A ~400px grid thumbnail, rendered from the bytes already in hand, so the
         library grid never has to pull the original. Non-fatal: no thumb just
         means the tile falls back to the original (and the list backfills it). */
      const posterUrl = kind === 'image' ? (await storeImageThumb(admin, BUCKET, path, buffer, safeName)) || null : null;
      const { data: row, error: rowErr } = await (admin as any).from('project_files').insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        file_name: file.name || safeName,
        file_url: publicUrl,
        file_size: file.size,
        file_type: contentType,
        mime_type: contentType,
        kind,
        storage_bucket: BUCKET,
        storage_path: path,
        poster_url: posterUrl,
        category: category || kind,
        folder,
        entity_type: entityType,
        entity_id: entityId,
        uploaded_by: user.id,
        uploaded_by_name: user.email,
        is_current: true,
        version_number: 1,
      }).select('*').single();
      if (rowErr) { console.error('[files/upload] record:', rowErr); out.push({ name: file.name, error: 'Uploaded, but the file could not be recorded' }); continue; }

      const signed = await signStoredUrl(BUCKET, path, 3600);
      const poster = posterUrl ? await signStoredUrl(BUCKET, posterUrl, 3600) : (row as any).poster_url ?? null;
      out.push({ ...(row as any), url: signed, file_url: signed, poster_url: poster || null });
    }

    const ok = out.filter((o) => !o.error);
    const failed = out.filter((o) => o.error);
    return NextResponse.json({ success: failed.length === 0, files: ok, failed, file: ok[0] || null });
  } catch (err: unknown) {
    return apiError('files/upload', err, 'Failed to upload. Please try again.');
  }
}
