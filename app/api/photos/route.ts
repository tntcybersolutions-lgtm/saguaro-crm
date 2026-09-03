import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

const BUCKET = 'project-files';
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * GET /api/photos?projectId=...
 * Lists photo objects stored under projects/<projectId>/photos in `project-files`.
 *
 * Uses the service-role client (from requirePermission). storage.objects carries
 * policies for `authenticated` only — a bare anon client matched none, so .list()
 * came back empty and the route returned `{ photos: [] }` with a 200, which is
 * indistinguishable from a project that genuinely has no photos.
 *
 * `project-files` is a PRIVATE bucket, so getPublicUrl() produced URLs that fail
 * to load. Signed URLs are issued instead.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  const g = await requirePermission(req, 'Documents', 'View', { projectId });
  if (!g.ok) return g.res;

  const prefix = `projects/${projectId}/photos`;

  const { data: files, error } = await g.db.storage.from(BUCKET).list(prefix, {
    limit: 50,
    sortBy: { column: 'created_at', order: 'desc' },
  });

  if (error) {
    console.error('[photos] storage list failed:', error.message);
    return apiError('photos', error, 'Failed to load photos');
  }

  const entries = (files ?? []).filter((f) => !f.name.startsWith('.'));

  const photos = await Promise.all(
    entries.map(async (f) => {
      const path = `${prefix}/${f.name}`;
      const { data: signed } = await g.db.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      return {
        id: f.id || f.name,
        url: signed?.signedUrl || null,
        filename: f.name,
        created_at: f.created_at || null,
        category: 'Progress',
        caption: '',
      };
    }),
  );

  return NextResponse.json({ photos });
}
