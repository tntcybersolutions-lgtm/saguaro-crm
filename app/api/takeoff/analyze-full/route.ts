/**
 * Full-blueprint takeoff — reads the ENTIRE plan set (every sheet) with Claude's
 * native multi-page PDF vision, extracts measurable conditions per sheet, maps
 * them onto our deterministic assemblies (+ direct lines for other scope), and
 * the shared lib/takeoff engine prices everything. Comprehensive + accurate +
 * traceable to the sheet — the thing that beats guess-only competitors.
 */
import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { ASSEMBLIES, ASSEMBLY_MENU, applyMarkupStack, explodeCondition, type ComputeOpts, type Condition, type LineItem, type RateOverrides } from '@/lib/takeoff';
import { canSaveComplete } from '@/lib/takeoff-status';

export const runtime = 'nodejs';
export const maxDuration = 300;

/* eslint-disable @typescript-eslint/no-explicit-any */
const toDollars = (cents: number) => Math.round(cents) / 100;
const CREW = 6500;

const SYSTEM = `You are a senior construction estimator producing a COMPLETE quantity takeoff from a full plan set. You will be shown EVERY sheet of a PDF. Read all of them — architectural, structural, MEP, schedules, details. Extract every measurable scope of work with real quantities from the dimensions, schedules, and scales on the sheets. Return ONLY raw JSON, no markdown.`;

function prompt() {
  const menu = ASSEMBLY_MENU.map((a) => `"${a.id}" (${a.kind}: ${a.name})`).join(', ');
  return `Review EVERY sheet in this plan set and build a comprehensive takeoff.

For scope that matches one of these ASSEMBLIES, return a CONDITION (we price it deterministically):
${menu}

Condition = {"name","kind":"area|linear|count","value":<measured qty>,"unit":"SF|LF|EA","heightFt":<if wall/partition>,"thicknessIn":<if slab/footing>,"assembly":"<one id above>","sheet":"<sheet no>","confidence":0-100}

For scope that fits NO assembly above (glazing, sitework, specialties, elevators, fireproofing, etc.), return a direct LINE:
Line = {"description","qty","unit","csi":"NN NN NN","trade","unitCost":<$ material per unit>,"laborHrs":<crew hrs per unit>,"sheet","confidence":0-100}

Also list the sheets you read. Return exactly:
{"project":"name or Unknown","type":"commercial|residential|industrial|...","gross_sf":<number>,"sheets":[{"n":"A-101","discipline":"Architectural"}],"conditions":[...],"lines":[...],"notes":["short rationale, and any sheets/areas of low confidence"]}

Be thorough — a real takeoff has many conditions across all trades. Put actual measured dimensions in each name/description.`;
}

function extractJson(raw: string): any {
  let c = raw.replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/\s*```\s*$/im, '').trim();
  try { return JSON.parse(c); } catch { /* */ }
  const s = c.indexOf('{'); if (s < 0) return null;
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = s; i < c.length; i++) {
    const ch = c[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  try { return JSON.parse(c.slice(s, end + 1)); } catch { return null; }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'AI not configured' }, { status: 200 });

  let body: { pdf?: string; projectId?: string; name?: string; save?: boolean; opts?: ComputeOpts };
  try { body = await req.json(); } catch { return Response.json({ error: 'Invalid body' }, { status: 400 }); }
  const { pdf, projectId } = body;
  if (!pdf) return Response.json({ error: 'PDF required' }, { status: 400 });
  const b64 = pdf.replace(/^data:application\/pdf;base64,/, '');

  let parsed: any;
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 8000, system: SYSTEM,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } } as any,
        { type: 'text', text: prompt() },
      ] }],
    });
    const text = (resp.content || []).filter((x: any) => x.type === 'text').map((x: any) => x.text).join('');
    parsed = extractJson(text);
  } catch (err: any) {
    console.error('[takeoff/analyze-full] blueprint read failed:', err);
    return Response.json({ error: 'The blueprint could not be read. Please try again or use a clearer PDF.' }, { status: 200 });
  }
  if (!parsed) return Response.json({ error: 'Could not parse the takeoff' }, { status: 200 });

  // map AI conditions → deterministic engine conditions
  const conditions: Condition[] = (parsed.conditions || [])
    .filter((c: any) => c && ASSEMBLIES[c.assembly] && +c.value > 0)
    .map((c: any) => ({
      id: Math.random().toString(36).slice(2, 9), name: String(c.name || ASSEMBLIES[c.assembly].name).slice(0, 120),
      kind: c.kind, value: +c.value, assemblyId: c.assembly,
      ...(c.heightFt > 0 ? { heightFt: +c.heightFt } : {}), ...(c.thicknessIn > 0 ? { thicknessIn: +c.thicknessIn } : {}),
      sheet: c.sheet ? String(c.sheet) : undefined,
    }));
  // price with THIS GC's learned/manual rates
  const supa = createServerClient() as any;
  const { data: rateRows } = await supa.from('cost_rates').select('cost_key,material_cents').eq('tenant_id', user.tenantId);
  const rates: RateOverrides = {};
  for (const rr of rateRows || []) rates[rr.cost_key] = rr.material_cents;
  const asmLines: LineItem[] = conditions.flatMap((c) => explodeCondition(c, CREW, rates));

  // direct AI lines for scope with no assembly
  const aiLines = (parsed.lines || [])
    .filter((l: any) => l && +l.qty > 0 && +l.unitCost >= 0)
    .map((l: any, i: number) => {
      const qty = Math.round(+l.qty * 100) / 100;
      const materialCents = Math.round(qty * +l.unitCost * 100);
      const laborHrs = Math.round((+l.laborHrs || 0) * qty * 100) / 100;
      const laborCents = Math.round(laborHrs * CREW);
      return { conditionId: `ai-${i}`, assemblyId: '', key: 'ai', name: String(l.description || 'Item').slice(0, 120), csi: String(l.csi || ''), trade: String(l.trade || 'Other'), qty, unit: String(l.unit || 'EA'), wastePct: 0, materialCents, laborHrs, laborCents, totalCents: materialCents + laborCents, source: 'measured' as const };
    });

  const allLines = [...asmLines, ...aiLines];
  let materialCents = 0, laborCents = 0, laborHrs = 0;
  const div = new Map<string, number>();
  for (const l of allLines) { materialCents += l.materialCents; laborCents += l.laborCents; laborHrs += l.laborHrs; div.set(l.trade, (div.get(l.trade) || 0) + l.totalCents); }
  const subtotalCents = materialCents + laborCents;
  // SELL_PRICE UNIFICATION — sell_price means ONE thing on every surface: the FULL
  // markup-stack sell (tax → burden → GC → overhead → contingency → fee → bond) from the
  // SAME applyMarkupStack the measured engine uses. Markup opts arrive exactly as on the
  // measured path (body.opts, client-supplied); when the AI path sends none, the engine
  // defaults (every pct 0) make sellCents === subtotalCents, so legacy callers see
  // identical numbers. `subtotal` stays the raw direct subtotal — both are stored.
  const opts: ComputeOpts = body.opts || {};
  const mk = applyMarkupStack({ materialCents, laborCents }, opts);
  const sellCents = mk.sellCents;

  // persist (create takeoff + line items) — only when asked; the review flow returns conditions unsaved
  let takeoffId: string | null = null;
  if (projectId && body.save) {
    // Saved as complete only with something measured in it (lib/takeoff-status).
    const canSave = canSaveComplete(allLines.length);
    if (!canSave.ok) return Response.json({ error: canSave.message }, { status: 400 });
    const supabase = supa;
    // The project must belong to the caller's tenant — never attach a takeoff to a foreign
    // project_id (service-role bypasses RLS, and a foreign id later leaks the project name).
    const { data: ownProj } = await supabase.from('projects').select('id').eq('id', projectId).eq('tenant_id', user.tenantId).maybeSingle();
    if (!ownProj) return Response.json({ error: 'Project not found' }, { status: 404 });
    const { data: tk, error: tkErr } = await supabase.from('takeoffs').insert({
      project_id: projectId, tenant_id: user.tenantId, name: body.name || parsed.project || 'Blueprint takeoff',
      project_name_detected: parsed.project || null, status: 'complete', conditions,
      material_cost: toDollars(materialCents), labor_cost: toDollars(laborCents), total_cost: toDollars(subtotalCents),
      // subtotal = raw direct cost; sell_price = the full markup-stack sell (see above).
      // The stack's pcts + amounts are persisted so export-xls reproduces the SAME number.
      subtotal: toDollars(subtotalCents), sell_price: toDollars(sellCents), grand_total: toDollars(sellCents),
      overhead_pct: opts.overheadPct ?? 0, profit_pct: opts.profitPct ?? 0, contingency_pct: opts.contingencyPct ?? 0,
      sales_tax_pct: opts.salesTaxPct ?? 0, labor_burden_pct: opts.laborBurdenPct ?? 0,
      general_conditions_pct: opts.generalConditionsPct ?? 0, bond_pct: opts.bondPct ?? 0,
      total_overhead: toDollars(mk.overheadCents), total_profit: toDollars(mk.profitCents),
      total_contingency: toDollars(mk.contingencyCents),
      // NOTE: the takeoffs table has no `sf` column (writing one made PostgREST reject the
      // whole insert, 500-ing every save) — gross floor area lives in `building_area`.
      building_area: parsed.gross_sf || null, created_by: user.id,
    }).select('id').single();
    // Surface a save failure instead of silently returning id:null (which reads as success)
    if (tkErr || !tk?.id) { console.error('[takeoff/analyze-full] save takeoff failed:', tkErr); return Response.json({ error: 'Could not save this takeoff. Please try again.' }, { status: 500 }); }
    takeoffId = tk.id;
    // Waste is applied ONCE by the engine (l.qty already includes it; l.materialCents === qty ×
    // unitRate). The generated columns total_material/total_labor/total_equipment/total_sub/
    // adjusted_quantity re-multiply by (1 + waste_factor_pct/100), so persisting the engine's
    // wastePct here would double-count waste. Persist 0 + the waste-included qty + full-precision
    // per-unit costs so the generated totals reproduce the engine's cents EXACTLY; keep the true
    // waste% in metadata for transparency. (AI direct lines carry wastePct 0 already.)
    const perUnit = (cents: number, qty: number) => (qty > 0 ? cents / qty / 100 : 0);
    const rows = allLines.map((l, i) => ({
      takeoff_id: takeoffId, project_id: projectId, tenant_id: user.tenantId,
      description: l.name, quantity: l.qty, unit: l.unit, waste_factor_pct: 0,
      unit_material_cost: perUnit(l.materialCents, l.qty),
      unit_labor_cost: perUnit(l.laborCents, l.qty),
      unit_equipment_cost: perUnit(l.equipmentCents ?? 0, l.qty),
      unit_sub_cost: perUnit(l.subCents ?? 0, l.qty),
      csi_code: l.csi, category: l.trade, cost_key: l.costKey || null, sort_order: i, manually_edited: false,
      metadata: { waste_pct: l.wastePct },
    }));
    const { error: liErr } = await supabase.from('takeoff_line_items').insert(rows);
    if (liErr) { console.error('[takeoff/analyze-full] line-item insert failed:', liErr); return Response.json({ error: 'Saved the takeoff, but its line items could not be written. Please retry.', id: takeoffId }, { status: 500 }); }
  }

  return Response.json({
    id: takeoffId, project: parsed.project, gross_sf: parsed.gross_sf,
    sheets: parsed.sheets || [], sheetCount: (parsed.sheets || []).length,
    conditionsList: conditions, // the mapped Condition[] — UI loads these for review/adjust → recompute
    conditions: conditions.length, directLines: aiLines.length, lineCount: allLines.length,
    material: toDollars(materialCents), labor: toDollars(laborCents), laborHrs: Math.round(laborHrs * 10) / 10,
    subtotal: toDollars(subtotalCents), sell: toDollars(sellCents),
    byDivision: [...div.entries()].map(([trade, cents]) => ({ trade, total: toDollars(cents) })).sort((a, b) => b.total - a.total),
    notes: parsed.notes || [],
  });
}
