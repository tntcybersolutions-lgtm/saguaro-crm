/**
 * lib/budget-seed.ts — start a won job's budget from its takeoff.
 *
 * When a proposal is accepted (lib/proposal-accept) and the job has no budget
 * lines yet, the latest completed takeoff's cost is rolled up by CSI division
 * into budget lines: "03 00 00 Concrete — $412,300" and so on. That is the
 * job's cost before markup, the number the budget tracks bills and
 * commitments against. A job that already has any budget line is never touched.
 *
 * Lines come from the same two write paths the takeoff detail route reads
 * (app/api/takeoff/[id]): the AI blueprint takeoff writes takeoff_materials
 * (total_cost per line); a measured takeoff writes takeoff_line_items
 * (material + labor + equipment + sub, excluded lines left out).
 *
 * Service-role client bypasses RLS → every query is explicitly tenant-scoped.
 */
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';
import { takeoffItemCounts } from '@/lib/takeoff-status';

/** One priced takeoff line, from either table. `cost` is dollars (numerics arrive as strings). */
export type CostLine = {
  csi_division: string | null;
  csi_code: string | null;
  cost: unknown;
  excluded?: boolean | null;
};

/** Two-digit CSI division of a takeoff line ("03", "26"), or null. */
export function divisionOf(line: Pick<CostLine, 'csi_division' | 'csi_code'>): string | null {
  const m = String(line.csi_division || line.csi_code || '').match(/\d{2}/);
  return m ? m[0] : null;
}

/** Cost per division, in whole cents, sorted by division. Pure. */
export function rollUpByDivision(lines: CostLine[]): Array<{ division: string; cents: number }> {
  const byDiv = new Map<string, number>();
  for (const l of lines) {
    if (l.excluded) continue;
    const div = divisionOf(l);
    if (!div) continue;
    const cents = Math.round((Number(l.cost) || 0) * 100);
    if (cents <= 0) continue;
    byDiv.set(div, (byDiv.get(div) || 0) + cents);
  }
  return [...byDiv.entries()].map(([division, cents]) => ({ division, cents })).sort((a, b) => a.division.localeCompare(b.division));
}

/** Returns how many budget lines were created (0 when the job already had a budget or has no takeoff). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seedBudgetFromTakeoff(db: any, tenantId: string, projectId: string): Promise<number> {
  const { count, error: cErr } = await db
    .from('budget_lines')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId);
  if (cErr) throw cErr;
  if ((count || 0) > 0) return 0;

  const { data: takeoffs, error: tErr } = await db
    .from('takeoffs')
    .select('id')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .eq('status', 'complete')
    .is('deleted_at', null)
    .or('superseded.is.null,superseded.eq.false')
    .order('created_at', { ascending: false })
    .limit(10);
  if (tErr) throw tErr;
  // The newest complete takeoff with something measured in it (lib/takeoff-status).
  const counts = await takeoffItemCounts(db, tenantId, (takeoffs || []).map((t: { id: string }) => t.id));
  const takeoffId = (takeoffs || []).find((t: { id: string }) => (counts[t.id] ?? 0) > 0)?.id;
  if (!takeoffId) return 0;

  const { data: mats, error: mErr } = await db
    .from('takeoff_materials')
    .select('csi_division, csi_code, total_cost')
    .eq('takeoff_id', takeoffId)
    .eq('tenant_id', tenantId);
  if (mErr) throw mErr;
  let lines: CostLine[] = ((mats || []) as Array<{ csi_division: string | null; csi_code: string | null; total_cost: unknown }>)
    .map((m) => ({ csi_division: m.csi_division, csi_code: m.csi_code, cost: m.total_cost }));
  if (!lines.length) {
    const { data: li, error: lErr } = await db
      .from('takeoff_line_items')
      .select('csi_division, csi_code, total_material, total_labor, total_equipment, total_sub, is_excluded')
      .eq('takeoff_id', takeoffId)
      .eq('tenant_id', tenantId);
    if (lErr) throw lErr;
    lines = ((li || []) as Array<Record<string, unknown>>).map((l) => ({
      csi_division: (l.csi_division as string | null) ?? null,
      csi_code: (l.csi_code as string | null) ?? null,
      cost: (Number(l.total_material) || 0) + (Number(l.total_labor) || 0) + (Number(l.total_equipment) || 0) + (Number(l.total_sub) || 0),
      excluded: Boolean(l.is_excluded),
    }));
  }

  const rows = rollUpByDivision(lines).map((d, i) => {
    const dollars = d.cents / 100;
    return {
      tenant_id: tenantId,
      project_id: projectId,
      cost_code: `${d.division} 00 00`,
      division: d.division,
      description: CSI_DIVISIONS[d.division]?.name || `Division ${d.division}`,
      category: 'Takeoff',
      original_budget: dollars,
      revised_budget: dollars,
      notes: 'Started from the takeoff when the proposal was accepted.',
      sort_order: i,
    };
  });
  if (!rows.length) return 0;
  const { error: iErr } = await db.from('budget_lines').insert(rows);
  if (iErr) throw iErr;
  return rows.length;
}
