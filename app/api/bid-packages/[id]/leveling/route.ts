import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must, tryWrite } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

/**
 * Bid leveling — comparing bids that are not comparable.
 *
 * The low number is almost never the low bid. Bidders quote different scopes:
 * one excludes the trenching, another carries the fire caulking, a third
 * assumes the owner supplies the fixtures. Awarding on the raw figure is how a
 * GC buys a $40,000 change order on day one. Levelling is the act of adding the
 * missing scope back onto each bid until they describe the same job.
 *
 *   GET  → every bid side by side, with its stated exclusions and any gap the
 *          GC has already priced, ranked by ADJUSTED total.
 *   POST → record a gap value against a bid, or mark the leveling complete.
 *
 * Every column this uses already exists and had never been written:
 * bid_submissions.scope_gap_amount / scope_gap_flags / adjusted_amount /
 * is_low_bid / leveling_notes, and bid_packages.leveling_complete /
 * leveling_completed_at. bid_levelings stores the worksheet itself — a table
 * that existed with zero references in application code.
 *
 * The spread is the number a GC reads first. A 4% spread across five bidders
 * means the scope was clear; a 40% spread means somebody has misread it, and
 * the cheapest bid is the one most likely to be wrong.
 */

export const dynamic = 'force-dynamic';

type Bid = Record<string, any>;

/** Base figure for a bid. base_amount leads because bid_submissions.amount
 *  defaults to 0 rather than null, so it cannot be trusted as a first term. */
const baseOf = (b: Bid) => Number(b.base_amount ?? b.amount ?? b.base_bid ?? 0) || 0;
const gapOf = (b: Bid) => Number(b.scope_gap_amount ?? 0) || 0;
const adjustedOf = (b: Bid) => baseOf(b) + gapOf(b);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'Projects', 'View');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  const { id } = await params;

  try {
    const db = createServerClient();

    const { data: pkg } = await db
      .from('bid_packages')
      .select('id, name, trade, project_id, estimated_value, budget_estimate, status, leveling_complete, leveling_completed_at, bid_due_date, due_date')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (!pkg) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });
    const p = pkg as Bid;

    const [subs, invites, items] = await Promise.all([
      db.from('bid_submissions')
        .select('id, company_name, sub_name, contact_email, base_amount, amount, base_bid, scope_gap_amount, scope_gap_flags, adjusted_amount, is_low_bid, leveling_notes, exclusions, inclusions, clarifications, schedule_days, bid_bond_submitted, status, submitted_at')
        .eq('bid_package_id', id).eq('tenant_id', user.tenantId),
      db.from('bid_package_invites')
        .select('id, company_name, sub_name, sub_email, response_status, status')
        .eq('bid_package_id', id).eq('tenant_id', user.tenantId),
      db.from('bid_package_items')
        .select('id, description, title, csi_code, quantity, unit, uom')
        .eq('bid_package_id', id).eq('tenant_id', user.tenantId).order('sort_order'),
    ]);

    const bids = ((subs.data || []) as Bid[])
      .map((b) => ({
        id: String(b.id),
        company: b.company_name || b.sub_name || b.contact_email || 'Bidder',
        email: b.contact_email || null,
        base: baseOf(b),
        gap: gapOf(b),
        adjusted: adjustedOf(b),
        exclusions: b.exclusions || null,
        inclusions: b.inclusions || null,
        clarifications: b.clarifications || null,
        scheduleDays: b.schedule_days ?? null,
        bond: b.bid_bond_submitted === true,
        notes: b.leveling_notes || null,
        submittedAt: b.submitted_at || null,
      }))
      .sort((a, b) => a.adjusted - b.adjusted);

    const totals = bids.map((b) => b.adjusted).filter((n) => n > 0);
    const low = totals.length ? Math.min(...totals) : 0;
    const high = totals.length ? Math.max(...totals) : 0;
    /* Spread against the LOW bid, which is how estimators quote it — "the field
       is within 6% of low", not a percentage of some average nobody sees. */
    const spreadPct = low > 0 ? Math.round(((high - low) / low) * 1000) / 10 : 0;

    const budget = Number(p.estimated_value ?? p.budget_estimate ?? 0) || 0;
    const allInvites = (invites.data || []) as Bid[];
    const responded = new Set(bids.map((b) => (b.email || '').toLowerCase()));

    return NextResponse.json({
      package: {
        id: p.id, name: p.name, trade: p.trade,
        budget: budget || null,
        levelingComplete: !!p.leveling_complete,
        levelingCompletedAt: p.leveling_completed_at || null,
        dueDate: p.bid_due_date || p.due_date || null,
      },
      bids,
      scopeLines: ((items.data || []) as Bid[]).map((i) => ({
        id: String(i.id),
        code: i.csi_code || '',
        description: i.description || i.title || '',
        quantity: i.quantity ?? null,
        unit: i.unit || i.uom || '',
      })),
      /* Who was invited and has still not answered. A GC levelling on the due
         date needs to know whether they are comparing three bids or three out
         of eight — the missing five are the risk. */
      awaiting: allInvites
        .filter((i) => !responded.has(String(i.sub_email || '').toLowerCase()))
        .map((i) => ({
          company: i.company_name || i.sub_name || i.sub_email,
          status: i.response_status || i.status || 'invited',
        })),
      summary: {
        received: bids.length,
        invited: allInvites.length,
        low: low || null,
        high: high || null,
        spreadPct,
        /* Against the estimate, if there is one. A whole field above budget
           usually means the estimate was wrong, not that everyone is greedy. */
        vsBudget: budget > 0 && low > 0 ? Math.round(((low - budget) / budget) * 1000) / 10 : null,
      },
    });
  } catch (e) {
    return apiError('bid_leveling', e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  const { id } = await params;

  try {
    const db = createServerClient();
    const body = await req.json().catch(() => ({}));

    const { data: pkg } = await db
      .from('bid_packages')
      .select('id, project_id, name, estimated_value, budget_estimate')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (!pkg) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });
    const p = pkg as Bid;

    /* Price a scope gap against one bid. */
    if (body.bidId) {
      const gap = Number(body.gap ?? 0) || 0;
      const { data: bid } = await db
        .from('bid_submissions')
        .select('id, base_amount, amount, base_bid')
        .eq('id', String(body.bidId))
        .eq('bid_package_id', id)
        .eq('tenant_id', user.tenantId)
        .maybeSingle();
      if (!bid) return NextResponse.json({ error: 'Bid not found' }, { status: 404 });

      await must(
        db.from('bid_submissions').update({
          scope_gap_amount: gap,
          /* adjusted_amount is stored, not derived at read time, because the
             award and the reports both read it and must agree with what the GC
             saw on the leveling sheet. */
          adjusted_amount: baseOf(bid as Bid) + gap,
          leveling_notes: body.notes != null ? String(body.notes) : undefined,
        } as never)
          .eq('id', String(body.bidId))
          .eq('tenant_id', user.tenantId),
        'bid_submissions leveling',
      );
    }

    /* Recompute who is actually low, on ADJUSTED totals, across the package.
       is_low_bid drives the award screen; leaving it on the raw low number is
       exactly the mistake levelling exists to prevent. */
    const { data: all } = await db
      .from('bid_submissions')
      .select('id, base_amount, amount, base_bid, scope_gap_amount')
      .eq('bid_package_id', id)
      .eq('tenant_id', user.tenantId);

    const rows = (all || []) as Bid[];
    let lowId: string | null = null;
    let lowVal = Number.POSITIVE_INFINITY;
    for (const r of rows) {
      const v = adjustedOf(r);
      if (v > 0 && v < lowVal) { lowVal = v; lowId = String(r.id); }
    }
    for (const r of rows) {
      await tryWrite(
        db.from('bid_submissions')
          .update({ is_low_bid: String(r.id) === lowId } as never)
          .eq('id', String(r.id))
          .eq('tenant_id', user.tenantId),
        'bid_submissions is_low_bid',
      );
    }

    /* Persist the worksheet. bid_levelings.budget_cents is bigint — cents, not
       dollars; storing dollars here would under-report by a factor of 100. */
    const budget = Number(p.estimated_value ?? p.budget_estimate ?? 0) || 0;
    await tryWrite(
      db.from('bid_levelings').insert({
        tenant_id: user.tenantId,
        project_id: p.project_id,
        bid_package_id: id,
        created_by: user.id,
        title: `${p.name || 'Bid package'} — levelled ${new Date().toISOString().slice(0, 10)}`,
        budget_cents: Math.round(budget * 100),
        scope_lines: (body.scopeLines ?? []) as never,
        bidders: rows.map((r) => ({
          id: String(r.id),
          base: baseOf(r),
          gap: gapOf(r),
          adjusted: adjustedOf(r),
          isLow: String(r.id) === lowId,
        })) as never,
        selected_alternates: (body.selectedAlternates ?? []) as never,
      } as never),
      'bid_levelings insert',
    );

    if (body.complete === true) {
      await must(
        db.from('bid_packages').update({
          leveling_complete: true,
          leveling_completed_at: new Date().toISOString(),
        } as never)
          .eq('id', id)
          .eq('tenant_id', user.tenantId),
        'bid_packages leveling_complete',
      );
    }

    return NextResponse.json({
      success: true,
      lowBidId: lowId,
      lowAdjusted: Number.isFinite(lowVal) ? lowVal : null,
    });
  } catch (e) {
    return apiError('bid_leveling', e);
  }
}
