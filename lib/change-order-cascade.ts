/**
 * lib/change-order-cascade.ts — what an approved change order does to a job's
 * money, applied one way by every route that changes a change order.
 *
 * An approved CO moves three things:
 *   1. the job's contract — projects.contract_amount and
 *      revised_contract_value (the figure the Budget screen, the job picker
 *      and the job list read first) = original + approved COs;
 *   2. the prime contract's approved_changes;
 *   3. the budget — budget_lines.approved_changes, which every revised-budget
 *      reader adds to original_budget (lib/budget-line).
 *
 * What it used to do, and why it was wrong:
 *   - contract_amount += amount on every call. Approve twice, count it twice;
 *     reject an approved CO, it never came back off. revised_contract_value
 *     was never touched, so the Budget screen kept the pre-CO contract.
 *   - the budget write went to budget_lines.COMMITTED (the subcontract cost
 *     side), never approved_changes — and only when the CO had a bid package.
 *     On Pima the budget's approved changes ($127,650) only matched the
 *     approved COs because the rows were seeded that way.
 *   - only POST /approve ran it. The approvals inbox, a status edit and a
 *     reject left the money where it was.
 *
 * Now the contract figures are RECOMPUTED from the approved COs on the job
 * (lib/job-contract — the same rule the GC's screens and the owner's portal
 * read), so running this twice changes nothing. The budget gets the CO on its
 * cost code's line when the CO names one (through its bid package) and the
 * rest lands on one "unallocated change orders" line, kept so that the budget's
 * approved changes always add up to the approved change orders.
 */
import { coAmount } from './change-order-amount';
import { approvedChangeTotal, isApprovedCoStatus, originalContract } from './job-contract';

/** The budget line that holds approved change orders not yet put on a cost code. */
export const UNALLOCATED_CO_CODE = 'CO-UNALLOCATED';

type CoRow = {
  id?: string | null;
  project_id?: string | null;
  tenant_id?: string | null;
  status?: string | null;
  amount?: unknown;
  cost_impact?: unknown;
  related_bid_package_id?: string | null;
  deleted_at?: string | null;
};

const N = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The dollars a CO row contributes to the approved total (0 unless approved and live). */
export function approvedValue(co: CoRow | null | undefined): number {
  if (!co || co.deleted_at || !isApprovedCoStatus(co.status)) return 0;
  return coAmount(co);
}

/**
 * Re-derive the job's contract figures and the prime contract's approved
 * changes from the approved COs. `approvedDelta` is how much THIS write moved
 * the approved total: the original contract is read as it stood before the
 * write, because a job that keeps no original column derives it from
 * contract_amount less the approved COs — and contract_amount has not moved
 * yet. Once derived, the original is pinned to original_contract_amount so
 * every later sync reads the same figure.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncJobContract(db: any, tenantId: string, projectId: string, approvedDelta = 0): Promise<{ original: number; approved: number; revised: number }> {
  const [{ data: project, error: pErr }, { data: cos, error: cErr }, { data: prime, error: prErr }] = await Promise.all([
    db.from('projects')
      .select('id, original_contract_amount, original_contract_value, original_contract, revised_contract_value, contract_amount, contract_value')
      .eq('id', projectId).eq('tenant_id', tenantId).maybeSingle(),
    db.from('change_orders').select('status, amount, cost_impact, deleted_at')
      .eq('project_id', projectId).eq('tenant_id', tenantId).is('deleted_at', null),
    db.from('contracts').select('id, original_amount, contract_amount, amount, approved_changes')
      .eq('project_id', projectId).eq('tenant_id', tenantId).eq('contract_type', 'prime').limit(1).maybeSingle(),
  ]);
  if (pErr) throw pErr;
  if (cErr) throw cErr;
  if (prErr) throw prErr;
  if (!project) throw new Error('change-order cascade: project not found');

  const approved = r2(approvedChangeTotal((cos || []) as CoRow[]));
  const original = r2(originalContract(project, approved - approvedDelta, { prime }));
  const revised = r2(original + approved);

  const patch: Record<string, number> = {};
  if (N(project.contract_amount) !== revised) patch.contract_amount = revised;
  if (N(project.revised_contract_value) !== revised) patch.revised_contract_value = revised;
  const storedOriginal = N(project.original_contract_amount) || N(project.original_contract_value) || N(project.original_contract);
  if (storedOriginal <= 0 && original > 0) patch.original_contract_amount = original;
  if (Object.keys(patch).length) {
    const { error } = await db.from('projects').update(patch).eq('id', projectId).eq('tenant_id', tenantId);
    if (error) throw error;
  }
  if (prime && N(prime.approved_changes) !== approved) {
    const { error } = await db.from('contracts').update({ approved_changes: approved })
      .eq('id', prime.id).eq('tenant_id', tenantId);
    if (error) throw error;
  }
  return { original, approved, revised };
}

/** The budget line a CO's bid package points at, by cost code then division. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function coBudgetLine(db: any, tenantId: string, projectId: string, co: CoRow): Promise<{ id: string; original_budget: unknown; approved_changes: unknown } | null> {
  if (!co.related_bid_package_id) return null;
  const { data: pkg, error: pkgErr } = await db.from('bid_packages').select('csi_codes, csi_division')
    .eq('id', co.related_bid_package_id).eq('tenant_id', tenantId).maybeSingle();
  if (pkgErr) throw pkgErr;
  const code: string | null = (pkg?.csi_codes?.[0] as string | undefined) || pkg?.csi_division || null;
  if (!code) return null;
  const div = String(code).slice(0, 2);
  const { data: lines, error } = await db.from('budget_lines').select('id, cost_code, division, original_budget, approved_changes')
    .eq('project_id', projectId).eq('tenant_id', tenantId).neq('cost_code', UNALLOCATED_CO_CODE);
  if (error) throw error;
  const list = (lines || []) as Array<{ id: string; cost_code: string | null; division: string | null; original_budget: unknown; approved_changes: unknown }>;
  return list.find((l) => String(l.cost_code || '') === String(code))
    || list.find((l) => String(l.division || '') === div)
    || null;
}

/**
 * Keep the budget's approved changes equal to the approved COs. `co` + `delta`
 * place THIS write's change on the CO's own cost-code line when it has one;
 * whatever approved total no line carries goes on the unallocated line.
 * A job with no budget yet gets no line made for it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncCoBudget(db: any, tenantId: string, projectId: string, approved: number, co?: CoRow | null, delta = 0): Promise<void> {
  if (co && delta !== 0) {
    const line = await coBudgetLine(db, tenantId, projectId, co);
    if (line) {
      const ac = r2(N(line.approved_changes) + delta);
      const { error } = await db.from('budget_lines')
        .update({ approved_changes: ac, revised_budget: r2(N(line.original_budget) + ac) })
        .eq('id', line.id).eq('tenant_id', tenantId);
      if (error) throw error;
    }
  }
  const { data: lines, error } = await db.from('budget_lines').select('id, cost_code, original_budget, approved_changes')
    .eq('project_id', projectId).eq('tenant_id', tenantId);
  if (error) throw error;
  const all = (lines || []) as Array<{ id: string; cost_code: string | null; original_budget: unknown; approved_changes: unknown }>;
  const unalloc = all.find((l) => l.cost_code === UNALLOCATED_CO_CODE) || null;
  const others = all.filter((l) => l !== unalloc);
  if (others.length === 0) return;
  const allocated = others.reduce((s, l) => s + N(l.approved_changes), 0);
  // Never a counter-entry against figures the GC typed on a line: the
  // unallocated line only ever carries approved COs nobody has placed yet.
  const gap = r2(approved - allocated);
  const target = approved >= 0 ? Math.max(0, gap) : Math.min(0, gap);
  if (unalloc) {
    if (N(unalloc.approved_changes) !== target) {
      const { error: uErr } = await db.from('budget_lines')
        .update({ approved_changes: target, revised_budget: r2(N(unalloc.original_budget) + target) })
        .eq('id', unalloc.id).eq('tenant_id', tenantId);
      if (uErr) throw uErr;
    }
  } else if (target !== 0) {
    const { error: iErr } = await db.from('budget_lines').insert({
      tenant_id: tenantId,
      project_id: projectId,
      cost_code: UNALLOCATED_CO_CODE,
      description: 'Approved change orders — not yet assigned to a cost code',
      category: 'other',
      original_budget: 0,
      approved_changes: target,
      revised_budget: target,
      committed: 0,
      actual: 0,
      notes: 'Kept by Saguaro: approved change orders that no budget line carries yet. Move them onto a cost code and this line shrinks.',
    });
    if (iErr) throw iErr;
  }
}

/**
 * Apply one change-order write to the job's money. `before` / `after` are the
 * row as it was and as it is (null for a create / a delete). Safe to call on
 * any write: when the approved value did not move it only re-checks.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function applyChangeOrderMoney(db: any, tenantId: string, before: CoRow | null, after: CoRow | null): Promise<{ delta: number }> {
  const projectId = String(after?.project_id || before?.project_id || '');
  if (!projectId) return { delta: 0 };
  const delta = r2(approvedValue(after) - approvedValue(before));
  const { approved } = await syncJobContract(db, tenantId, projectId, delta);
  await syncCoBudget(db, tenantId, projectId, approved, after || before, delta);
  return { delta };
}
