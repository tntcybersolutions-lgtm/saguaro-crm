import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { UnsupportedImageError } from '@/lib/image-thumb';
import { apiError } from '@/lib/api-error';
import { signFields } from '@/lib/storage-signing';
import { storePhoto, downloadStaged, removeQuietly, PhotoStoreError } from '@/lib/photo-store';

// sharp re-encode of a big original; the bytes come from storage, not the request.
export const runtime = 'nodejs';
export const maxDuration = 60;

const ALBUMS = new Set(['General', 'Progress', 'Inspections', 'Closeout', 'Issues', 'Other', 'End of Day']);

/**
 * POST /api/photos/ingest
 *   { projectId, path, fileName, contentType?, album?, title?, description?, takenAt? }
 *
 * Step 2 of a direct upload (step 1: /api/photos/upload-url). The original is
 * already in storage at `path`; read it, render the display copy + thumbnail
 * and insert the photos row exactly as /api/photos/upload would, then drop the
 * staged original. Nothing here is limited by the request-body cap.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '');
  const projectId = str('projectId');
  const path = str('path');
  const fileName = str('fileName') || 'photo.jpg';
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 });

  // Only a key this tenant got from /api/photos/upload-url for THIS project.
  const prefix = `${user.tenantId}/projects/${projectId}/photo-staging/`;
  if (!path.startsWith(prefix) || path.includes('..')) {
    return NextResponse.json({ error: 'That upload is not part of this project' }, { status: 403 });
  }

  const db = createServerClient();
  try {
    const { data: project, error: projErr } = await db
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (projErr) throw projErr;
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const album = ALBUMS.has(str('album')) ? str('album') : 'General';
    const title = str('title').slice(0, 200);
    const takenAtRaw = str('takenAt');
    const takenAt = takenAtRaw && !Number.isNaN(Date.parse(takenAtRaw)) ? new Date(takenAtRaw).toISOString() : undefined;

    const original = await downloadStaged(db, path);
    let stored;
    try {
      stored = await storePhoto(db, {
        tenantId: user.tenantId,
        projectId,
        original,
        fileName,
        contentType: str('contentType') || null,
        category: album,
        caption: title,
        takenBy: user.email || '',
        takenAt,
        extra: {
          ...(title ? { title } : {}),
          album,
          ...(str('description') ? { description: str('description').slice(0, 4000) } : {}),
        },
      });
    } finally {
      // The display copy + thumbnail are what the job keeps (same as the
      // multipart route); the staged original is not referenced by anything.
      await removeQuietly(db, [path]);
    }

    const [signed] = await signFields([stored.photo], ['url', 'thumbnail_url'], 3600, { strict: false });
    return NextResponse.json({ success: true, photo: signed ?? stored.photo, ...(stored.warning ? { warning: stored.warning } : {}) });
  } catch (e: unknown) {
    if (e instanceof UnsupportedImageError) return apiError('photos/ingest', e, e.message, 415);
    if (e instanceof PhotoStoreError) return apiError('photos/ingest', e.detail ?? e, e.message, e.status);
    return apiError('photos/ingest', e, "The photo didn't save. Try again.");
  }
}
