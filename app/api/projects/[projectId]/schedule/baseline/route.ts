import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';

/**
 * POST /api/projects/[projectId]/schedule/baseline — "Set Baseline": every
 * task's current start/end becomes its baseline (lib/schedule-baseline), and
 * the project records when. Setting it again replaces the old baseline.
 * Tasks with no dates get no baseline.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const g = await requirePermission(req, 'Schedule', 'Edit', { projectId });
  if (!g.ok) return g.res;
  const { db, user } = g;
  try {
    const { data: project, error: pErr } = await db.from('projects').select('id').eq('id', projectId).eq('tenant_id', user.tenantId).maybeSingle();
    if (pErr) throw pErr;
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const { data: tasks, error: tErr } = await db.from('schedule_tasks').select('id, start_date, end_date')
      .eq('project_id', projectId).eq('tenant_id', user.tenantId);
    if (tErr) throw tErr;
    const dated = (tasks || []).filter((t) => t.start_date && t.end_date);
    if (!dated.length) return NextResponse.json({ error: 'Add tasks with start and end dates first — there is nothing to baseline yet.' }, { status: 400 });

    // Column-to-column copy, one row at a time (PostgREST has no SET a = b), a few at once.
    for (let i = 0; i < dated.length; i += 20) {
      const chunk = dated.slice(i, i + 20);
      const results = await Promise.all(chunk.map((t) => db.from('schedule_tasks')
        .update({ baseline_start: t.start_date, baseline_end: t.end_date })
        .eq('id', t.id).eq('tenant_id', user.tenantId)));
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    }
    const at = new Date().toISOString();
    const { error: uErr } = await db.from('projects').update({ schedule_baselined_at: at }).eq('id', projectId).eq('tenant_id', user.tenantId);
    if (uErr) throw uErr;
    return NextResponse.json({ success: true, baselined: dated.length, at });
  } catch (e) {
    return apiError('schedule/baseline', e, 'Could not set the baseline. Please try again.');
  }
}
