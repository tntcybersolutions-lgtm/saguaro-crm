import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

const DEMO_HISTORY = [
  { project_name: 'Mesa Office Complex', project_type: 'commercial', bid_amount: 2400000, won: true, margin_percent: 12, bid_date: '2024-01-10' },
  { project_name: 'Scottsdale Retail', project_type: 'retail', bid_amount: 1900000, won: false, margin_percent: 8, bid_date: '2024-02-15' },
  { project_name: 'Phoenix Warehouse', project_type: 'industrial', bid_amount: 3100000, won: true, margin_percent: 14, bid_date: '2024-03-20' },
];

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ history: DEMO_HISTORY, source: 'demo' });
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
    return NextResponse.json({ history: DEMO_HISTORY, source: 'demo' });
  }
}
