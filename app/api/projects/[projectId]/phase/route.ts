/**
 * GET/PUT /api/projects/[projectId]/phase — is this job being chased or built?
 *
 * The other half of the one question asked at project creation. A bid you win
 * has to be able to become a job you are building, and that move is the whole
 * point of having a phase: it is the moment the product should stop showing
 * you takeoff-and-proposal and start showing you budget-and-pay-apps.
 *
 * Stored in projects.phase, which existed with a default of 'preconstruction'
 * and was read by nothing before this. See lib/project-phase.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { normalisePhase, PHASE_LABEL, type ProjectPhase } from '@/lib/project-phase';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'View', { projectId: params.projectId });
  if (!g.ok) return g.res;
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('projects')
      .select('id, name, phase')
      .eq('id', params.projectId)
      .eq('tenant_id', g.user.tenantId)
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const phase = normalisePhase(data.phase);
    return NextResponse.json({ phase, label: PHASE_LABEL[phase], raw: data.phase });
  } catch (e) {
    return apiError('projects/phase', e, 'Could not read the project phase');
  }
}

export async function PUT(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit', { projectId: params.projectId });
  if (!g.ok) return g.res;
  try {
    const body = await req.json().catch(() => ({}));
    /* Only the two real answers are accepted. normalisePhase would happily
       turn anything at all into 'bidding', which is right when READING a
       legacy row and wrong when WRITING — a typo in a request must be a 400,
       not a silent move to the wrong phase. */
    const wanted = String(body.phase ?? '').toLowerCase().trim();
    if (wanted !== 'bidding' && wanted !== 'building') {
      return NextResponse.json(
        { error: "phase must be 'bidding' or 'building'" },
        { status: 400 },
      );
    }
    const phase = wanted as ProjectPhase;

    const db = createServerClient();
    const patch: Record<string, unknown> = { phase, updated_at: new Date().toISOString() };
    /* Winning a job is also the moment it becomes real work, so a project
       moving to 'building' that is still sitting on the default status gets
       marked active. Never the reverse: moving back to bidding does not
       un-close a job someone deliberately closed. */
    if (phase === 'building') patch.status = 'active';

    const { data, error } = await db
      .from('projects')
      .update(patch)
      .eq('id', params.projectId)
      .eq('tenant_id', g.user.tenantId)
      .select('id, name, phase, status')
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ project: data, phase, label: PHASE_LABEL[phase] });
  } catch (e) {
    return apiError('projects/phase', e, 'Could not change the project phase');
  }
}
