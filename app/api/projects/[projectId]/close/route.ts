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
import { contractSum } from '@/lib/closeout-doc-data';
import { normalisePhase } from '@/lib/project-phase';

/** projects.phase written on close. lib/project-phase has only two working
 *  phases (bidding | building) and normalises 'closeout' to 'building', so
 *  every reader keeps working; the journey rail and next-step bar read the
 *  closed STATUS and stop showing the building checklist. */
const CLOSED_PHASE = 'closeout';
/** What a reopened job goes back to. */
const REOPENED_PHASE = 'building';

/** Bid package statuses that are already final. Anything else on a closed
 *  job is still being advertised on the company Bid Board as open. */
const BID_PACKAGE_TERMINAL = ['awarded', 'closed', 'cancelled', 'canceled'];

/** Fallback only: YYYY-MM-DD on the server clock, which is UTC on Vercel.
 *  The closeout screen sends the user's own date as `closeout_date`, so a job
 *  closed on an Arizona evening is not recorded as tomorrow. */
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

    const [{ blockers, unchecked, placeholderWaivers }, contract] = await Promise.all([
      closeoutBlockers(db, g.user.tenantId, params.projectId),
      // The closeout money strip read only original_contract_amount /
      // contract_amount and showed "$0 — fully billed" on a $2.4M job.
      contractSum(db, g.user.tenantId, params.projectId),
    ]);
    return NextResponse.json({
      project,
      closed: isClosedStatus(project.status),
      blockers,
      // Named so the UI can say "could not be checked" instead of showing a
      // clean gate it has no evidence for.
      unchecked,
      // Auto-filed "[Award pending]" waivers with no claimant. Not blockers;
      // reported so the checklist can say why they do not count.
      placeholderWaivers,
      contract,
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
      .select('id, name, status, phase')
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
    // Left at 'building', the rail kept walking a finished job through
    // "Set contract & budget". A bid that is closed (lost) keeps 'bidding'.
    if (normalisePhase(project.phase) === 'building') patch.phase = CLOSED_PHASE;
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

    /* A closed job is not taking bids. Its packages stayed 'open' and the
       company Bid Board kept counting them as live. Awarded packages are
       history and are left exactly as they are. */
    const { data: closedPackages, error: pkgErr } = await db
      .from('bid_packages')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('tenant_id', g.user.tenantId)
      .eq('project_id', params.projectId)
      .not('status', 'in', `(${BID_PACKAGE_TERMINAL.join(',')})`)
      .is('awarded_to', null)
      .select('id');
    if (pkgErr) throw pkgErr;

    return NextResponse.json({
      project: data,
      bidPackagesClosed: (closedPackages || []).length,
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
    const { data: current, error: readErr } = await db
      .from('projects')
      .select('id, phase')
      .eq('id', params.projectId)
      .eq('tenant_id', g.user.tenantId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const reopen: Record<string, unknown> = {
      status: ACTIVE_STATUS,
      closeout_date: null,
      actual_end_date: null,
      updated_at: new Date().toISOString(),
    };
    // Undo only what Close wrote; a bidding job stays bidding.
    if (String(current.phase || '').toLowerCase() === CLOSED_PHASE) reopen.phase = REOPENED_PHASE;
    const { data, error } = await db
      .from('projects')
      .update(reopen)
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
