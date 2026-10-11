/**
 * lib/bid-outcome.ts — the one write path for a win or a loss.
 *
 * Every entry point records an outcome here: POST /api/bids/outcome (leads
 * kanban, bids history, proposal Mark Accepted/Declined, mobile Mark Won/Lost)
 * and, server-side, a client signing a proposal online (lib/proposal-accept).
 * Moved out of the route unchanged so the signing path cannot drift from it.
 *
 * Service-role client bypasses RLS → every read/write is explicitly tenant-scoped.
 */
import { learnTenantWinFactors } from '@/lib/bid-learn';
import { must } from '@/lib/db-write';

export type OutcomeBody = {
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

export type OutcomeResult =
  | { ok: true; bidHistoryId: string | null; outcome: 'won' | 'lost'; linesRecorded: number; learned: unknown }
  | { ok: false; status: 400; error: string };

/** Record a win/loss (idempotent per source + sourceId) and re-learn win factors. Throws on a database error. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recordBidOutcome(supabase: any, tenantId: string, body: OutcomeBody): Promise<OutcomeResult> {
  const outcome = body.outcome === 'won' ? 'won' : body.outcome === 'lost' ? 'lost' : null;
  if (!outcome) return { ok: false, status: 400, error: 'outcome must be "won" or "lost".' };

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

  return { ok: true, bidHistoryId, outcome, linesRecorded: lineRows.length, learned: learn };
}
