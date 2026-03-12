import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ history: [], stats: { total: 0, wins: 0, winRate: 0, avgMargin: 0 }, source: 'unauth' }, { status: 401 });
    const db = createServerClient();
    const { data } = await db.from('bid_history').select('*').eq('tenant_id', user.tenantId).order('bid_date', { ascending: false }).limit(50);
    const history = data || [];
    const wins = history.filter((b: any) => b.won);
    return NextResponse.json({
      history,
      stats: {
        total: history.length,
        wins: wins.length,
        winRate: history.length > 0 ? Math.round(wins.length / history.length * 100) : 0,
        avgMargin: wins.length > 0 ? wins.reduce((s: number, b: any) => s + (b.margin_percent || 0), 0) / wins.length : 0,
      },
      source: 'live',
    });
  } catch {
    return NextResponse.json({ history: [], stats: { total: 0, wins: 0, winRate: 0, avgMargin: 0 }, source: 'error' });
  }
}
