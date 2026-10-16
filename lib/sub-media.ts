/**
 * End-of-day photos & video from subs (and the crews they hand their portal
 * link to). Server only.
 *
 * Every upload is one `sub_media_submissions` row. The sub picks where it goes:
 *   'project' — filed into the job right away (photos row / project_files row)
 *   'gc'      — held for the GC; nothing reaches the job until the GC adds it
 * Either way the row stays 'new' until someone on the GC side has seen it —
 * that is the review inbox on the job's Photos page and the Home alert.
 */
import type { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { PHOTO_BUCKET, insertPhotoRow, PhotoStoreError } from '@/lib/photo-store';
import { signStoredUrl } from '@/lib/storage-signing';

/* sub_media_submissions (and project_files' media columns) aren't in the
   generated Database types — use the untyped client, like the files routes. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = ReturnType<typeof createServerClient>;

export const END_OF_DAY_ALBUM = 'End of Day';
export const SUB_VIDEO_FOLDER = 'Photos & Video';

export interface SubSession {
  id: string;
  tenant_id: string;
  project_id: string | null;
  sub_id: string | null;
  sub_company: string | null;
  sub_contact_name: string | null;
}

/** The active portal session behind `?token=` / `x-portal-token`, or null. */
export async function authSubPortal(req: NextRequest): Promise<SubSession | null> {
  const token = req.nextUrl.searchParams.get('token') || req.headers.get('x-portal-token');
  if (!token) return null;
  const db = createServerClient();
  const { data } = await db
    .from('portal_sub_sessions')
    .select('id, tenant_id, project_id, sub_id, sub_company, sub_contact_name')
    .eq('token', token).gt('expires_at', new Date().toISOString())
    .eq('status', 'active')
    .maybeSingle();
  return (data as SubSession | null) ?? null;
}

/** Every object a session may upload lives under here — and nowhere else. */
export function subMediaPrefix(s: SubSession): string {
  return `${s.tenant_id}/projects/${s.project_id}/sub-media/${s.sub_id || s.id}/`;
}

export function senderLabel(s: Pick<SubSession, 'sub_company' | 'sub_contact_name'>): string {
  return (s.sub_company || s.sub_contact_name || 'Subcontractor').trim();
}

/** "6 photos and 1 video" */
export function countPhrase(photos: number, videos: number): string {
  const p = photos ? `${photos} photo${photos === 1 ? '' : 's'}` : '';
  const v = videos ? `${videos} video${videos === 1 ? '' : 's'}` : '';
  return [p, v].filter(Boolean).join(' and ') || 'nothing';
}

/** File a video into the job's library (the gallery lists it under Video). */
export async function insertVideoFile(
  db: Db,
  v: {
    tenantId: string; projectId: string; path: string; fileName: string; fileSize: number | null;
    contentType: string | null; posterPath: string | null; durationSeconds: number | null;
    uploadedByName: string; subId: string | null;
  },
): Promise<string> {
  const admin = db as any;
  const pub = (p: string) => admin.storage.from(PHOTO_BUCKET).getPublicUrl(p).data.publicUrl as string;
  const { data, error } = await admin
    .from('project_files')
    .insert({
      tenant_id: v.tenantId,
      project_id: v.projectId,
      file_name: v.fileName,
      file_url: pub(v.path),
      file_size: v.fileSize,
      file_type: v.contentType || 'video/mp4',
      mime_type: v.contentType || 'video/mp4',
      kind: 'video',
      storage_bucket: PHOTO_BUCKET,
      storage_path: v.path,
      category: 'video',
      folder: SUB_VIDEO_FOLDER,
      entity_type: v.subId ? 'subcontractor' : null,
      entity_id: v.subId,
      uploaded_by: null,
      uploaded_by_name: v.uploadedByName,
      is_current: true,
      version_number: 1,
      ...(v.posterPath ? { poster_url: pub(v.posterPath) } : {}),
      ...(v.durationSeconds ? { duration_seconds: v.durationSeconds } : {}),
    })
    .select('id')
    .single();
  if (error || !data) throw new PhotoStoreError(500, "The video didn't save to the job", error);
  return String(data.id);
}

/**
 * Put a held ('gc') submission into the job: a photos row for a photo, a
 * project_files row for a video. Idempotent — a row already on the job is
 * returned untouched.
 */
export async function addSubmissionToJob(db: Db, row: any, reviewerId: string | null): Promise<any> {
  if (row.photo_id || row.file_id) {
    if (row.status !== 'added') {
      await (db as any).from('sub_media_submissions').update({ status: 'added', reviewed_at: new Date().toISOString(), reviewed_by: reviewerId }).eq('id', row.id).eq('tenant_id', row.tenant_id);
    }
    return { ...row, status: 'added' };
  }
  const admin = db as any;
  const pub = (p: string) => admin.storage.from(PHOTO_BUCKET).getPublicUrl(p).data.publicUrl as string;
  const patch: Record<string, unknown> = { status: 'added', reviewed_at: new Date().toISOString(), reviewed_by: reviewerId };
  if (row.kind === 'image') {
    const photo = await insertPhotoRow(
      db,
      { url: pub(row.storage_path), thumbnailUrl: row.thumb_path ? pub(row.thumb_path) : null, filename: row.file_name, bytes: Number(row.file_size) || 0, contentType: row.mime_type || 'image/jpeg' },
      {
        tenantId: row.tenant_id,
        projectId: row.project_id,
        category: END_OF_DAY_ALBUM,
        caption: row.note || '',
        takenBy: row.sender_company || row.sender_name || '',
        takenAt: row.created_at,
        extra: { title: `${row.sender_company || 'Sub'} — end of day`, album: END_OF_DAY_ALBUM, ...(row.note ? { description: row.note } : {}) },
      },
    );
    patch.photo_id = (photo as any).id;
  } else {
    patch.file_id = await insertVideoFile(db, {
      tenantId: row.tenant_id, projectId: row.project_id, path: row.storage_path, fileName: row.file_name,
      fileSize: row.file_size ?? null, contentType: row.mime_type, posterPath: row.thumb_path,
      durationSeconds: row.duration_seconds ? Number(row.duration_seconds) : null,
      uploadedByName: row.sender_company || row.sender_name || 'Subcontractor', subId: row.sub_id,
    });
  }
  const { data, error } = await admin.from('sub_media_submissions').update(patch).eq('id', row.id).eq('tenant_id', row.tenant_id).select('*').single();
  if (error) throw error;
  return data;
}

/** Signed URLs for one submission (the bucket is private). */
export async function signSubmission(row: any): Promise<any> {
  const [url, thumb] = await Promise.all([
    signStoredUrl(PHOTO_BUCKET, row.storage_path, 3600),
    row.thumb_path ? signStoredUrl(PHOTO_BUCKET, row.thumb_path, 3600) : Promise.resolve(''),
  ]);
  return { ...row, url: url || null, thumbnail_url: thumb || null };
}
