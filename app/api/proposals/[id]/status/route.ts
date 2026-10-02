import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';

/**
 * Client accept/decline for a proposal. Flips the proposal's status (and stamps
 * accepted_at / declined_at); recording the win/loss + firing the learner is a
 * SEPARATE call the client makes to POST /api/bids/outcome.
 *
 * ACCEPTED BECOMES THE CONTRACT. Accepting a version used to flip only the
 * proposal row, so the project's contract columns stayed $0 while the versions
 * table said "accepted" — the overview, pay apps (G702 line 1), closeout and
 * G706 all read the PROJECT, never the proposal. Accepting now:
 *   1. supersedes any other accepted version on the same project (one contract),
 *   2. writes the accepted amount to every project contract column a reader uses:
 *        contract_amount          — overview, projects list, closeout, G706, pay-app create fallback
 *        original_contract_amount — project-context originalContract, pay-app create G702 line 1
 *        original_contract        — overview "Original Contract" row
 *        contract_value           — projects create/list, /api/projects/[id] contract summary
 *        original_contract_value  — /api/projects/[id] + lib/project-context contract summary
 *        contract_sum             — mirrors the column set projects/create writes
 *        revised_contract_value   — client portal dashboard (original + approved COs)
 *
 * Body: { status: 'accepted' | 'declined' }
 * Service-role client bypasses RLS → every query is explicitly tenant-scoped.
 * updated_at is stamped by triggers on both proposals and projects.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const { id } = await params;
  const { user } = g;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = g.db as any;

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const status =
    body.status === 'accepted' ? 'accepted' : body.status === 'declined' ? 'declined' : null;
  if (!status) {
    return NextResponse.json({ error: 'status must be "accepted" or "declined".' }, { status: 400 });
  }

  // accepted_at and declined_at both exist on public.proposals (verified against schema).
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  if (status === 'accepted') patch.accepted_at = now;
  else patch.declined_at = now;

  try {
    const { data, error } = await db
      .from('proposals')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select('id, project_id, amount, total_amount')
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (status !== 'accepted' || !data.project_id) {
      return NextResponse.json({ success: true });
    }

    const projectId = String(data.project_id);
    const amount = Number(data.amount) || Number(data.total_amount) || 0;

    // 1. Only one accepted version per project — the new one supersedes the old.
    const { error: supErr } = await db
      .from('proposals')
      .update({ status: 'superseded' })
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .neq('id', id)
      .ilike('status', 'accepted');
    if (supErr) throw supErr;

    // 2. The accepted amount becomes the contract. Revised = original + approved COs.
    let contractUpdated = false;
    if (amount > 0) {
      const { data: cos, error: coErr } = await db
        .from('change_orders')
        .select('status, cost_impact, amount')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId);
      if (coErr) throw coErr;
      const approvedCoTotal = ((cos || []) as Array<{ status: string | null; cost_impact: unknown; amount: unknown }>)
        .filter((c) => String(c.status || '').toLowerCase() === 'approved')
        .reduce((s, c) => s + (Number(c.cost_impact) || Number(c.amount) || 0), 0);

      const { data: proj, error: projErr } = await db
        .from('projects')
        .update({
          contract_amount: amount,
          original_contract_amount: amount,
          original_contract: amount,
          contract_value: amount,
          original_contract_value: amount,
          contract_sum: amount,
          revised_contract_value: amount + approvedCoTotal,
        })
        .eq('id', projectId)
        .eq('tenant_id', user.tenantId)
        .select('id')
        .maybeSingle();
      if (projErr) throw projErr;
      contractUpdated = Boolean(proj);
    }

    return NextResponse.json({ success: true, contractAmount: amount, contractUpdated });
  } catch (e) {
    return apiError('proposals/status', e, 'Could not update the proposal status. Please try again.');
  }
}
