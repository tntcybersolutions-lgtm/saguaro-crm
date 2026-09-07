import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyTakeoffShareToken } from '@/lib/takeoff/share';
import { computeTakeoff, type Condition, type ComputeOpts, type RateOverrides } from '@/lib/takeoff';
import { buildEstimateReportHtml } from '@/lib/takeoff/estimate-report';

export const runtime = 'nodejs';

/**
 * GET /api/takeoff/share/[id]?t=&e=  → public, read-only estimate (token-gated, no auth).
 * Re-prices the stored conditions through the SAME deterministic engine (with the owning
 * tenant's cost rates) so the client sees byte-identical numbers, then renders the full
 * cinematic estimate deliverable. Returns { html, meta } for the public page to display.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const t = url.searchParams.get('t') || '';
  const e = Number(url.searchParams.get('e') || '0');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- takeoffs share cols not yet in generated DB types
  const supabase = createServerClient() as any;

  const { data, error } = await supabase
    .from('takeoffs')
    .select('id,name,project_id,tenant_id,conditions,building_area,overhead_pct,profit_pct,contingency_pct,sales_tax_pct,labor_burden_pct,general_conditions_pct,bond_pct,region_multiplier,region_label,updated_at,share_nonce,share_expires_at,accepted_at,accepted_by,contract_value')
    .eq('id', params.id)
    .single();
  if (error || !data) return Response.json({ error: 'Estimate not found' }, { status: 404 });

  // Verify against the CURRENT stored nonce (revoke = nonce cleared) and bind the URL's
  // expiry to the one stored on the row (a client can't extend its own link).
  const storedExp = data.share_expires_at ? Date.parse(data.share_expires_at) : 0;
  const valid =
    !!storedExp &&
    e === storedExp &&
    Date.now() <= storedExp &&
    verifyTakeoffShareToken(params.id, data.share_nonce, e, t);
  if (!valid) {
    return Response.json({ error: 'This estimate link is invalid, expired, or has been revoked.' }, { status: 403 });
  }

  const conditions: Condition[] = Array.isArray(data.conditions) ? data.conditions : [];
  if (!conditions.length) return Response.json({ error: 'This estimate has no measured conditions.' }, { status: 404 });

  // Re-price with the owning tenant's learned/manual rates → identical to what the GC saw.
  const { data: rateRows } = await supabase.from('cost_rates').select('cost_key,material_cents').eq('tenant_id', data.tenant_id);
  const rates: RateOverrides = {};
  for (const rr of rateRows || []) rates[rr.cost_key] = rr.material_cents;

  const opts: ComputeOpts = {
    overheadPct: data.overhead_pct ?? 0,
    profitPct: data.profit_pct ?? 0,
    contingencyPct: data.contingency_pct ?? 0,
    salesTaxPct: data.sales_tax_pct ?? 0,
    laborBurdenPct: data.labor_burden_pct ?? 0,
    generalConditionsPct: data.general_conditions_pct ?? 0,
    bondPct: data.bond_pct ?? 0,
    regionMultiplier: data.region_multiplier ?? undefined,
    regionLabel: data.region_label ?? undefined,
    rates,
  };
  const result = computeTakeoff(conditions, opts);

  // Company name from the owning tenant (best-effort — never fatal).
  let companyName = 'Saguaro Control Systems — Construction Management & Project Controls';
  try {
    const { data: tenant } = await supabase.from('tenants').select('name').eq('id', data.tenant_id).single();
    if (tenant?.name) companyName = tenant.name;
  } catch { /* keep default */ }

  let projectName = data.name || 'Measured Estimate';
  try {
    const { data: proj } = await supabase.from('projects').select('name').eq('id', data.project_id).single();
    if (proj?.name) projectName = proj.name;
  } catch { /* keep default */ }

  const html = buildEstimateReportHtml({
    project: { name: projectName, buildingSf: data.building_area || undefined },
    conditions,
    result,
    opts,
    company: { name: companyName, tagline: 'Control Every Project. Deliver Every Promise.' },
  });

  return Response.json({
    html,
    meta: {
      project: projectName,
      company: companyName,
      sell: Math.round(result.sellCents) / 100,
      lines: result.lines.length,
      expiresAt: new Date(storedExp).toISOString(),
      updatedAt: data.updated_at || null,
      acceptedAt: data.accepted_at || null,
      acceptedBy: data.accepted_by || null,
      contractValue: data.contract_value != null ? Number(data.contract_value) : null,
    },
  });
}

/**
 * POST /api/takeoff/share/[id]?t=&e=  → the CLIENT accepts the estimate (token-gated, no login).
 * Records a lightweight e-signature (typed name + timestamp + IP) and promotes the sell price to
 * the takeoff's contract value — closing the loop the view-only share left open. Idempotent-ish:
 * a second accept is rejected so the contract value can't be silently changed.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const t = url.searchParams.get('t') || '';
  const e = Number(url.searchParams.get('e') || '0');
  let body: { name?: string } = {};
  try { body = await req.json(); } catch { /* name optional */ }
  const name = String(body.name || '').trim().slice(0, 120);
  if (!name) return Response.json({ error: 'Please enter your name to accept.' }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- takeoffs share cols not yet in generated DB types
  const supabase = createServerClient() as any;
  const { data, error } = await supabase
    .from('takeoffs')
    .select('id,tenant_id,sell_price,share_nonce,share_expires_at,accepted_at')
    .eq('id', params.id)
    .single();
  if (error || !data) return Response.json({ error: 'Estimate not found' }, { status: 404 });

  const storedExp = data.share_expires_at ? Date.parse(data.share_expires_at) : 0;
  const valid = !!storedExp && e === storedExp && Date.now() <= storedExp && verifyTakeoffShareToken(params.id, data.share_nonce, e, t);
  if (!valid) return Response.json({ error: 'This estimate link is invalid, expired, or has been revoked.' }, { status: 403 });
  if (data.accepted_at) return Response.json({ error: 'This estimate has already been accepted.', acceptedAt: data.accepted_at }, { status: 409 });

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const contractValue = Number(data.sell_price) || 0;
  const { error: upErr } = await supabase
    .from('takeoffs')
    .update({ accepted_at: new Date().toISOString(), accepted_by: name, accepted_ip: ip, contract_value: contractValue })
    .eq('id', params.id)
    .eq('tenant_id', data.tenant_id);
  if (upErr) return Response.json({ error: 'Could not record acceptance' }, { status: 500 });

  return Response.json({ accepted: true, acceptedBy: name, contractValue });
}
