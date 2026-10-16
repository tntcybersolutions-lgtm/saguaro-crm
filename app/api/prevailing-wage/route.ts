import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { toCents, toDollars, addCents } from '@/lib/calc';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/prevailing-wage
 *
 * Reference lookup over the `wage_determinations` table (Davis-Bacon / state
 * prevailing-wage rate schedules). Powers the Prevailing Wage Calculator and
 * is the rate source the Certified Payroll (WH-347) page pulls from.
 *
 * These rows are reference data: the seed set is tenant-agnostic (tenant_id
 * NULL), so reads never require a tenant. When the caller IS authenticated we
 * ALSO surface that tenant's own custom determinations (tenant_id = theirs),
 * and those override a seed row of the same state/county/determination/class.
 *
 * Query params (all optional):
 *   state          two-letter state code — scopes the whole response
 *   county         filter to a county (statewide rows, county NULL, always kept)
 *   determination  filter to a specific determination_number
 *   effectiveDate  keep only determinations effective on/before this ISO date
 *   classification when set, returns a single best `match` (for WH-347 lookup)
 *
 * Response:
 *   {
 *     states: string[],                        // every state with data
 *     state, counties: string[],               // counties available in `state`
 *     determinations: [{ determination_number, effective_date, county }],
 *     rates: [{ id, state, county, determination_number, effective_date,
 *               classification, base, fringe, total, custom }],
 *     match?: { classification, base, fringe, total, ... } | null
 *   }
 */

type Row = {
  id: string;
  tenant_id: string | null;
  state: string;
  county: string | null;
  determination_number: string | null;
  effective_date: string | null;
  classification: string;
  base_rate: number;
  fringe_rate: number;
};

function total(base: number, fringe: number): number {
  return toDollars(addCents(toCents(base), toCents(fringe)));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const state = (searchParams.get('state') || '').trim().toUpperCase();
  const county = (searchParams.get('county') || '').trim();
  const determination = (searchParams.get('determination') || '').trim();
  const effectiveDate = (searchParams.get('effectiveDate') || '').trim();
  const classification = (searchParams.get('classification') || '').trim();

  try {
    const db = createServerClient();

    // Reference reads are tenant-agnostic; if the request is authenticated we
    // additionally include that tenant's custom rows. Never hard-fail on auth
    // here — the seed schedule must always be readable.
    const user = await getUser(req);
    const tenantId = user?.tenantId ?? null;

    // Pull seed rows (tenant_id IS NULL) OR this tenant's custom rows.
    let q = db
      .from('wage_determinations')
      .select(
        'id, tenant_id, state, county, determination_number, effective_date, classification, base_rate, fringe_rate',
      );
    if (tenantId) {
      q = q.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
    } else {
      q = q.is('tenant_id', null);
    }
    if (state) q = q.eq('state', state);

    const { data, error } = await q;
    if (error) throw error;
    let rows = (data || []) as Row[];

    // Distinct states across the full (state-unfiltered would be ideal, but we
    // scoped to `state` for size). Fetch the state list separately so the page
    // can populate its State dropdown from any single call.
    const { data: stateData } = await db
      .from('wage_determinations')
      .select('state')
      .is('tenant_id', null);
    const states = Array.from(
      new Set(((stateData || []) as { state: string }[]).map((r) => r.state)),
    ).sort();

    // County filter: exact county OR statewide (county NULL) fallback rows.
    if (county) {
      rows = rows.filter((r) => (r.county || '') === county || r.county == null);
    }
    if (determination) {
      rows = rows.filter((r) => (r.determination_number || '') === determination);
    }
    if (effectiveDate) {
      rows = rows.filter((r) => !r.effective_date || r.effective_date <= effectiveDate);
    }

    // Tenant custom rows win over a seed row for the same
    // state/county/determination/classification key.
    const byKey = new Map<string, Row>();
    for (const r of rows) {
      const key = [r.state, r.county || '', r.determination_number || '', r.classification].join('|');
      const existing = byKey.get(key);
      if (!existing || (r.tenant_id && !existing.tenant_id)) byKey.set(key, r);
    }
    const deduped = Array.from(byKey.values());

    const counties = Array.from(
      new Set(deduped.map((r) => r.county).filter((c): c is string => !!c)),
    ).sort();

    const detMap = new Map<string, { determination_number: string; effective_date: string | null; county: string | null }>();
    for (const r of deduped) {
      if (!r.determination_number) continue;
      const k = r.determination_number + '|' + (r.county || '');
      if (!detMap.has(k)) {
        detMap.set(k, {
          determination_number: r.determination_number,
          effective_date: r.effective_date,
          county: r.county,
        });
      }
    }
    const determinations = Array.from(detMap.values()).sort((a, b) =>
      (b.effective_date || '').localeCompare(a.effective_date || ''),
    );

    const rates = deduped
      .map((r) => ({
        id: r.id,
        state: r.state,
        county: r.county,
        determination_number: r.determination_number,
        effective_date: r.effective_date,
        classification: r.classification,
        base: r.base_rate,
        fringe: r.fringe_rate,
        total: total(r.base_rate, r.fringe_rate),
        custom: !!r.tenant_id,
      }))
      .sort((a, b) => a.classification.localeCompare(b.classification));

    // WH-347 helper: resolve one classification to its prevailing base+fringe.
    let match: (typeof rates)[number] | null = null;
    if (classification) {
      const wanted = classification.toLowerCase();
      match =
        rates.find((r) => r.classification.toLowerCase() === wanted) ||
        rates.find((r) => r.classification.toLowerCase().includes(wanted)) ||
        rates.find((r) => wanted.includes(r.classification.toLowerCase())) ||
        null;
    }

    // Honesty: the tenant-agnostic seed schedule is realistic *sample/reference*
    // data (Davis-Bacon-style), NOT an authoritative wage determination — it must
    // be verified against the official SAM.gov / WDOL determination before it is
    // relied on for a certified payroll. Rows the tenant entered themselves
    // (custom === true) are their real determination and are authoritative for
    // that tenant. Report the source accordingly instead of claiming 'live'.
    const anySample = rates.some((r) => !r.custom);
    const anyCustom = rates.some((r) => r.custom);
    const source: 'sample' | 'custom' = anySample || rates.length === 0 ? 'sample' : 'custom';
    const disclaimer =
      'These are SAMPLE/REFERENCE prevailing-wage rates for estimating and planning only — they are NOT an official wage determination. Verify against the official determination on SAM.gov (System for Award Management / WDOL) for the exact project, county and decision number before certifying payroll. Rates marked CUSTOM are your own tenant-entered determination and override the sample schedule.';

    return NextResponse.json({
      states,
      state: state || null,
      counties,
      determinations,
      rates,
      match,
      // 'sample' = shared reference schedule present; 'custom' = only this
      // tenant's own determinations were returned.
      source,
      sampleData: anySample,
      hasCustom: anyCustom,
      disclaimer,
    });
  } catch (err) {
    return apiError('prevailing-wage GET', err, "Failed to load prevailing wage data.", 500, { states: [], counties: [], determinations: [], rates: [], match: null, source: 'error' });
  }
}
