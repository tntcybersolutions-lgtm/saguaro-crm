import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { addSubmissionToJob, signSubmission } from '@/lib/sub-media';
import { PHOTO_BUCKET } from '@/lib/photo-store';

export const runtime = 'nodejs';
export const maxDuration = 60;
/* eslint-disable @typescript-eslint/no-explicit-any */

async function projectInTenant(db: any, projectId: string, tenantId: string): Promise<boolean> {
  const { data } = await db.from('projects').select('id').eq('id', projectId).eq('tenant_id', tenantId).maybeSingle();
  return !!data;
}

/**
 * GET /api/projects/[projectId]/sub-media
 * The GC's inbox of end-of-day photos & video from subs on this job: the
 * newest 200, signed for viewing, plus how many nobody has looked at yet.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const g = await requirePermission(req, 'Documents', 'View', { projectId });
  if (!g.ok) return g.res;
  try {
    const db = createServerClient() as any;
    if (!(await projectInTenant(db, projectId, g.user.tenantId))) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const { data, error } = await db
      .from('sub_media_submissions')
      .select('*')
      .eq('tenant_id', g.user.tenantId)
      .eq('project_id', projectId)
      .neq('status', 'dismissed')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    const items = await Promise.all((data || []).map(signSubmission));
    return NextResponse.json({ items, newCount: items.filter((i: any) => i.status === 'new').length });
  } catch (e: unknown) {
    return apiError('projects/sub-media', e, "Couldn't load uploads from subs");
  }
}

/**
 * PATCH /api/projects/[projectId]/sub-media  { ids: string[], action }
 *   seen    — mark looked at (clears the "new" alert)
 *   add     — put held ('send to GC') items into the job: photos / video library
 *   dismiss — hide from the inbox; anything already on the job stays there,
 *             and an item only the GC had is removed from storage
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const g = await requirePermission(req, 'Documents', 'Edit', { projectId });
  if (!g.ok) return g.res;
  try {
    const body = (await req.json().catch(() => ({}))) as { ids?: unknown; action?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 200) : [];
    const action = body.action;
    if (!ids.length) return NextResponse.json({ error: 'ids is required' }, { status: 400 });
    if (action !== 'seen' && action !== 'add' && action !== 'dismiss') {
      return NextResponse.json({ error: "action must be 'seen', 'add' or 'dismiss'" }, { status: 400 });
    }

    const db = createServerClient() as any;
    if (!(await projectInTenant(db, projectId, g.user.tenantId))) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const { data: rows, error } = await db
      .from('sub_media_submissions')
      .select('*')
      .eq('tenant_id', g.user.tenantId)
      .eq('project_id', projectId)
      .in('id', ids);
    if (error) throw error;
    const list = (rows || []) as any[];
    const now = new Date().toISOString();

    if (action === 'seen') {
      const fresh = list.filter((r) => r.status === 'new').map((r) => r.id);
      if (fresh.length) {
        const { error: upErr } = await db.from('sub_media_submissions')
          .update({ status: 'seen', reviewed_at: now, reviewed_by: g.user.id })
          .eq('tenant_id', g.user.tenantId).in('id', fresh);
        if (upErr) throw upErr;
      }
      return NextResponse.json({ updated: fresh.length });
    }

    if (action === 'add') {
      let added = 0;
      const failed: string[] = [];
      for (const r of list) {
        try { await addSubmissionToJob(db, r, g.user.id); added++; }
        catch (e) { console.error('[projects/sub-media] add failed', r.id, e); failed.push(r.id); }
      }
      return NextResponse.json({ added, failed }, { status: failed.length && !added ? 500 : 200 });
    }

    // dismiss
    const heldOnly = list.filter((r) => !r.photo_id && !r.file_id);
    const paths = heldOnly.flatMap((r) => [r.storage_path, r.thumb_path].filter(Boolean));
    if (paths.length) {
      const { error: rmErr } = await db.storage.from(PHOTO_BUCKET).remove(paths);
      if (rmErr) console.error('[projects/sub-media] dismiss cleanup failed:', rmErr.message);
    }
    const { error: dErr } = await db.from('sub_media_submissions')
      .update({ status: 'dismissed', reviewed_at: now, reviewed_by: g.user.id })
      .eq('tenant_id', g.user.tenantId).in('id', list.map((r) => r.id));
    if (dErr) throw dErr;
    return NextResponse.json({ dismissed: list.length });
  } catch (e: unknown) {
    return apiError('projects/sub-media', e, "Couldn't update those uploads");
  }
}
