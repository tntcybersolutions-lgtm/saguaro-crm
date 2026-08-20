import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();

    // Aggregate bid intelligence from bid_history table
    const { data: history } = await db
      .from('bid_history')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('bid_date', { ascending: false });

    const records = (history || []) as any[];

    if (records.length === 0) {
      return NextResponse.json({
        success: true,
        profile: {
          total_bids: 0,
          total_wins: 0,
          win_rate: 0,
          avg_margin: 0,
          data_quality: 'insufficient',
          trade_stats: {},
          project_type_stats: {},
          recommendations: ['Add bid history to build intelligence profile'],
        },
      });
    }

    // Calculate aggregates
    const totalBids = records.length;
    const wins = records.filter((r) => r.outcome === 'won');
    const losses = records.filter((r) => r.outcome === 'lost');
    const totalWins = wins.length;
    const winRate = Math.round((totalWins / totalBids) * 100);

    // Average margin on wins
    const margins = wins.filter((r) => r.margin_pct != null).map((r) => Number(r.margin_pct));
    const avgMargin = margins.length > 0 ? Math.round((margins.reduce((a, b) => a + b, 0) / margins.length) * 10) / 10 : 0;

    // Revenue won
    const totalRevenueWon = wins.reduce((sum, r) => sum + (Number(r.bid_amount) || 0), 0);

    // Trade breakdown
    const tradeStats: Record<string, { bids: number; wins: number; win_rate: number; avg_margin: number }> = {};
    for (const r of records) {
      const trades = r.trades || [r.trade || 'General'];
      for (const trade of (Array.isArray(trades) ? trades : [trades])) {
        if (!tradeStats[trade]) tradeStats[trade] = { bids: 0, wins: 0, win_rate: 0, avg_margin: 0 };
        tradeStats[trade].bids++;
        if (r.outcome === 'won') {
          tradeStats[trade].wins++;
          if (r.margin_pct != null) {
            tradeStats[trade].avg_margin = (tradeStats[trade].avg_margin * (tradeStats[trade].wins - 1) + Number(r.margin_pct)) / tradeStats[trade].wins;
          }
        }
      }
    }
    for (const t of Object.values(tradeStats)) {
      t.win_rate = t.bids > 0 ? Math.round((t.wins / t.bids) * 100) : 0;
      t.avg_margin = Math.round(t.avg_margin * 10) / 10;
    }

    // Project type breakdown
    const projectTypeStats: Record<string, { bids: number; wins: number; win_rate: number }> = {};
    for (const r of records) {
      const ptype = r.project_type || 'Unknown';
      if (!projectTypeStats[ptype]) projectTypeStats[ptype] = { bids: 0, wins: 0, win_rate: 0 };
      projectTypeStats[ptype].bids++;
      if (r.outcome === 'won') projectTypeStats[ptype].wins++;
    }
    for (const p of Object.values(projectTypeStats)) {
      p.win_rate = p.bids > 0 ? Math.round((p.wins / p.bids) * 100) : 0;
    }

    // Loss reasons
    const lossReasons: Record<string, number> = {};
    for (const r of losses) {
      const reason = r.loss_reason || 'Unknown';
      lossReasons[reason] = (lossReasons[reason] || 0) + 1;
    }

    // Data quality assessment
    let dataQuality = 'insufficient';
    if (totalBids >= 20) dataQuality = 'strong';
    else if (totalBids >= 10) dataQuality = 'solid';
    else if (totalBids >= 5) dataQuality = 'developing';

    // Generate recommendations
    const recommendations: string[] = [];
    if (winRate < 30) recommendations.push('Win rate is below 30% — consider narrowing focus to strongest trades');
    if (winRate > 70) recommendations.push('Win rate above 70% — you may be leaving margin on the table, consider raising prices');
    if (avgMargin < 10) recommendations.push('Average margin is below 10% — review pricing strategy');

    const topTrades = Object.entries(tradeStats)
      .sort(([, a], [, b]) => b.win_rate - a.win_rate)
      .slice(0, 3);
    if (topTrades.length > 0) {
      recommendations.push(`Strongest trades: ${topTrades.map(([t, s]) => `${t} (${s.win_rate}% win rate)`).join(', ')}`);
    }

    const topLossReason = Object.entries(lossReasons).sort(([, a], [, b]) => b - a)[0];
    if (topLossReason) {
      recommendations.push(`Most common loss reason: "${topLossReason[0]}" (${topLossReason[1]} times)`);
    }

    // Save/update the cached intelligence profile
    const profileData = {
      tenant_id: user.tenantId,
      total_bids: totalBids,
      total_wins: totalWins,
      win_rate_percent: winRate,
      avg_margin_won: avgMargin,
      total_revenue_won: totalRevenueWon,
      trade_stats: tradeStats,
      project_type_stats: projectTypeStats,
      loss_reasons: lossReasons,
      top_recommendations: recommendations,
      data_quality: dataQuality,
      outcomes_analyzed: totalBids,
      last_analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Upsert: update if exists, insert if not
    const { data: existingProfile } = await db
      .from('bid_intelligence_profiles')
      .select('id')
      .eq('tenant_id', user.tenantId)
      .single();

    if (existingProfile) {
      await db.from('bid_intelligence_profiles').update(profileData).eq('id', existingProfile.id).eq('tenant_id', user.tenantId);
    } else {
      await db.from('bid_intelligence_profiles').insert(profileData);
    }

    return NextResponse.json({
      success: true,
      profile: {
        total_bids: totalBids,
        total_wins: totalWins,
        win_rate: winRate,
        avg_margin: avgMargin,
        total_revenue_won: totalRevenueWon,
        data_quality: dataQuality,
        trade_stats: tradeStats,
        project_type_stats: projectTypeStats,
        loss_reasons: lossReasons,
        recommendations,
        last_bid_date: records[0]?.bid_date || null,
        outcomes_analyzed: totalBids,
      },
    });
  } catch (err) {
    console.error('[bids/intelligence]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Record a bid outcome
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const body = await req.json();

    const { data, error } = await db.from('bid_outcomes').insert({
      tenant_id: user.tenantId,
      bid_package_id: body.bidPackageId || body.bid_package_id || null,
      project_id: body.projectId || body.project_id || null,
      trade_category: body.tradeCategory || body.trade_category || null,
      scope_summary: body.scopeSummary || body.scope_summary || null,
      project_type: body.projectType || body.project_type || null,
      project_size_sqft: body.projectSizeSqft || body.project_size_sqft || null,
      bid_amount: body.bidAmount || body.bid_amount || null,
      estimated_cost: body.estimatedCost || body.estimated_cost || null,
      estimated_margin_percent: body.estimatedMarginPercent || body.estimated_margin_percent || null,
      outcome: body.outcome || 'pending',
      outcome_date: body.outcomeDate || body.outcome_date || null,
      winning_bid_amount: body.winningBidAmount || body.winning_bid_amount || null,
      awarded_to: body.awardedTo || body.awarded_to || null,
    }).select().single();

    if (error) throw error;

    return NextResponse.json({ success: true, outcome: data });
  } catch (err) {
    console.error('[bids/intelligence POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
