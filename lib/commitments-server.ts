/**
 * lib/commitments-server.ts
 *
 * The I/O half of the commitment rollup: read every source document for a
 * project, recompute the budget lines through lib/commitments.ts, and write back
 * only the rows that actually changed.
 *
 * Called after every purchase-order and bill mutation. Recomputing the whole
 * project rather than nudging one row is deliberate — it costs three small
 * queries and it is the only approach that stays correct when a row is edited
 * by a path nobody thought of, including directly in the database.
 */

import { rollup, type BudgetLine, type SourceDoc, type RollupResult } from './commitments';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface RecomputeOutcome extends RollupResult {
  written: number;
  projectId: string;
}

/** Read the sources and compute — no writes. Used by the preview endpoint. */
export async function previewProject(db: Db, tenantId: string, projectId: string): Promise<RollupResult> {
  const [lineRes, poRes, billRes, invRes] = await Promise.all([
    db.from('budget_lines')
      .select('id, cost_code, division, description, original_budget, approved_changes, revised_budget, committed, actual, projected')
      .eq('tenant_id', tenantId).eq('project_id', projectId),
    db.from('purchase_orders')
      .select('id, cost_code, status, total, subtotal')
      .eq('tenant_id', tenantId).eq('project_id', projectId),
    db.from('bills')
      .select('id, cost_code, status, total, amount')
      .eq('tenant_id', tenantId).eq('project_id', projectId),
    db.from('invoices')
      .select('id, cost_code, status, total, amount')
      .eq('tenant_id', tenantId).eq('project_id', projectId),
  ]);

  for (const r of [lineRes, poRes, billRes, invRes]) if (r?.error) throw r.error;

  return rollup(
    (lineRes.data || []) as BudgetLine[],
    (poRes.data || []) as SourceDoc[],
    (billRes.data || []) as SourceDoc[],
    (invRes.data || []) as SourceDoc[],
  );
}

/**
 * Recompute and persist. Returns what changed.
 *
 * Only changed rows are written, so a no-op rollup after an unrelated save does
 * not churn updated_at on every budget line and make the audit trail useless.
 */
export async function recomputeProject(db: Db, tenantId: string, projectId: string): Promise<RecomputeOutcome> {
  const result = await previewProject(db, tenantId, projectId);

  /* Never wipe a project that has no source documents. Computing zero from zero
     is correct arithmetic and a destructive migration: a budget carrying
     hand-entered actuals from before this chain existed would lose them to the
     first PO anyone raised. The preview still shows what the derived figures
     would be, so adopting them stays a deliberate act. */
  if (result.noSourceDocuments) {
    return { ...result, written: 0, projectId };
  }

  const changed = result.updates.filter((u) => u.changed);

  for (const u of changed) {
    const { error } = await db.from('budget_lines')
      .update({
        committed: u.committed,
        actual: u.actual,
        projected: u.projected,
        variance: u.variance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', u.id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
  }

  return { ...result, written: changed.length, projectId };
}

/**
 * Fire-and-forget recompute for mutation routes.
 *
 * A rollup failure must not fail the save that triggered it: the purchase order
 * is real whether or not the budget column caught up, and rejecting the write
 * would lose the user's work over a reporting concern. The error is logged and
 * the next mutation — or the repair endpoint — corrects it, which is safe
 * precisely because the rollup is idempotent.
 */
export function recomputeAfter(db: Db, tenantId: string, projectId: string | null | undefined, scope: string): void {
  if (!projectId) return;
  void recomputeProject(db, tenantId, projectId).catch((e) => {
    console.error(`[commitments:${scope}] rollup failed for project ${projectId}`, e);
  });
}
