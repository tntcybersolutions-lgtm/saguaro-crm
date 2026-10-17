import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { signFields, storageObjectKey } from '@/lib/storage-signing';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';

/** Album the Files-library images are grouped under in the gallery. */
const FILES_ALBUM = 'From Files';
/** Album every project video is grouped under — wherever it was uploaded from. */
const VIDEO_ALBUM = 'Video';

/** "ZZ-AUDIT_jobsite-photo-1.jpg" -> "ZZ AUDIT jobsite photo 1". */
function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || name;
}

/**
 * Photos for ONE project.
 *
 * `projectId` is REQUIRED. It used to be optional, and omitting it silently
 * returned every photo in the tenant — which is how a caller that sent the
 * wrong param name (`project_id` instead of `projectId`) ended up showing one
 * job's gallery full of another job's photos. A missing project is now an
 * honest 400 instead of a tenant-wide dump: a filter that silently doesn't
 * filter is worse than an error.
 *
 * `?all=1` is the explicit, deliberate opt-in for a genuinely tenant-wide view.
 *
 * THUMBNAIL CONTRACT (what every grid client must do)
 * Each photo carries BOTH `url` (the full-resolution original — real rows here
 * are 1-3.6 MB, 12-megapixel JPEGs) and `thumbnail_url` (a ~400px JPEG, 12-24 KB
 * in practice). Both are signed for the private bucket before they leave here.
 *
 * A grid MUST render `thumbnail_url` and fall back to `url` only when it is
 * null. Rendering `url` in a tile is what freezes the phone: eighteen 12MP
 * decodes is hundreds of megabytes of bitmap on the UI thread. `url` is for the
 * full-screen viewer, one image at a time.
 *
 * `thumbnail_url` is null on rows the backfill could not process — legacy .heic
 * originals, and the external Unsplash seed rows. That null is honest: it means
 * "no thumbnail exists", not "not signed yet". Handle it, don't assume it.
 * Backfill: scripts/backfill-photo-thumbs.ts
 */
export async function GET(req: NextRequest) {
  // Role check, not just sign-in: Documents: View, the rule this tool's pages,
  // its writes and (where the table is gated) the database apply.
  const g = await requirePermission(req, 'Documents', 'View');
  if (!g.ok) return g.res;
  const user = g.user;

  const { searchParams } = new URL(req.url);
  // Accept the snake_case spelling too — several callers send it, and honoring
  // it is better than pretending they asked for everything.
  const projectId = searchParams.get('projectId') || searchParams.get('project_id');
  const wantsAll = searchParams.get('all') === '1';

  if (!projectId && !wantsAll) {
    return NextResponse.json(
      { error: 'projectId is required (pass ?all=1 to deliberately list every project)', photos: [] },
      { status: 400 },
    );
  }

  try {
    const db = createServerClient();
    let query = db
      .from('photos')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('taken_at', { ascending: false })
      .limit(1000);
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    // 'project-files' bucket is private — sign photo URLs on read. signFields is
    // strict: if an object we were supposed to sign doesn't sign, it throws into
    // the catch below rather than returning URLs that 400 on load.
    const photos = await signFields((data || []) as Record<string, any>[], ['url', 'thumbnail_url', 'markup_url']);

    /* ONE PICTURE OF THE JOB. A photo dropped into Files & Media lives in
       project_files, not photos, so the gallery used to say "No photos yet"
       while the library held two jobsite shots. `?include=files` (the web
       gallery sends it) merges the project's image files in as READ-ONLY
       entries: same storage object, no copy, clearly sourced (`source:'files'`,
       album FILES_ALBUM, id prefixed `file:`) so no client mistakes one for a
       photos row it can PUT or DELETE. Opt-in, so callers that write back by
       id (the field app) never see a synthetic id. De-duplicated against photos
       by storage object and by content hash. */
    const includeFiles = projectId && (searchParams.get('include') || '').split(',').includes('files');
    if (!includeFiles) return NextResponse.json({ photos });

    const { data: fileRows, error: filesErr } = await (db as any)
      .from('project_files')
      .select('id, project_id, file_name, file_url, poster_url, mime_type, kind, file_size, file_hash, uploaded_by_name, created_at, duration_seconds, width, height')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      // Site video lives in the library too (photos is image-only), so the
      // gallery is the one place a GC rewatches what the crew recorded.
      .in('kind', ['image', 'video'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500);
    if (filesErr) throw filesErr;

    const seenObjects = new Set<string>();
    const seenHashes = new Set<string>();
    for (const p of (data || []) as Record<string, any>[]) {
      const k = storageObjectKey(p.url);
      if (k) seenObjects.add(k);
      if (p.file_hash) seenHashes.add(String(p.file_hash));
    }
    const fromFiles = ((fileRows || []) as Record<string, any>[])
      .filter((f) => {
        const k = storageObjectKey(f.file_url);
        if (k && seenObjects.has(k)) return false;
        if (f.file_hash && seenHashes.has(String(f.file_hash))) return false;
        return true;
      })
      .map((f) => ({
        id: `file:${f.id}`,
        file_id: f.id,
        source: 'files',
        // Videos are managed from the gallery (delete goes to /api/files/[id]);
        // library images stay read-only here and are edited in Files & Media.
        read_only: f.kind !== 'video',
        media: f.kind === 'video' ? 'video' : 'image',
        duration_seconds: f.duration_seconds ?? null,
        width: f.width ?? null,
        height: f.height ?? null,
        project_id: f.project_id,
        title: titleFromFileName(String(f.file_name || 'Photo')),
        filename: f.file_name,
        url: f.file_url,
        // poster_url is the Files library's stored small variant (see /api/files/upload).
        thumbnail_url: f.poster_url || null,
        album: f.kind === 'video' ? VIDEO_ALBUM : FILES_ALBUM,
        taken_at: f.created_at,
        created_at: f.created_at,
        taken_by: f.uploaded_by_name || null,
        mime_type: f.mime_type,
        file_size: f.file_size,
        tags: [],
      }));
    // Partial beats nothing here: one unsignable library file must not blank the
    // gallery's real photos. Failures are logged by the signer and come back ''.
    const signedFiles = await signFields(fromFiles, ['url', 'thumbnail_url'], 3600, { strict: false });
    const merged = [...photos, ...signedFiles.filter((f) => f.url)].sort((a, b) =>
      String(b.taken_at || b.created_at || '').localeCompare(String(a.taken_at || a.created_at || '')),
    );
    return NextResponse.json({ photos: merged, fromFiles: signedFiles.length });
  } catch (e: unknown) {
    // Never a silent empty gallery: say it failed so the UI can show a retry
    // instead of an indistinguishable "no photos yet". A signing failure lands
    // here too — a broken-image grid reads as "the photos are gone".
    return apiError('photos/list', e, "Couldn't load photos");
  }
}
