import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { aiLimiter } from '@/lib/rate-limit';
import { must, tryWrite } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';
import { levelBids, type ScopeLine, type Bidder, type BidderScopeItem, type ScopeStatus } from '@/lib/bidleveling';
import { extractJson, messageText, JSON_ONLY } from '@/lib/ai-json';

/**
 * POST /api/bid-packages/[id]/leveling/analyze — read the bids, find the gaps.
 *
 * A subcontractor's exclusions arrive as prose: "excludes trenching and backfill
 * beyond 5ft of the building line, fire caulking by others". Levelling means
 * turning that sentence into "line 4 excluded, line 11 excluded" and pricing
 * what is missing. That reading is the slow part of a GC's day and the part
 * they most often skip when three bids land an hour before the deadline.
 *
 * WHAT THIS DOES NOT DO: the arithmetic. lib/bidleveling already holds a
 * deterministic engine — leveled totals, required-coverage percentage, risk
 * score, outliers against the median, scope no bidder covered, a recommendation
 * with rationale — and it is the same engine the iOS app uses. Re-deriving any
 * of that here would give two answers to one question. The model's only job is
 * the reading: mapping each bidder's own words onto the scope checklist. The
 * engine does the maths on what it returns.
 *
 * AND IT PROPOSES, IT DOES NOT DISPOSE. Nothing here writes scope_gap_amount or
 * is_low_bid on a submission. Those are money decisions and they stay the GC's,
 * made on the leveling screen against a suggestion they can see the basis for.
 * The analysis is stored in bid_leveling_analyses — a table that has existed
 * with nothing ever writing it.
 */

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';
/* eslint-disable @typescript-eslint/no-explicit-any */

const MODEL = 'claude-sonnet-5';

const SYSTEM =
  'You are a senior estimator leveling subcontractor bids for a general contractor. ' +
  'You read each bidder\'s stated exclusions, inclusions and clarifications and map them onto the GC\'s scope checklist. ' +
  'You are conservative: if a bidder did not clearly exclude something, it is included. ' +
  'You never invent scope that is not on the checklist. ' + JSON_ONLY;

const dollarsToCents = (v: any) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
/* bid_submissions stores dollars; lib/bidleveling works entirely in cents.
   Mixing the two silently under-reports by a factor of 100. */
const toCents = (v: any) => dollarsToCents(v);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  const { id } = await params;

  const limited = aiLimiter.check(req);
  if (limited) return limited;

  /* 200 with an error, not 500: "AI is not configured on this deployment" is a
     state the UI should render calmly, not a crash. Same as bids/level-extract. */
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI is not configured on this deployment.', configured: false }, { status: 200 });
  }

  try {
    const db = createServerClient();

    const { data: pkg } = await db
      .from('bid_packages')
      .select('id, project_id, name, trade, scope_narrative, scope_of_work, scope_summary, work_included, work_excluded, estimated_value, budget_estimate')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (!pkg) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });
    const p = pkg as any;

    const [itemsRes, subsRes] = await Promise.all([
      db.from('bid_package_items')
        .select('id, description, title, csi_code, quantity, unit, uom')
        .eq('bid_package_id', id).eq('tenant_id', user.tenantId).order('sort_order').order('created_at').order('id'),
      db.from('bid_submissions')
        .select('id, company_name, sub_name, contact_email, base_amount, amount, base_bid, exclusions, inclusions, clarifications, schedule_days, bid_bond_submitted, insurance_meets')
        .eq('bid_package_id', id).eq('tenant_id', user.tenantId),
    ]);

    const scopeLines: ScopeLine[] = ((itemsRes.data || []) as any[]).map((i) => ({
      id: String(i.id),
      csi: i.csi_code || undefined,
      description: String(i.description || i.title || 'Scope item'),
      /* Every line the GC put in the bid form is scope they expect priced. */
      required: true,
    }));

    const subs = (subsRes.data || []) as any[];
    if (!subs.length) return NextResponse.json({ error: 'No bids to analyze yet.' }, { status: 400 });
    if (!scopeLines.length) {
      return NextResponse.json(
        { error: 'This package has no line items, so there is no checklist to level against.' },
        { status: 400 },
      );
    }

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const scopeList = scopeLines
      .map((s) => `- id "${s.id}"${s.csi ? ` [${s.csi}]` : ''}: ${s.description}`)
      .join('\n');

    const packageScope = [p.scope_narrative, p.scope_of_work, p.scope_summary, p.work_included]
      .filter(Boolean).join('\n\n').slice(0, 4000);

    /* One call covering every bidder, not one per bid. The comparison IS the
       analysis — a bidder who excluded something everyone else carried is the
       signal, and that is invisible when each bid is read alone. */
    const bidBlocks = subs.map((s, i) => {
      const name = s.company_name || s.sub_name || s.contact_email || `Bidder ${i + 1}`;
      return [
        `BIDDER id "${s.id}" — ${name}`,
        `  base bid: $${Number(s.base_amount ?? s.amount ?? 0).toLocaleString()}`,
        s.exclusions ? `  exclusions (their words): ${s.exclusions}` : '  exclusions: none stated',
        s.inclusions ? `  inclusions (their words): ${s.inclusions}` : '',
        s.clarifications ? `  clarifications: ${s.clarifications}` : '',
      ].filter(Boolean).join('\n');
    }).join('\n\n');

    const prompt = `TRADE: ${p.trade || p.name}

THE GC'S SCOPE CHECKLIST (every line is required scope):
${scopeList}

${packageScope ? `PACKAGE SCOPE NARRATIVE:\n${packageScope}\n` : ''}
THE BIDS:
${bidBlocks}

For EACH bidder, map their stated exclusions/inclusions/clarifications onto the checklist and return JSON:

{
  "bidders": [
    {
      "bidderId": "<the id given above>",
      "scope": [ { "scopeLineId": "<checklist id>", "status": "included|excluded|clarify", "note": "<short reason, only if excluded or clarify>" } ],
      "gapEstimateDollars": <your estimate of what the EXCLUDED scope would cost to buy elsewhere, a number, 0 if nothing excluded>,
      "gapBasis": "<one sentence explaining how you arrived at that figure>"
    }
  ],
  "observations": [ "<a short, concrete observation a GC would act on>" ]
}

Rules:
- Default to "included". Only mark "excluded" when the bidder's own words exclude it, and "clarify" when their words are ambiguous about it.
- Every bidder must have an entry for EVERY checklist id.
- gapEstimateDollars is a rough order-of-magnitude figure the GC will review, not a quote. Base it on the other bidders' pricing where you can.
- observations should name bidders and scope, not generalities.
Return ONLY the JSON object.`;

    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    });

    const parsed = extractJson<any>(messageText(resp as any));
    if (!parsed || !Array.isArray(parsed.bidders)) {
      return NextResponse.json({ error: 'The analysis came back unreadable. Try again.' }, { status: 200 });
    }

    /* Only ids that exist are accepted, and only the three statuses the engine
       understands. A model naming a scope line that is not on the checklist
       must not be able to invent one. */
    const validScope = new Set(scopeLines.map((s) => s.id));
    const validBid = new Map(subs.map((s) => [String(s.id), s]));
    const byBidder = new Map<string, any>();
    for (const b of parsed.bidders) {
      const bid = validBid.get(String(b?.bidderId));
      if (!bid) continue;
      const scope: BidderScopeItem[] = (b.scope || [])
        .filter((x: any) => x && validScope.has(String(x.scopeLineId)))
        .map((x: any) => ({
          scopeLineId: String(x.scopeLineId),
          status: (['included', 'excluded', 'clarify'].includes(x.status) ? x.status : 'clarify') as ScopeStatus,
          note: x.note ? String(x.note).slice(0, 240) : undefined,
        }));
      byBidder.set(String(b.bidderId), {
        scope,
        gapCents: toCents(b.gapEstimateDollars),
        gapBasis: b.gapBasis ? String(b.gapBasis).slice(0, 400) : null,
      });
    }

    /* Hand it to the shared engine. Leveled totals, required coverage, risk
       score, outliers, uncovered scope and the recommendation all come from
       there — the same code path the iOS app uses, so the two cannot disagree. */
    const bidders: Bidder[] = subs.map((s) => {
      const ai = byBidder.get(String(s.id));
      return {
        id: String(s.id),
        name: s.company_name || s.sub_name || s.contact_email || 'Bidder',
        baseBidCents: toCents(s.base_amount ?? s.amount ?? s.base_bid ?? 0),
        scope: ai?.scope ?? [],
        bondIncluded: s.bid_bond_submitted === true,
        insuranceMeets: s.insurance_meets === true,
      };
    });

    const budgetCents = toCents(p.estimated_value ?? p.budget_estimate ?? 0);
    const result = levelBids(scopeLines, bidders, {
      budgetCents: budgetCents || undefined,
      gapAllowanceCents: Object.fromEntries(
        [...byBidder.entries()].map(([bidderId, v]) => [bidderId, v.gapCents]),
      ),
    });

    const analysis = {
      model: MODEL,
      at: new Date().toISOString(),
      scopeLines,
      /* The model's reading, kept beside the engine's arithmetic so a GC can see
         WHY a gap was suggested rather than being handed a number. */
      reading: [...byBidder.entries()].map(([bidderId, v]) => ({
        bidderId,
        gapDollars: Math.round(v.gapCents / 100),
        gapBasis: v.gapBasis,
        excluded: v.scope.filter((x: BidderScopeItem) => x.status === 'excluded').length,
        clarify: v.scope.filter((x: BidderScopeItem) => x.status === 'clarify').length,
        scope: v.scope,
      })),
      observations: Array.isArray(parsed.observations)
        ? parsed.observations.slice(0, 8).map((o: any) => String(o).slice(0, 300))
        : [],
      leveling: result,
    };

    /* One analysis per package, replaced on re-run. Inserting every time would leave
       a GC reading a stale recommendation from three revisions ago. */
    const { data: existing } = await db
      .from('bid_leveling_analyses')
      .select('id')
      .eq('bid_package_id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (existing) {
      await must(
        db.from('bid_leveling_analyses').update({
          analysis: analysis as never,
          recommendation: result.recommendation?.rationale ?? null,
          updated_at: new Date().toISOString(),
        } as never)
          .eq('id', (existing as any).id)
          .eq('tenant_id', user.tenantId),
        'bid_leveling_analyses update',
      );
    } else {
      await must(
        db.from('bid_leveling_analyses').insert({
          tenant_id: user.tenantId,
          project_id: p.project_id,
          bid_package_id: id,
          analysis: analysis as never,
          recommendation: result.recommendation?.rationale ?? null,
          created_by: user.id,
        } as never),
        'bid_leveling_analyses insert',
      );
    }

    /* The model's reading is recorded against each bid so the GC can see it on
       the submission itself — but scope_gap_amount is deliberately NOT written.
       Accepting a suggested figure is a money decision and stays a click. */
    for (const [bidderId, v] of byBidder) {
      await tryWrite(
        db.from('bid_submissions')
          .update({
            /* sage_analysis is TEXT, not jsonb — passing an object stores the
               string "[object Object]". Serialise explicitly. */
            sage_analysis: JSON.stringify({
              gapDollars: Math.round(v.gapCents / 100),
              gapBasis: v.gapBasis,
              scope: v.scope,
              at: new Date().toISOString(),
            }) as never,
            scope_gap_flags: v.scope.filter((x: BidderScopeItem) => x.status !== 'included').map((x: BidderScopeItem) => x.scopeLineId) as never,
          } as never)
          .eq('id', bidderId)
          .eq('tenant_id', user.tenantId),
        'bid_submissions sage_analysis',
      );
    }

    return NextResponse.json({ success: true, configured: true, analysis });
  } catch (e) {
    return apiError('bid_leveling_analyze', e);
  }
}
