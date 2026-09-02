/**
 * Canonical win/loss capture funnel. Every entry point (leads kanban, bids history,
 * proposal accept/decline, mobile "Mark Won/Lost") POSTs here so there is exactly ONE
 * write path and learning always fires.
 *
 * Body:
 *   {
 *     source: 'lead'|'proposal'|'bid'|'package'|'manual', sourceId?: string,
 *     outcome: 'won'|'lost',
 *     ourAmount?: number, winningAmount?: number,           // dollars (header)
 *     reason?: string, awardedTo?: string,
 *     projectName?: string, projectType?: string, trades?: string[],
 *     lines?: [{ csiDivision, trade?, ourCostCents?, ourSellCents?, winningSellCents? }]
 *   }
 *
 * Service-role client bypasses RLS → every read/write is explicitly tenant-scoped.
 */
import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { learnTenantWinFactors } from '@/lib/bid-learn';
import { must } from '@/lib/db-write';

export const runtime = 'nodejs';

type OutcomeBody = {
  source?: string;
  sourceId?: string;
  outcome?: string;
  ourAmount?: number;
  winningAmount?: number;
  reason?: string;
  awardedTo?: string;
  projectName?: string;
  projectType?: string;
  trades?: string[];
  lines?: Array<{
    csiDivision?: string;
    trade?: string | null;
    ourCostCents?: number | null;
    ourSellCents?: number | null;
    winningSellCents?: number | null;
  }>;
};

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServerClient() as any;
  const tenantId = user.tenantId;

  let body: OutcomeBody;
  try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }); }

  const outcome = body.outcome === 'won' ? 'won' : body.outcome === 'lost' ? 'lost' : null;
  if (!outcome) return Response.json({ error: 'outcome must be "won" or "lost".' }, { status: 400 });

  const source = String(body.source || 'manual');
  const sourceId = body.sourceId ? String(body.sourceId) : null;
  const nowIso = new Date().toISOString();

  // Header fields (bid_history — the event header).
  const header: Record<string, unknown> = {
    tenant_id:          tenantId,
    outcome,
    source,
    source_id:          sourceId,
    won_at:             outcome === 'won' ? nowIso : null,
    lost_at:            outcome === 'lost' ? nowIso : null,
    winning_bid_amount: body.winningAmount != null ? Number(body.winningAmount) : null,
    loss_reason:        outcome === 'lost' && body.reason ? String(body.reason) : null,
    awarded_to:         body.awardedTo ? String(body.awardedTo) : null,
  };
  if (body.ourAmount != null)   header.bid_amount   = Number(body.ourAmount);
  if (body.projectName)         header.project_name = String(body.projectName);
  if (body.projectType)         header.project_type = String(body.projectType);
  if (Array.isArray(body.trades)) header.trades = body.trades.map(String);

  try {
    // 1) Upsert the header. Re-marking the same source updates in place (idempotent).
    let bidHistoryId: string | null = null;
    if (sourceId) {
      const { data: existing } = await supabase
        .from('bid_history').select('id')
        .eq('tenant_id', tenantId).eq('source', source).eq('source_id', sourceId)
        .limit(1);
      if (existing && existing.length) bidHistoryId = existing[0].id as string;
    }

    if (bidHistoryId) {
      const { error: upErr } = await supabase.from('bid_history')
        .update(header).eq('id', bidHistoryId).eq('tenant_id', tenantId);
      if (upErr) throw new Error(upErr.message);
    } else {
      header.bid_date = nowIso;
      const { data: ins, error: insErr } = await supabase.from('bid_history')
        .insert(header).select('id').single();
      if (insErr) throw new Error(insErr.message);
      bidHistoryId = ins.id as string;
    }

    // 2) Replace this event's per-division lines (idempotent on re-mark).
    await must(supabase.from('bid_outcome_lines')
      .delete().eq('tenant_id', tenantId).eq('bid_history_id', bidHistoryId), 'bid_outcome_lines write');

    const lines = Array.isArray(body.lines) ? body.lines : [];
    const lineRows = lines
      .filter((l) => l && String(l.csiDivision || '').trim())
      .map((l) => ({
        tenant_id:          tenantId,
        bid_history_id:     bidHistoryId,
        csi_division:       String(l.csiDivision).slice(0, 2),
        trade:              l.trade ?? null,
        our_cost_cents:     l.ourCostCents == null ? null : Math.round(Number(l.ourCostCents)),
        our_sell_cents:     l.ourSellCents == null ? null : Math.round(Number(l.ourSellCents)),
        winning_sell_cents: l.winningSellCents == null ? null : Math.round(Number(l.winningSellCents)),
        outcome,
      }));
    if (lineRows.length) {
      const { error: lErr } = await supabase.from('bid_outcome_lines').insert(lineRows);
      if (lErr) throw new Error(lErr.message);
    }

    // 3) Re-learn — deterministic, bounded, tenant-scoped.
    const learn = await learnTenantWinFactors(supabase, tenantId);

    return Response.json({
      success: true,
      bidHistoryId,
      outcome,
      linesRecorded: lineRows.length,
      learned: learn,
    });
  } catch (e) {
    console.error('[bids/outcome]', e);
    return Response.json({ error: 'Could not record the bid outcome. Please try again.' }, { status: 500 });
  }
}
