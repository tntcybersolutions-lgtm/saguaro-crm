/**
 * /api/projects/:projectId/banner — the job home banner's photo and faces.
 *
 * GET  -> { photo, recent, team }
 *   photo   the job's cover (projects.cover_photo_url) or, without one, its
 *           newest photo; null when the job has no pictures at all
 *   recent  up to 12 newest pictures (photos + Files & Media images), for
 *           the "Change cover" picker
 *   team    project_team rows with the person's profile photo when they have one
 * POST { photoId } -> sets that picture as the cover; { photoId: null } clears it
 *
 * Every read is tenant-filtered; storage URLs are signed on the way out.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { signFields, signUrl, storageObjectKey } from '@/lib/storage-signing';

export const dynamic = 'force-dynamic';

type Pic = { id: string; url: string; thumbnail_url: string | null; taken_at: string | null; title: string | null };

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const db = createServerClient();
  const g = await requirePermission(req, 'Projects', 'View', { projectId: params.projectId, db });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const { data: project, error: pErr } = await db.from('projects').select('id, cover_photo_url').eq('id', params.projectId).eq('tenant_id', user.tenantId).maybeSingle();
    if (pErr) throw pErr;
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [ph, fl, tm] = await Promise.all([
      db.from('photos').select('id, url, thumbnail_url, taken_at, created_at, title').eq('tenant_id', user.tenantId).eq('project_id', params.projectId).order('taken_at', { ascending: false, nullsFirst: false }).limit(12),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).from('project_files').select('id, file_url, poster_url, file_name, created_at').eq('tenant_id', user.tenantId).eq('project_id', params.projectId).eq('kind', 'image').is('deleted_at', null).order('created_at', { ascending: false }).limit(12),
      db.from('project_team').select('id, user_id, name, email, role, added_at').eq('tenant_id', user.tenantId).eq('project_id', params.projectId),
    ]);
    if (ph.error) throw ph.error;
    if (tm.error) throw tm.error;

    /* Pictures: photos first, then library images not already in photos. */
    const seen = new Set<string>();
    const pics: Pic[] = [];
    for (const r of (ph.data || []) as Record<string, any>[]) {
      if (!r.url) continue;
      const k = storageObjectKey(r.url); if (k) seen.add(k);
      pics.push({ id: String(r.id), url: r.url, thumbnail_url: r.thumbnail_url || null, taken_at: r.taken_at || r.created_at || null, title: r.title || null });
    }
    if (!fl.error) {
      for (const f of (fl.data || []) as Record<string, any>[]) {
        if (!f.file_url) continue;
        const k = storageObjectKey(f.file_url);
        if (k && seen.has(k)) continue;
        pics.push({ id: `file:${f.id}`, url: f.file_url, thumbnail_url: f.poster_url || null, taken_at: f.created_at || null, title: f.file_name || null });
      }
    } else console.error('[banner] project_files read failed', fl.error);
    pics.sort((a, b) => String(b.taken_at || '').localeCompare(String(a.taken_at || '')));
    const raw = pics.slice(0, 12);
    const recent = (await signFields(raw, ['url', 'thumbnail_url'], 3600, { strict: false })).filter((p) => p.url);

    /* The cover: the saved one when it still signs, otherwise the newest picture. */
    const coverStored = (project as Record<string, any>).cover_photo_url as string | null;
    let photo: { url: string; source: 'cover' | 'latest'; id: string | null } | null = null;
    if (coverStored) {
      const url = await signUrl(coverStored);
      const ck = storageObjectKey(coverStored);
      const match = raw.findIndex((p) => (ck && storageObjectKey(p.url) === ck) || p.url === coverStored);
      if (url) photo = { url, source: 'cover', id: match >= 0 ? raw[match].id : null };
    }
    if (!photo && recent[0]) photo = { url: recent[0].url, source: 'latest', id: recent[0].id };

    /* Faces: the profile photo of each person on the job, by user id, then email. */
    const team = (tm.data || []) as Record<string, any>[];
    const ids = Array.from(new Set(team.map((t) => t.user_id).filter(Boolean)));
    const emails = Array.from(new Set(team.filter((t) => !t.user_id && t.email).map((t) => String(t.email).toLowerCase())));
    const profiles: Record<string, any>[] = [];
    if (ids.length) {
      const r = await db.from('profiles').select('id, email, full_name, avatar_url').eq('tenant_id', user.tenantId).in('id', ids);
      if (r.error) console.error('[banner] profiles by id failed', r.error); else profiles.push(...(r.data || []));
    }
    if (emails.length) {
      const r = await db.from('profiles').select('id, email, full_name, avatar_url').eq('tenant_id', user.tenantId).in('email', emails);
      if (r.error) console.error('[banner] profiles by email failed', r.error); else profiles.push(...(r.data || []));
    }
    const signedProfiles = await signFields(profiles.filter((p) => p.avatar_url), ['avatar_url'], 3600, { strict: false });
    const byId = new Map(signedProfiles.map((p) => [String(p.id), p]));
    const byEmail = new Map(signedProfiles.filter((p) => p.email).map((p) => [String(p.email).toLowerCase(), p]));
    const faces = team
      .sort((a, b) => String(a.added_at || '').localeCompare(String(b.added_at || '')))
      .map((t) => {
        const prof = (t.user_id && byId.get(String(t.user_id))) || (t.email && byEmail.get(String(t.email).toLowerCase())) || null;
        return {
          key: String(t.user_id || (t.email ? String(t.email).toLowerCase() : '') || t.id),
          name: String(t.name || prof?.full_name || t.email || '').trim(),
          role: t.role || null,
          avatarUrl: prof?.avatar_url || null,
        };
      })
      .filter((f) => f.name);

    return NextResponse.json({ photo, recent: recent.map(({ id, url, thumbnail_url, title }) => ({ id, url, thumbnail_url, title })), team: faces });
  } catch (e) {
    return apiError('projects/[projectId]/banner', e, "Couldn't load this job's photo and team.");
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const db = createServerClient();
  const g = await requirePermission(req, 'Projects', 'Edit', { projectId: params.projectId, db });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json().catch(() => null) as { photoId?: unknown } | null;
    if (!body || !('photoId' in body)) return NextResponse.json({ error: 'photoId is required (or null to clear the cover)' }, { status: 400 });
    const photoId = body.photoId == null ? null : String(body.photoId);

    let stored: string | null = null;
    if (photoId) {
      if (photoId.startsWith('file:')) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (db as any).from('project_files').select('file_url').eq('id', photoId.slice(5)).eq('tenant_id', user.tenantId).eq('project_id', params.projectId).eq('kind', 'image').maybeSingle();
        if (error) throw error;
        stored = (data as { file_url?: string } | null)?.file_url || null;
      } else {
        const { data, error } = await db.from('photos').select('url').eq('id', photoId).eq('tenant_id', user.tenantId).eq('project_id', params.projectId).maybeSingle();
        if (error) throw error;
        stored = (data as { url?: string } | null)?.url || null;
      }
      if (!stored) return NextResponse.json({ error: 'That photo is not on this job' }, { status: 404 });
    }

    const { data, error } = await db
      .from('projects')
      .update({ cover_photo_url: stored, updated_at: new Date().toISOString() } as never)
      .eq('id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true, cover: !!stored });
  } catch (e) {
    return apiError('projects/[projectId]/banner POST', e, "Couldn't set the cover photo.");
  }
}
