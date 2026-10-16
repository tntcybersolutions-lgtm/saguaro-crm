/**
 * Win/loss surfacing feed. Reads the tenant's learned trade_win_factors (produced by
 * the learner behind POST /api/bids/outcome) plus a headline won/lost tally from
 * bid_history, so dashboards / bid-intelligence / the estimator can show "where we
 * win and where we're leaving money on the table" without re-running the learner.
 *
 * Service-role client bypasses RLS → every read is explicitly tenant-scoped.
 * winRate is a 0..1 fraction over DECIDED (won+lost) bids, or null when none are decided.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const { user } = g;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = g.db as any;
  const tenantId = user.tenantId;

  try {
    // Headline tally — count won vs lost across the tenant's bid history.
    const { data: outcomes, error: oErr } = await db
      .from('bid_history')
      .select('outcome')
      .eq('tenant_id', tenantId);
    if (oErr) throw oErr;

    const rows = outcomes || [];
    const wins = rows.filter((r: any) => r.outcome === 'won').length;
    const losses = rows.filter((r: any) => r.outcome === 'lost').length;
    const decided = wins + losses;
    const winRate = decided > 0 ? wins / decided : null;

    // Per-CSI learned factors, most-sampled first.
    const { data: factors, error: fErr } = await db
      .from('trade_win_factors')
      .select(
        'csi_division, trade, win_rate, loss_count, win_count, suggested_multiplier, confidence, sample_count, avg_over_winner_pct',
      )
      .eq('tenant_id', tenantId)
      .order('sample_count', { ascending: false });
    if (fErr) throw fErr;

    return NextResponse.json({ winRate, wins, losses, factors: factors || [] });
  } catch (e) {
    return apiError('bids/win-factors GET', e, undefined, 500, { winRate: null, wins: 0, losses: 0, factors: [] });
  }
}
