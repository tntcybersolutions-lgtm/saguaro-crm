/**
 * Measured takeoff — persist measured Conditions and the engine-computed estimate.
 * Uses the SAME shared lib/takeoff engine as iOS, so web and phone produce
 * byte-identical numbers. Deterministic; no AI in this path.
 */
import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { computeTakeoff, type Condition, type ComputeOpts, type RateOverrides, type Pt } from '@/lib/takeoff';
import { grossSF, lengthLF, calibrationSanity } from '@/lib/takeoff/measure';
import { learnTenantRates } from '@/lib/takeoff-learn';
import { hasFeature } from '@/lib/entitlements-server';
import { canSaveComplete } from '@/lib/takeoff-status';

export const runtime = 'nodejs';

const toDollars = (cents: number) => Math.round(cents) / 100;

/**
 * Multi-sheet tracing: a condition may carry the scale of the sheet it was traced on
 * (ppf), and/or a sheetId that resolves through body.sheetScales. Extra JSON fields ride
 * inside the stored `conditions` jsonb untouched, so no engine/type change is needed.
 */
type MeasuredCondition = Condition & { ppf?: number; sheetId?: string };

/**
 * Server-side calibration + geometry cross-check (data integrity). A bad plan scale silently
 * mis-prices the whole estimate, so the server re-checks it rather than trusting the client:
 *  - plausibility of the scale for the sheet size (calibrationSanity), and
 *  - each traced condition's stored value vs the value ITS OWN sheet's scale implies
 *    (condition.ppf ?? sheetScales[condition.sheetId] ?? the global pxPerFt) — checking every
 *    condition against one global scale threw false "check scale" warnings on multi-sheet takeoffs.
 * Returns a 0–100 confidence + human warnings (never blocks the save).
 */
function verifyCalibration(conditions: MeasuredCondition[], pxPerFt?: number, imgW?: number, imgH?: number, sheetScales?: Record<string, number>): { confidence: number; warnings: string[] } {
  const warnings: string[] = [];
  let confidence = 100;
  const hasPerSheetScale = (sheetScales != null && Object.values(sheetScales).some((v) => v > 0))
    || conditions.some((c) => (c.ppf ?? 0) > 0);
  if (pxPerFt && imgW && imgH) {
    const cs = calibrationSanity(pxPerFt, imgW, imgH);
    if (!cs.ok) { warnings.push(cs.warning || 'Plan scale looks implausible — re-calibrate.'); confidence -= 45; }
  } else if (!hasPerSheetScale) {
    confidence -= 15; // no scale metadata to verify against
  }
  for (const c of conditions) {
    // each condition is checked against the scale of the sheet it was traced on
    const ppf = (c.ppf && c.ppf > 0 ? c.ppf : undefined)
      ?? (c.sheetId && sheetScales && sheetScales[c.sheetId] > 0 ? sheetScales[c.sheetId] : undefined)
      ?? (pxPerFt && pxPerFt > 0 ? pxPerFt : undefined);
    if (!ppf) continue;
    const pts = c.points as Pt[] | undefined;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    const implied = c.kind === 'area' ? grossSF(pts, ppf) : c.kind === 'linear' ? lengthLF(pts, ppf) : 0;
    if (implied <= 0 || !(c.value > 0)) continue;
    const ratio = c.value / implied;
    // pitch/void/thickness can shift value modestly; a >2x or <0.5x gap signals a scale/entry error
    if (ratio > 2.2 || ratio < 0.45) {
      warnings.push(`"${c.name}": entered ${Math.round(c.value)} vs traced geometry ≈ ${Math.round(implied)} ${c.kind === 'area' ? 'SF' : 'LF'} — check scale/value.`);
      confidence -= 12;
    }
  }
  return { confidence: Math.max(0, Math.min(100, confidence)), warnings };
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  let body: { projectId?: string; name?: string; conditions?: MeasuredCondition[]; opts?: ComputeOpts; pxPerFt?: number; imgW?: number; imgH?: number; sheetScales?: Record<string, number> };
  try { body = await req.json(); } catch { return Response.json({ error: 'Invalid body' }, { status: 400 }); }
  const { projectId, name, conditions, opts, pxPerFt, imgW, imgH, sheetScales } = body;
  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 });
  if (!Array.isArray(conditions) || !conditions.length) return Response.json({ error: 'At least one condition required' }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServerClient() as any;
  // Validate the project belongs to the caller's tenant BEFORE persisting — otherwise a
  // takeoff could be attached to a foreign project_id (which later leaks that project's
  // name through the project-name lookups). Service-role bypasses RLS, so this is mandatory.
  const { data: ownProject } = await supabase.from('projects').select('id').eq('id', projectId).eq('tenant_id', user.tenantId).maybeSingle();
  if (!ownProject) return Response.json({ error: 'Project not found' }, { status: 404 });
  // price with THIS GC's learned/manual rates
  const { data: rateRows } = await supabase.from('cost_rates').select('cost_key,material_cents').eq('tenant_id', user.tenantId);
  const rates: RateOverrides = {};
  for (const rr of rateRows || []) rates[rr.cost_key] = rr.material_cents;
  // Win/loss competitive pricing — OFF unless this tenant has the entitlement flag
  // (fail-closed). When off, applyWinFactors=false → engine pricing is byte-identical.
  const applyWinFactors = await hasFeature(user.tenantId, 'win_loss_pricing');
  const winFactorByDivision: Record<string, number> = {};
  if (applyWinFactors) {
    const { data: wfRows } = await supabase.from('trade_win_factors').select('csi_division,suggested_multiplier').eq('tenant_id', user.tenantId);
    for (const w of wfRows || []) if (w.csi_division) winFactorByDivision[String(w.csi_division)] = Number(w.suggested_multiplier) || 1;
  }
  const r = computeTakeoff(conditions, { ...(opts || {}), rates, applyWinFactors, winFactorByDivision });

  // server-side calibration integrity check (never trusts the client scale blindly) —
  // each condition verifies against ITS sheet's scale (ppf / sheetScales), not one global
  const cal = verifyCalibration(conditions, pxPerFt, imgW, imgH, sheetScales);

  // Saved as complete only with something measured in it (lib/takeoff-status).
  const canSave = canSaveComplete(r.lines.length);
  if (!canSave.ok) return Response.json({ error: canSave.message }, { status: 400 });

  const { data: takeoff, error: tErr } = await supabase.from('takeoffs').insert({
    project_id: projectId, tenant_id: user.tenantId, name: name || 'Measured takeoff',
    project_name_detected: name || 'Measured takeoff', status: 'complete', conditions,
    material_cost: toDollars(r.materialCents), labor_cost: toDollars(r.laborCents), total_cost: toDollars(r.subtotalCents),
    subtotal: toDollars(r.subtotalCents), overhead_pct: opts?.overheadPct ?? 0, profit_pct: opts?.profitPct ?? 0,
    contingency_pct: opts?.contingencyPct ?? 0, total_overhead: toDollars(r.overheadCents), total_profit: toDollars(r.profitCents),
    sales_tax_pct: opts?.salesTaxPct ?? 0, labor_burden_pct: opts?.laborBurdenPct ?? 0,
    general_conditions_pct: opts?.generalConditionsPct ?? 0, bond_pct: opts?.bondPct ?? 0,
    region_multiplier: opts?.regionMultiplier ?? null, region_label: opts?.regionLabel ?? null,
    // full markup-stack breakdown on the header — equipment/sub direct buckets + the
    // contingency AMOUNT (contingency_pct alone loses the number the engine computed)
    total_equipment: toDollars(r.equipmentCents), total_subcontractor: toDollars(r.subCents),
    total_contingency: toDollars(r.contingencyCents),
    px_per_ft: pxPerFt ?? null, scale_confidence: cal.confidence,
    sell_price: toDollars(r.sellCents), grand_total: toDollars(r.sellCents), created_by: user.id,
  }).select('id').single();
  if (tErr || !takeoff) { console.error('[takeoff/measured] create takeoff failed:', tErr); return Response.json({ error: 'Could not save this takeoff. Please try again.' }, { status: 500 }); }

  // Waste is applied ONCE — by the engine: l.qty === baseQty × (1 + waste%) and
  // l.materialCents === l.qty × unitRate. The takeoff_line_items columns adjusted_quantity /
  // total_material / total_labor / total_equipment / total_sub are GENERATED as
  //   quantity × (1 + waste_factor_pct/100) × unit_*_cost
  // so persisting the engine's wastePct here would RE-apply waste (a ~5–15% double-count).
  // Persist waste_factor_pct = 0 and the engine's already-waste-included qty; the generated
  // totals then reproduce the engine's cents EXACTLY. Per-unit costs are stored full-precision
  // (not rounded to whole cents) so quantity × unit_*_cost === the engine's extended cents to the
  // cent. The true waste% is kept in metadata for transparency — it no longer drives any math.
  const perUnit = (cents: number, qty: number) => (qty > 0 ? cents / qty / 100 : 0);
  const rows = r.lines.map((l, i) => ({
    takeoff_id: takeoff.id, project_id: projectId, tenant_id: user.tenantId,
    description: l.name, quantity: l.qty, unit: l.unit, waste_factor_pct: 0,
    unit_material_cost: perUnit(l.materialCents, l.qty),
    unit_labor_cost: perUnit(l.laborCents, l.qty),
    unit_equipment_cost: perUnit(l.equipmentCents ?? 0, l.qty),
    unit_sub_cost: perUnit(l.subCents ?? 0, l.qty),
    csi_code: l.csi, category: l.trade, cost_key: l.costKey, sort_order: i, manually_edited: false,
    competitive_factor: l.competitiveFactor ?? 1,
    metadata: { waste_pct: l.wastePct },
  }));
  const { error: lErr } = await supabase.from('takeoff_line_items').insert(rows);
  if (lErr) { console.error('[takeoff/measured] line-item insert failed:', lErr); return Response.json({ error: 'Saved the takeoff, but its line items could not be written. Please retry.', id: takeoff.id }, { status: 500 }); }

  // Close the learning loop: this measured takeoff's priced line items now teach the GC's
  // learned cost_rates (tenant-scoped, source:'learned', manual never clobbered). Non-fatal.
  try { await learnTenantRates(supabase, user.tenantId); }
  catch (e) { console.warn('[takeoff/measured] auto-learn skipped (non-fatal):', e instanceof Error ? e.message : e); }

  return Response.json({
    id: takeoff.id, lines: r.lines.length, sellCents: r.sellCents, sell: toDollars(r.sellCents),
    scaleConfidence: cal.confidence, calibrationWarnings: cal.warnings,
  });
}
