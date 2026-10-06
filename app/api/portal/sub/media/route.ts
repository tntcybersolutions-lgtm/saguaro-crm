import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { UnsupportedImageError } from '@/lib/image-thumb';
import { classifyKind } from '@/lib/filekind';
import {
  renderAndStorePhoto, insertPhotoRow, downloadStaged, removeQuietly, PhotoStoreError,
} from '@/lib/photo-store';
import {
  authSubPortal, subMediaPrefix, senderLabel, insertVideoFile, signSubmission, END_OF_DAY_ALBUM,
} from '@/lib/sub-media';

// A big original is shrunk here (sharp); the bytes come from storage, not the request.
export const runtime = 'nodejs';
export const maxDuration = 60;
/* eslint-disable @typescript-eslint/no-explicit-any */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET — this sub's own recent end-of-day uploads on this job, with whether the GC has seen them. */
export async function GET(req: NextRequest) {
  const session = await authSubPortal(req);
  if (!session) return NextResponse.json({ error: 'Invalid or expired portal link' }, { status: 401 });
  try {
    const db = createServerClient() as any;
    let q = db
      .from('sub_media_submissions')
      .select('id, batch_id, kind, file_name, storage_path, thumb_path, destination, status, note, created_at, duration_seconds')
      .eq('tenant_id', session.tenant_id)
      .eq('project_id', session.project_id)
      .order('created_at', { ascending: false })
      .limit(60);
    q = session.sub_id ? q.eq('sub_id', session.sub_id) : q.eq('portal_session_id', session.id);
    const { data, error } = await q;
    if (error) throw error;
    const items = await Promise.all((data || []).map(signSubmission));
    return NextResponse.json({ items });
  } catch (e: unknown) {
    return apiError('portal/sub/media', e, "Couldn't load your uploads");
  }
}

/**
 * POST — file ONE uploaded photo or video.
 *   { path, fileName, contentType?, fileSize?, posterPath?, durationSeconds?,
 *     destination: 'project' | 'gc', note?, batchId }
 * 'project': into the job now (photos row, album End of Day / a Video file).
 * 'gc':      held for the GC — stored and listed in their inbox, not the job.
 */
export async function POST(req: NextRequest) {
  const session = await authSubPortal(req);
  if (!session) return NextResponse.json({ error: 'Invalid or expired portal link' }, { status: 401 });
  if (!session.project_id) return NextResponse.json({ error: 'This portal link is not tied to a job' }, { status: 400 });
  const projectId = session.project_id;

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '');
  const path = str('path');
  const fileName = str('fileName') || 'upload';
  const destination = str('destination') === 'gc' ? 'gc' : str('destination') === 'project' ? 'project' : '';
  const batchId = str('batchId');
  const posterPath = str('posterPath') || null;
  const prefix = subMediaPrefix(session);

  if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 });
  if (!destination) return NextResponse.json({ error: "destination must be 'project' or 'gc'" }, { status: 400 });
  if (!UUID.test(batchId)) return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
  for (const p of [path, posterPath]) {
    if (p && (!p.startsWith(prefix) || p.includes('..'))) {
      return NextResponse.json({ error: 'That upload is not part of this portal' }, { status: 403 });
    }
  }

  const contentType = str('contentType') || null;
  const kind = classifyKind(contentType, fileName);
  if (kind !== 'image' && kind !== 'video') {
    return NextResponse.json({ error: 'Only photos and videos can be sent here' }, { status: 400 });
  }
  const note = str('note').slice(0, 2000) || null;
  const sender = senderLabel(session);
  const db = createServerClient();
  const admin = db as any;

  const base = {
    tenant_id: session.tenant_id,
    project_id: projectId,
    sub_id: session.sub_id,
    portal_session_id: session.id,
    batch_id: batchId,
    sender_company: session.sub_company,
    sender_name: session.sub_contact_name,
    note,
    destination,
    kind,
    file_name: fileName.slice(0, 200),
    status: 'new',
  };

  try {
    let row: Record<string, unknown>;
    if (kind === 'image') {
      const original = await downloadStaged(db, path);
      let r;
      try {
        r = await renderAndStorePhoto(db, { projectId, original, fileName, contentType });
      } finally {
        // The display copy + thumbnail are what's kept; the staged original isn't referenced.
        await removeQuietly(db, [path]);
      }
      let photoId: string | null = null;
      if (destination === 'project') {
        try {
          const photo = await insertPhotoRow(db, r, {
            tenantId: session.tenant_id,
            projectId,
            category: END_OF_DAY_ALBUM,
            caption: note || '',
            takenBy: sender,
            extra: { title: `${sender} — end of day`, album: END_OF_DAY_ALBUM, ...(note ? { description: note } : {}) },
          });
          photoId = String((photo as any).id);
        } catch (e) {
          await removeQuietly(db, r.thumbPath ? [r.storagePath, r.thumbPath] : [r.storagePath]);
          throw e;
        }
      }
      row = { ...base, storage_path: r.storagePath, thumb_path: r.thumbPath, mime_type: r.contentType, file_size: r.bytes, photo_id: photoId };
    } else {
      const fileSize = Number(b.fileSize) > 0 ? Math.round(Number(b.fileSize)) : null;
      const duration = Number(b.durationSeconds) > 0 ? Number(b.durationSeconds) : null;
      let fileId: string | null = null;
      if (destination === 'project') {
        fileId = await insertVideoFile(db, {
          tenantId: session.tenant_id, projectId, path, fileName, fileSize, contentType,
          posterPath, durationSeconds: duration, uploadedByName: sender, subId: session.sub_id,
        });
      }
      row = { ...base, storage_path: path, thumb_path: posterPath, mime_type: contentType, file_size: fileSize, duration_seconds: duration, file_id: fileId };
    }

    const { data, error } = await admin.from('sub_media_submissions').insert(row).select('*').single();
    if (error) throw error;
    const signed = await signSubmission(data);
    return NextResponse.json({ item: signed }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof UnsupportedImageError) return apiError('portal/sub/media', e, e.message, 415);
    if (e instanceof PhotoStoreError) return apiError('portal/sub/media', e.detail ?? e, e.message, e.status);
    return apiError('portal/sub/media', e, "That upload didn't save. Try again.");
  }
}
