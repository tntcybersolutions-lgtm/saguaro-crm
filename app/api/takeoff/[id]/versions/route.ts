/**
 * Takeoff version chain — revisions & addenda.
 *   GET  → the full chain (root + every revision), newest first, with sell + accept state.
 *   POST → clone this takeoff as a NEW revision (or addendum) linked into the chain; the old
 *          one is marked superseded. Conditions + the full ComputeOpts carry over, re-priced
 *          through the shared engine so the new rev is immediately editable and consistent.
 */
import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { computeTakeoff, type Condition, type ComputeOpts, type RateOverrides } from '@/lib/takeoff';
import { must } from '@/lib/db-write';

export const runtime = 'nodejs';
const toDollars = (cents: number) => Math.round(cents) / 100;

const VERSION_COLS = 'id,name,rev_label,is_addendum,superseded,parent_takeoff_id,root_takeoff_id,sell_price,contract_value,accepted_at,accepted_by,created_at';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req).catch(() => null);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- version cols not in generated types
  const supabase = createServerClient() as any;

  const { data: self, error } = await supabase.from('takeoffs').select('id, root_takeoff_id').eq('id', id).eq('tenant_id', user.tenantId).single();
  if (error || !self) return Response.json({ error: 'Takeoff not found' }, { status: 404 });
  const root = self.root_takeoff_id || self.id;

  const { data: chain } = await supabase
    .from('takeoffs')
    .select(VERSION_COLS)
    .eq('tenant_id', user.tenantId)
    .or(`id.eq.${root},root_takeoff_id.eq.${root}`)
    .order('created_at', { ascending: false });

  return Response.json({ root, versions: chain || [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const { id } = await params;
  let body: { revLabel?: string; isAddendum?: boolean } = {};
  try { body = await req.json(); } catch { /* optional body */ }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- version cols not in generated types
  const supabase = createServerClient() as any;

  const { data: src, error } = await supabase.from('takeoffs').select('*').eq('id', id).eq('tenant_id', user.tenantId).single();
  if (error || !src) return Response.json({ error: 'Takeoff not found' }, { status: 404 });

  const conditions: Condition[] = Array.isArray(src.conditions) ? src.conditions : [];
  if (!conditions.length) return Response.json({ error: 'Nothing to revise — this takeoff has no conditions.' }, { status: 400 });
  const root = src.root_takeoff_id || src.id;

  // re-price with the tenant's rates + the source's stored ComputeOpts
  const { data: rateRows } = await supabase.from('cost_rates').select('cost_key,material_cents').eq('tenant_id', user.tenantId);
  const rates: RateOverrides = {};
  for (const rr of rateRows || []) rates[rr.cost_key] = rr.material_cents;
  const opts: ComputeOpts = {
    overheadPct: src.overhead_pct ?? 0, profitPct: src.profit_pct ?? 0, contingencyPct: src.contingency_pct ?? 0,
    salesTaxPct: src.sales_tax_pct ?? 0, laborBurdenPct: src.labor_burden_pct ?? 0,
    generalConditionsPct: src.general_conditions_pct ?? 0, bondPct: src.bond_pct ?? 0,
    regionMultiplier: src.region_multiplier ?? undefined, regionLabel: src.region_label ?? undefined, rates,
  };
  const r = computeTakeoff(conditions, opts);

  // count existing revisions for a sensible default label
  const { count } = await supabase.from('takeoffs').select('id', { count: 'exact', head: true }).eq('tenant_id', user.tenantId).or(`id.eq.${root},root_takeoff_id.eq.${root}`);
  const revLabel = (body.revLabel && String(body.revLabel).slice(0, 60)) || (body.isAddendum ? `Addendum ${count || 1}` : `Rev ${String.fromCharCode(65 + (count || 1))}`);

  const { data: rev, error: insErr } = await supabase.from('takeoffs').insert({
    project_id: src.project_id, tenant_id: user.tenantId, name: src.name || 'Measured takeoff',
    project_name_detected: src.name || 'Measured takeoff', status: 'complete', conditions,
    material_cost: toDollars(r.materialCents), labor_cost: toDollars(r.laborCents), total_cost: toDollars(r.subtotalCents),
    subtotal: toDollars(r.subtotalCents), overhead_pct: opts.overheadPct, profit_pct: opts.profitPct, contingency_pct: opts.contingencyPct,
    sales_tax_pct: opts.salesTaxPct, labor_burden_pct: opts.laborBurdenPct, general_conditions_pct: opts.generalConditionsPct, bond_pct: opts.bondPct,
    region_multiplier: opts.regionMultiplier ?? null, region_label: opts.regionLabel ?? null,
    total_overhead: toDollars(r.overheadCents), total_profit: toDollars(r.profitCents),
    sell_price: toDollars(r.sellCents), grand_total: toDollars(r.sellCents), created_by: user.id,
    root_takeoff_id: root, parent_takeoff_id: src.id, rev_label: revLabel, is_addendum: !!body.isAddendum, superseded: false,
  }).select('id').single();
  if (insErr || !rev) { console.error('[takeoff/versions] create revision failed:', insErr); return Response.json({ error: 'Could not create the revision. Please try again.' }, { status: 500 }); }

  // Waste is applied ONCE by the engine (l.qty already includes it; l.materialCents === qty ×
  // unitRate). The generated columns total_material/total_labor/total_equipment/total_sub/
  // adjusted_quantity re-multiply by (1 + waste_factor_pct/100), so persisting the engine's
  // wastePct here would double-count waste. Persist 0 + the waste-included qty + full-precision
  // per-unit costs so the generated totals reproduce the engine's cents EXACTLY; keep the true
  // waste% in metadata for transparency.
  const perUnit = (cents: number, qty: number) => (qty > 0 ? cents / qty / 100 : 0);
  const rows = r.lines.map((l, i) => ({
    takeoff_id: rev.id, project_id: src.project_id, tenant_id: user.tenantId,
    description: l.name, quantity: l.qty, unit: l.unit, waste_factor_pct: 0,
    unit_material_cost: perUnit(l.materialCents, l.qty),
    unit_labor_cost: perUnit(l.laborCents, l.qty),
    unit_equipment_cost: perUnit(l.equipmentCents ?? 0, l.qty),
    unit_sub_cost: perUnit(l.subCents ?? 0, l.qty),
    csi_code: l.csi, category: l.trade, cost_key: l.costKey, sort_order: i, manually_edited: false,
    metadata: { waste_pct: l.wastePct },
  }));
  const { error: revLineErr } = await supabase.from('takeoff_line_items').insert(rows);
  // If the revision's line items failed, do NOT supersede the source — otherwise a good
  // takeoff gets hidden behind an empty revision (silent data loss). Surface a clean error.
  if (revLineErr) {
    console.error('[takeoff/versions] revision line-item insert failed:', revLineErr);
    return Response.json({ error: 'The revision was started but its line items could not be written — the original estimate is unchanged. Please retry.', id: rev.id }, { status: 500 });
  }

  // mark the source (and root, if this is the first branch) as superseded — the new rev is current
  await must(supabase.from('takeoffs').update({ superseded: true }).eq('id', src.id).eq('tenant_id', user.tenantId), 'takeoffs update');
  // ensure the root row carries its own root_takeoff_id for chain queries
  if (!src.root_takeoff_id) await must(supabase.from('takeoffs').update({ root_takeoff_id: root }).eq('id', src.id).eq('tenant_id', user.tenantId), 'takeoffs update');

  return Response.json({ id: rev.id, revLabel, root, sell: toDollars(r.sellCents), lines: r.lines.length });
}
