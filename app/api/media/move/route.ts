/**
 * POST /api/media/move — send photos and videos to another job.
 *
 * Body: { projectId: string, items: [{ kind: 'photo' | 'file', id: string }] }
 *   photo → a row in `photos` (Site Photos); file → a row in `project_files`
 *   (the video library). Up to 100 at once.
 *
 * Only the job changes: the stored file and its signed links stay the same, so
 * nothing re-uploads and nothing breaks. Both the media and the target job must
 * belong to the caller's company; a row from another company is never touched.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

type Item = { kind?: unknown; id?: unknown };

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  let body: { projectId?: unknown; items?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Send JSON: projectId and items' }, { status: 400 });
  }
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  const items = Array.isArray(body.items) ? (body.items as Item[]) : [];
  if (!items.length) return NextResponse.json({ error: 'items is required' }, { status: 400 });
  if (items.length > 100) return NextResponse.json({ error: 'Send at most 100 items at once' }, { status: 400 });
  const photoIds: string[] = [];
  const fileIds: string[] = [];
  for (const it of items) {
    if (typeof it?.id !== 'string' || !it.id) return NextResponse.json({ error: 'every item needs an id' }, { status: 400 });
    if (it.kind === 'photo') photoIds.push(it.id);
    else if (it.kind === 'file') fileIds.push(it.id);
    else return NextResponse.json({ error: "item kind must be 'photo' or 'file'" }, { status: 400 });
  }

  try {
    const db = createServerClient();
    const { data: job, error: jobErr } = await db
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (jobErr) throw jobErr;
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    let moved = 0;
    if (photoIds.length) {
      const { data, error } = await db
        .from('photos')
        .update({ project_id: projectId })
        .in('id', photoIds)
        .eq('tenant_id', user.tenantId)
        .select('id');
      if (error) throw error;
      moved += data?.length || 0;
    }
    if (fileIds.length) {
      const { data, error } = await db
        .from('project_files')
        .update({ project_id: projectId })
        .in('id', fileIds)
        .eq('tenant_id', user.tenantId)
        .select('id');
      if (error) throw error;
      moved += data?.length || 0;
    }
    if (!moved) return NextResponse.json({ error: 'Nothing to move — those photos were not found' }, { status: 404 });
    return NextResponse.json({ moved, project: { id: job.id, name: job.name } });
  } catch (e) {
    return apiError('media/move', e);
  }
}
