import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { signStoredUrl } from '@/lib/storage-signing';
import { classifyKind } from '@/lib/filekind';

export const runtime = 'nodejs';
/* eslint-disable @typescript-eslint/no-explicit-any */

const BUCKET = 'project-files';

/**
 * POST /api/files/record — record a project_files row for a file the client
 * uploaded DIRECTLY to storage via a signed upload URL (see
 * /api/files/upload-url). Mirrors the metadata /api/files/upload writes, so a
 * directly-uploaded big file is indistinguishable from one sent through the
 * function.
 *
 * Tenant isolation: the storage path MUST be under the caller's tenant prefix,
 * or we refuse — a client cannot register bytes it placed anywhere else.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const b = (await req.json().catch(() => ({}))) as any;
    const path = String(b.path ?? '').trim();
    const fileName = String(b.fileName ?? '').trim();
    if (!path || !fileName) return NextResponse.json({ error: 'path and fileName are required' }, { status: 400 });
    if (!path.startsWith(`${user.tenantId}/`)) {
      return NextResponse.json({ error: 'Path is outside your workspace' }, { status: 403 });
    }

    const contentType = String(b.contentType ?? 'application/octet-stream');
    const fileSize = Number(b.fileSize) || 0;
    const projectId = b.projectId ? String(b.projectId) : null;
    const kind = classifyKind(contentType, fileName);

    const admin = createServerClient() as any;
    const publicUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    // Optional poster frame + metadata the browser read off a video before
    // uploading it (see lib/media-upload.ts). The poster is a second object the
    // client put next to the video — same tenant rule as the file itself.
    const posterPath = typeof b.posterPath === 'string' ? b.posterPath.trim() : '';
    if (posterPath && !posterPath.startsWith(`${user.tenantId}/`)) {
      return NextResponse.json({ error: 'Path is outside your workspace' }, { status: 403 });
    }
    const posterUrl = posterPath ? admin.storage.from(BUCKET).getPublicUrl(posterPath).data.publicUrl : null;
    const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

    const { data: row, error: rowErr } = await admin.from('project_files').insert({
      tenant_id: user.tenantId,
      project_id: projectId,
      file_name: fileName,
      file_url: publicUrl,
      file_size: fileSize,
      file_type: contentType,
      mime_type: contentType,
      kind,
      storage_bucket: BUCKET,
      storage_path: path,
      category: (b.category ? String(b.category) : null) || kind,
      folder: b.folder ? String(b.folder) : null,
      entity_type: b.entityType ? String(b.entityType) : null,
      entity_id: b.entityId ? String(b.entityId) : null,
      uploaded_by: user.id,
      uploaded_by_name: user.email,
      is_current: true,
      version_number: 1,
      ...(posterUrl ? { poster_url: posterUrl } : {}),
      ...(num(b.durationSeconds) ? { duration_seconds: num(b.durationSeconds) } : {}),
      ...(num(b.width) ? { width: Math.round(num(b.width) as number) } : {}),
      ...(num(b.height) ? { height: Math.round(num(b.height) as number) } : {}),
    }).select('*').single();
    if (rowErr) throw rowErr;

    const signed = await signStoredUrl(BUCKET, path, 3600);
    const poster = posterPath ? await signStoredUrl(BUCKET, posterPath, 3600).catch(() => null) : null;
    return NextResponse.json({ success: true, file: { ...row, url: signed, file_url: signed, ...(poster ? { poster_url: poster } : {}) } });
  } catch (e: any) {
    return NextResponse.json({ error: `Could not record upload: ${e?.message || 'server error'}` }, { status: 500 });
  }
}
