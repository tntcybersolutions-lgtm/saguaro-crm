import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../supabase/admin';

const DEMO_SUBS = [
  {
    id: 's1',
    name: 'Desert Iron Works',
    trade: 'Metals',
    email: 'bids@desertironworks.com',
    winRate: 72,
    lastProject: 'Scottsdale Medical Center',
    lastProjectDate: '2025-11-15',
    rating: 4.8,
  },
  {
    id: 's2',
    name: 'SunState Concrete',
    trade: 'Concrete',
    email: 'estimating@sunstateconcrete.com',
    winRate: 65,
    lastProject: 'Phoenix Office Tower',
    lastProjectDate: '2025-09-22',
    rating: 4.6,
  },
  {
    id: 's3',
    name: 'AZ Electric Solutions',
    trade: 'Electrical',
    email: 'bids@azelectric.com',
    winRate: 81,
    lastProject: 'Mesa School District',
    lastProjectDate: '2026-01-08',
    rating: 4.9,
  },
];

export async function POST(req: NextRequest) {
  let trade = '';
  let projectId = '';

  try {
    const body = await req.json();
    trade = body.trade || '';
    projectId = body.projectId || '';
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    // Normalize trade to a short keyword for matching
    const tradeKeyword = trade.replace(/^Division \d+ — /, '').toLowerCase();

    const { data, error } = await supabaseAdmin
      .from('sub_performance')
      .select('id, name, trade, email, win_rate, last_project, last_project_date, rating')
      .ilike('trade', `%${tradeKeyword}%`)
      .order('win_rate', { ascending: false })
      .limit(10);

    if (error) throw error;

    if (!data || data.length === 0) {
      return NextResponse.json({ subs: DEMO_SUBS });
    }

    const subs = data.map((row: {
      id: string;
      name: string;
      trade: string;
      email: string;
      win_rate: number;
      last_project: string;
      last_project_date: string;
      rating: number;
    }) => ({
      id: row.id,
      name: row.name,
      trade: row.trade,
      email: row.email,
      winRate: row.win_rate,
      lastProject: row.last_project,
      lastProjectDate: row.last_project_date,
      rating: row.rating,
    }));

    return NextResponse.json({ subs });
  } catch {
    // Table may not exist yet — return demo data
    return NextResponse.json({ subs: DEMO_SUBS });
  }
}
