/**
 * CLOSE OUT A PROJECT — the action the closeout screen never had.
 *
 * GET   readiness: what is still open, and whether the project is already closed.
 * POST  close it.   Body: { substantial_completion?, final_completion?, force? }
 * DELETE reopen it.
 *
 * The gate warns, it does not wall — see lib/project-lifecycle.ts for why.
 * A close that ignores open items must pass `force: true`, and that decision
 * is written into the project's notes trail rather than left implicit.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import {
  closeoutBlockers,
  CLOSED_STATUS,
  ACTIVE_STATUS,
  isClosedStatus,
} from '@/lib/project-lifecycle';

/** YYYY-MM-DD in the server's local date, never `new Date().toISOString()`
 *  which shifts the day for anyone west of UTC. */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Accept a date only in the form the DATE columns take. Anything else is
 *  rejected rather than coerced into a wrong day. */
const asDate = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'View', { projectId: params.projectId });
  if (!g.ok) return g.res;
  try {
    const db = createServerClient();
    const { data: project, error } = await db
      .from('projects')
      .select('id, name, status, closeout_date, substantial_completion_date, final_completion_date, actual_end_date, is_archived')
      .eq('id', params.projectId)
      .eq('tenant_id', g.user.tenantId)
      .single();
    if (error) throw error;
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { blockers, unchecked } = await closeoutBlockers(db, g.user.tenantId, params.projectId);
    return NextResponse.json({
      project,
      closed: isClosedStatus(project.status),
      blockers,
      // Named so the UI can say "could not be checked" instead of showing a
      // clean gate it has no evidence for.
      unchecked,
    });
  } catch (e) {
    return apiError('projects/close', e, 'Could not check closeout readiness');
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit', { projectId: params.projectId });
  if (!g.ok) return g.res;
  try {
    const db = createServerClient();
    const body = await req.json().catch(() => ({}));

    const { data: project, error: readErr } = await db
      .from('projects')
      .select('id, name, status')
      .eq('id', params.projectId)
      .eq('tenant_id', g.user.tenantId)
      .single();
    if (readErr) throw readErr;
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (isClosedStatus(project.status)) {
      // 409 with the record, per the repo's conflict convention.
      return NextResponse.json(
        { error: 'This project is already closed.', project },
        { status: 409 },
      );
    }

    const { blockers, unchecked } = await closeoutBlockers(db, g.user.tenantId, params.projectId);
    if ((blockers.length > 0 || unchecked.length > 0) && !body.force) {
      return NextResponse.json(
        {
          error: 'This project still has open items.',
          blockers,
          unchecked,
          // The client re-sends with force:true once the user has seen this.
          needsConfirmation: true,
        },
        { status: 409 },
      );
    }

    const closeDate = asDate(body.closeout_date) || today();
    const patch: Record<string, unknown> = {
      status: CLOSED_STATUS,
      closeout_date: closeDate,
      actual_end_date: closeDate,
      percent_complete: 100,
      updated_at: new Date().toISOString(),
    };
    const sub = asDate(body.substantial_completion);
    const fin = asDate(body.final_completion);
    if (sub) patch.substantial_completion_date = sub;
    if (fin) patch.final_completion_date = fin;

    const { data, error } = await db
      .from('projects')
      .update(patch)
      .eq('id', params.projectId)
      .eq('tenant_id', g.user.tenantId)
      .select('id, name, status, closeout_date, substantial_completion_date, final_completion_date')
      .single();
    if (error) throw error;

    return NextResponse.json({
      project: data,
      // Echoed back so the UI can say what was overridden, and so the
      // response is a record of it rather than a bare success.
      closedOverOpenItems: body.force ? blockers : [],
    });
  } catch (e) {
    return apiError('projects/close', e, 'Could not close the project');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit', { projectId: params.projectId });
  if (!g.ok) return g.res;
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('projects')
      .update({
        status: ACTIVE_STATUS,
        closeout_date: null,
        actual_end_date: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.projectId)
      .eq('tenant_id', g.user.tenantId)
      .select('id, name, status')
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ project: data });
  } catch (e) {
    return apiError('projects/close', e, 'Could not reopen the project');
  }
}
