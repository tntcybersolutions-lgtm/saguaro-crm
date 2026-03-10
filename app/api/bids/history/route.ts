// app/api/bids/history/route.ts
// GET /api/bids/history
// Returns bid history with stats. Gracefully falls back to demo data when
// the bid_history table does not yet exist.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BidRecord {
  id: string;
  project_name: string;
  project_type: string;
  bid_date: string;
  bid_amount: number;
  actual_cost: number | null;
  margin_pct: number;
  outcome: 'won' | 'lost' | 'pending' | 'withdrawn';
  loss_reason: string | null;
  awarded_to: string | null;
  location: string;
  state: string;
  trades: string[];
  notes: string | null;
}

interface BidStats {
  totalBids: number;
  wonBids: number;
  lostBids: number;
  pendingBids: number;
  winRate: number;
  avgMargin: number;
  totalValue: number;
}

// ─── Demo Fallback Data ───────────────────────────────────────────────────────

const DEMO_BIDS: BidRecord[] = [
  {
    id: 'demo-1',
    project_name: 'Scottsdale Medical Office Build-Out',
    project_type: 'Commercial TI',
    bid_date: '2025-11-15',
    bid_amount: 2_850_000,
    actual_cost: 2_610_000,
    margin_pct: 17.2,
    outcome: 'won',
    loss_reason: null,
    awarded_to: null,
    location: 'Scottsdale, AZ',
    state: 'AZ',
    trades: ['Drywall', 'Electrical', 'Plumbing', 'HVAC'],
    notes: 'Fast-track 14-week schedule.',
  },
  {
    id: 'demo-2',
    project_name: 'Phoenix Logistics Warehouse',
    project_type: 'Industrial',
    bid_date: '2025-10-02',
    bid_amount: 8_400_000,
    actual_cost: null,
    margin_pct: 12.5,
    outcome: 'lost',
    loss_reason: 'Low bid by competitor',
    awarded_to: 'Southwest General Contractors',
    location: 'Phoenix, AZ',
    state: 'AZ',
    trades: ['Structural Steel', 'Concrete', 'Roofing', 'Electrical'],
    notes: 'Missed by $320k.',
  },
  {
    id: 'demo-3',
    project_name: 'Mesa Elementary School Renovation',
    project_type: 'Education',
    bid_date: '2025-09-20',
    bid_amount: 1_650_000,
    actual_cost: 1_498_000,
    margin_pct: 15.8,
    outcome: 'won',
    loss_reason: null,
    awarded_to: null,
    location: 'Mesa, AZ',
    state: 'AZ',
    trades: ['Rough Framing', 'Drywall', 'Painting', 'Flooring'],
    notes: 'Prevailing wage project.',
  },
  {
    id: 'demo-4',
    project_name: 'Tempe Mixed-Use Retail & Office',
    project_type: 'Mixed-Use',
    bid_date: '2025-08-08',
    bid_amount: 5_200_000,
    actual_cost: null,
    margin_pct: 11.0,
    outcome: 'lost',
    loss_reason: 'Budget cut — project scope reduced',
    awarded_to: 'Horizon Builders LLC',
    location: 'Tempe, AZ',
    state: 'AZ',
    trades: ['Concrete', 'Masonry', 'Electrical', 'Plumbing', 'HVAC'],
    notes: null,
  },
  {
    id: 'demo-5',
    project_name: 'Chandler Data Center Shell',
    project_type: 'Industrial',
    bid_date: '2025-07-14',
    bid_amount: 12_750_000,
    actual_cost: 11_600_000,
    margin_pct: 19.3,
    outcome: 'won',
    loss_reason: null,
    awarded_to: null,
    location: 'Chandler, AZ',
    state: 'AZ',
    trades: ['Structural Steel', 'Roofing', 'Electrical', 'Low Voltage', 'HVAC'],
    notes: 'Design-build delivery.',
  },
  {
    id: 'demo-6',
    project_name: 'Gilbert Multifamily Phase 2',
    project_type: 'Multifamily',
    bid_date: '2025-06-30',
    bid_amount: 3_100_000,
    actual_cost: 2_875_000,
    margin_pct: 13.4,
    outcome: 'won',
    loss_reason: null,
    awarded_to: null,
    location: 'Gilbert, AZ',
    state: 'AZ',
    trades: ['Rough Framing', 'Roofing', 'Drywall', 'Painting', 'Flooring'],
    notes: '48-unit garden-style complex.',
  },
  {
    id: 'demo-7',
    project_name: 'Peoria Senior Living Center',
    project_type: 'Healthcare',
    bid_date: '2025-05-19',
    bid_amount: 6_800_000,
    actual_cost: null,
    margin_pct: 9.5,
    outcome: 'pending',
    loss_reason: null,
    awarded_to: null,
    location: 'Peoria, AZ',
    state: 'AZ',
    trades: ['Concrete', 'Masonry', 'Electrical', 'Plumbing', 'Medical Gas'],
    notes: 'Decision expected Q1 2026.',
  },
  {
    id: 'demo-8',
    project_name: 'Downtown Tucson Hotel Renovation',
    project_type: 'Hospitality',
    bid_date: '2025-04-07',
    bid_amount: 4_350_000,
    actual_cost: null,
    margin_pct: 22.0,
    outcome: 'lost',
    loss_reason: 'Owner selected preferred contractor',
    awarded_to: 'Legacy Construction Group',
    location: 'Tucson, AZ',
    state: 'AZ',
    trades: ['Drywall', 'Painting', 'Flooring', 'Tile', 'Millwork'],
    notes: 'Incumbent relationship.',
  },
];

function computeStats(bids: BidRecord[]): BidStats {
  const wonBids = bids.filter((b) => b.outcome === 'won');
  const lostBids = bids.filter((b) => b.outcome === 'lost');
  const pendingBids = bids.filter((b) => b.outcome === 'pending');
  const totalBids = bids.length;
  const decidedBids = wonBids.length + lostBids.length;
  const winRate =
    decidedBids > 0 ? Math.round((wonBids.length / decidedBids) * 100) : 0;
  const avgMargin =
    wonBids.length > 0
      ? wonBids.reduce((sum, b) => sum + b.margin_pct, 0) / wonBids.length
      : 0;
  const totalValue = bids.reduce((sum, b) => sum + b.bid_amount, 0);

  return {
    totalBids,
    wonBids: wonBids.length,
    lostBids: lostBids.length,
    pendingBids: pendingBids.length,
    winRate,
    avgMargin: parseFloat(avgMargin.toFixed(1)),
    totalValue,
  };
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const trade = searchParams.get('trade') ?? undefined;
    const outcome = searchParams.get('outcome') ?? undefined;
    const projectType = searchParams.get('projectType') ?? undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);

    // Resolve tenant from auth token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    let tenantId: string | null = null;

    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      tenantId = user?.id ?? null;
    }

    if (!tenantId) {
      // Demo mode — filter the static dataset and return
      let demoBids = [...DEMO_BIDS];
      if (outcome) demoBids = demoBids.filter((b) => b.outcome === outcome);
      if (projectType) demoBids = demoBids.filter((b) => b.project_type === projectType);
      if (trade) demoBids = demoBids.filter((b) => b.trades?.includes(trade));
      demoBids = demoBids.slice(0, limit);

      return NextResponse.json({
        bids: demoBids,
        stats: computeStats(demoBids),
        source: 'demo',
      });
    }

    // Attempt live query
    let q = supabase
      .from('bid_history')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('bid_date', { ascending: false })
      .limit(limit);

    if (outcome) q = q.eq('outcome', outcome);
    if (projectType) q = q.eq('project_type', projectType);
    if (trade) q = q.contains('trades', [trade]);

    const { data, error } = await q;

    // Graceful fallback when table doesn't exist yet (error code 42P01 = undefined_table)
    if (error) {
      if (
        error.code === '42P01' ||
        error.message?.includes('does not exist') ||
        error.message?.includes('relation')
      ) {
        return NextResponse.json({
          bids: DEMO_BIDS.slice(0, limit),
          stats: computeStats(DEMO_BIDS),
          source: 'demo',
          notice: 'bid_history table not yet created — showing demo data.',
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const bids: BidRecord[] = data ?? [];
    return NextResponse.json({
      bids,
      stats: computeStats(bids),
      source: 'live',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
