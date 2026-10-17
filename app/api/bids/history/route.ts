import { NextRequest, NextResponse } from 'next/server';
import { requireAnyPermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

const EMPTY_STATS = {
  totalBids: 0, wonBids: 0, lostBids: 0, pendingBids: 0,
  winRate: 0, avgMargin: 0, totalValue: 0,
};

export async function GET(req: NextRequest) {
  try {
    const gate = await requireAnyPermission(req, ['Sales', 'Budget'], 'View', { projectId: null });
  if (!gate.ok) return gate.res;
  const user = gate.user;
    if (!user) {
      return NextResponse.json({ bids: [], stats: EMPTY_STATS, source: 'unauth' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const outcome = searchParams.get('outcome');
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);

    const db = createServerClient();
    let query = db
      .from('bid_history')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('bid_date', { ascending: false })
      .limit(limit);
    if (outcome && outcome !== 'all') query = query.eq('outcome', outcome);

    const { data, error } = await query;
    if (error) throw error;
    const bids = data || [];

    // Stats are computed over the whole tenant history, independent of the current
    // outcome filter, so the KPI row stays stable while the user filters the table.
    const { data: allData } = await db
      .from('bid_history')
      .select('outcome, margin_pct, bid_amount')
      .eq('tenant_id', user.tenantId);
    const all = allData || [];
    const won = all.filter((b: any) => b.outcome === 'won');
    const lost = all.filter((b: any) => b.outcome === 'lost');
    const pending = all.filter((b: any) => b.outcome === 'pending');
    const decided = won.length + lost.length;
    const stats = {
      totalBids: all.length,
      wonBids: won.length,
      lostBids: lost.length,
      pendingBids: pending.length,
      winRate: decided > 0 ? Math.round((won.length / decided) * 100) : 0,
      avgMargin: won.length > 0
        ? won.reduce((s: number, b: any) => s + (Number(b.margin_pct) || 0), 0) / won.length
        : 0,
      totalValue: all.reduce((s: number, b: any) => s + (Number(b.bid_amount) || 0), 0),
    };

    return NextResponse.json({ bids, stats, source: 'live' });
  } catch (e) {
    return apiError('bids/history GET', e, undefined, 500, { bids: [], stats: EMPTY_STATS, source: 'error' });
  }
}
