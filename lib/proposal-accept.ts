/**
 * lib/proposal-accept.ts — what happens when a proposal is accepted, whoever
 * accepts it: the GC pressing Mark Accepted (PATCH /api/proposals/[id]/status)
 * or the client signing it online (POST /api/documents/sign/complete).
 *
 * ACCEPTED BECOMES THE CONTRACT. Accepting a version used to flip only the
 * proposal row, so the project's contract columns stayed $0 while the versions
 * table said "accepted" — the overview, pay apps (G702 line 1), closeout and
 * G706 all read the PROJECT, never the proposal. Accepting:
 *   1. supersedes any other accepted version on the same project (one contract),
 *   2. writes the accepted amount to every project contract column a reader uses:
 *        contract_amount          — overview, projects list, closeout, G706, pay-app create fallback
 *        original_contract_amount — project-context originalContract, pay-app create G702 line 1
 *        original_contract        — overview "Original Contract" row
 *        contract_value           — projects create/list, /api/projects/[id] contract summary
 *        original_contract_value  — /api/projects/[id] + lib/project-context contract summary
 *        contract_sum             — mirrors the column set projects/create writes
 *        revised_contract_value   — client portal dashboard (original + approved COs)
 *   3. moves the job from bidding to building (projects.phase, lib/project-phase),
 *   4. starts the budget from the takeoff when the budget is still empty
 *      (lib/budget-seed) — the job's cost by CSI division, ready to track.
 * A client signature also records the win (lib/bid-outcome, the one write
 * path for outcomes); the GC's Mark Accepted opens the outcome modal instead.
 *
 * Service-role client bypasses RLS → every query is explicitly tenant-scoped.
 */
import { seedBudgetFromTakeoff } from '@/lib/budget-seed';
import { recordBidOutcome } from '@/lib/bid-outcome';
import { coAmount } from '@/lib/change-order-amount';

export interface AcceptResult {
  found: boolean;
  projectId: string | null;
  amount: number;
  contractUpdated: boolean;
  budgetLinesSeeded: number;
}

export interface ClientSignature {
  signedBy: string;
  signedIp: string;
  signatureData: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function acceptProposal(db: any, tenantId: string, proposalId: string, signature?: ClientSignature): Promise<AcceptResult> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: 'accepted', accepted_at: now };
  if (signature) {
    patch.signed_by = signature.signedBy;
    patch.signed_at = now;
    patch.signed_ip = signature.signedIp;
    patch.signature_data = signature.signatureData;
  }
  const { data, error } = await db
    .from('proposals')
    .update(patch)
    .eq('id', proposalId)
    .eq('tenant_id', tenantId)
    .select('id, project_id, amount, total_amount')
    .maybeSingle();
  if (error) throw error;
  const none: AcceptResult = { found: !!data, projectId: data?.project_id ? String(data.project_id) : null, amount: 0, contractUpdated: false, budgetLinesSeeded: 0 };
  if (!data || !data.project_id) return none;

  const projectId = String(data.project_id);
  const amount = Number(data.amount) || Number(data.total_amount) || 0;

  // 1. Only one accepted version per project — the new one supersedes the old.
  const { error: supErr } = await db
    .from('proposals')
    .update({ status: 'superseded' })
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .neq('id', proposalId)
    .ilike('status', 'accepted');
  if (supErr) throw supErr;

  // 2 + 3. The accepted amount becomes the contract (revised = original + approved COs) and the job is won.
  const projectPatch: Record<string, unknown> = { phase: 'building' };
  if (amount > 0) {
    const { data: cos, error: coErr } = await db
      .from('change_orders')
      .select('status, cost_impact, amount')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId);
    if (coErr) throw coErr;
    const approvedCoTotal = ((cos || []) as Array<{ status: string | null; cost_impact: unknown; amount: unknown }>)
      .filter((c) => String(c.status || '').toLowerCase() === 'approved')
      .reduce((s, c) => s + coAmount(c), 0);
    Object.assign(projectPatch, {
      contract_amount: amount,
      original_contract_amount: amount,
      original_contract: amount,
      contract_value: amount,
      original_contract_value: amount,
      contract_sum: amount,
      revised_contract_value: amount + approvedCoTotal,
    });
  }
  const { data: proj, error: projErr } = await db
    .from('projects')
    .update(projectPatch)
    .eq('id', projectId)
    .eq('tenant_id', tenantId)
    .select('id, name')
    .maybeSingle();
  if (projErr) throw projErr;

  // 4. The budget starts from the takeoff, only when nobody has built one yet.
  const budgetLinesSeeded = await seedBudgetFromTakeoff(db, tenantId, projectId);

  // A client's signature is the win: record it the one way outcomes are recorded.
  if (signature) {
    await recordBidOutcome(db, tenantId, {
      source: 'proposal',
      sourceId: proposalId,
      outcome: 'won',
      ourAmount: amount || undefined,
      projectName: proj?.name ? String(proj.name) : undefined,
    });
  }

  return { found: true, projectId, amount, contractUpdated: amount > 0 && Boolean(proj), budgetLinesSeeded };
}
