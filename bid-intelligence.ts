/**
 * bid-intelligence.ts
 *
 * Saguaro CRM — AI Bid Intelligence & Learning Engine
 *
 * This is the core competitive differentiator. It makes Saguaro smarter
 * with every single bid — win or lose.
 *
 * What it does:
 *   1. recordBidOutcome()      — After every bid result, Claude analyzes WHY
 *                                you won or lost and stores structured lessons
 *   2. buildIntelligenceProfile() — Periodically rebuilds your company's
 *                                "brain" from all historical data
 *   3. scoreBidOpportunity()   — Given a new opportunity, Claude scores it
 *                                0-100 for fit and estimates win probability
 *   4. getBidStrategy()        — For an active bid package, gives specific
 *                                pricing and scope strategy recommendations
 *   5. getOpportunityFeed()    — Returns your scored opportunity pipeline,
 *                                sorted by fit + urgency
 *
 * The profile improves continuously:
 *   5 bids    → basic patterns emerge
 *   20 bids   → trade-level insights
 *   50+ bids  → pricing intelligence, ideal project profile, market position
 *
 * Usage:
 *   import { BidIntelligence } from './bid-intelligence';
 *   await BidIntelligence.recordBidOutcome({ tenantId, bidSubmissionId, outcome: 'won' });
 *   const score = await BidIntelligence.scoreBidOpportunity({ tenantId, ... });
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';


import { supabaseAdmin } from './supabase/admin';
import { EmailService } from './email-service';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// Zod Schemas for structured AI output
// ─────────────────────────────────────────────────────────────────────────────

const ImpactLevel = z.enum(['high', 'medium', 'low']);

const WinFactorSchema = z.object({
  factor: z.string().describe('Specific factor that contributed to winning'),
  impact: ImpactLevel,
  detail: z.string().describe('Concrete explanation with specifics'),
});

const LossFactorSchema = z.object({
  factor: z.string().describe('Specific factor that contributed to losing'),
  impact: ImpactLevel,
  detail: z.string().describe('What specifically caused this factor to hurt us'),
  corrective_action: z.string().describe('What to do differently next time'),
});

const LessonSchema = z.object({
  lesson: z.string().describe('Clear, actionable lesson learned'),
  recommendation: z.string().describe('Specific change to make in future bids'),
  priority: z.enum(['high', 'medium', 'low']),
});

const PriceAnalysisSchema = z.object({
  our_price_vs_market: z.enum(['too_high', 'competitive', 'below_market', 'unknown']),
  strategy_used: z.string().describe('What pricing strategy was used'),
  recommended_strategy: z.string().describe('What pricing strategy should be used'),
  adjustment_pct: z.number().describe('Suggested % adjustment for similar future bids. Negative = lower price.'),
});

const BidPostMortemSchema = z.object({
  win_factors: z.array(WinFactorSchema).describe('Factors that contributed to winning (empty if lost)'),
  loss_factors: z.array(LossFactorSchema).describe('Factors that contributed to losing (empty if won)'),
  price_analysis: PriceAnalysisSchema,
  scope_fit_score: z.number().int().min(0).max(100).describe('How well this scope matched our strengths'),
  relationship_score: z.number().int().min(0).max(100).describe('Strength of relationship with owner/GC'),
  lessons: z.array(LessonSchema).min(1).describe('Key lessons for future bids'),
  analysis_narrative: z.string().describe('2-3 paragraph plain-English analysis of what happened and why'),
});

const StrengthSchema = z.object({
  area: z.string(),
  evidence: z.string().describe('Specific data supporting this strength'),
  confidence_pct: z.number().int().min(0).max(100),
});

const ImprovementSchema = z.object({
  area: z.string(),
  current_rate: z.string().describe('Current performance metric'),
  target_rate: z.string().describe('Target to achieve'),
  recommendation: z.string().describe('Specific action to take'),
});

const RecommendationSchema = z.object({
  priority: z.number().int().min(1).max(5),
  action: z.string().describe('Specific, actionable step'),
  rationale: z.string().describe('Why this matters, backed by data'),
  expected_impact: z.string().describe('What improvement this should produce'),
});

const IntelligenceProfileSchema = z.object({
  core_strengths: z.array(StrengthSchema).min(1),
  areas_to_improve: z.array(ImprovementSchema),
  ideal_project_profile: z.object({
    trade_categories: z.array(z.string()),
    project_types: z.array(z.string()),
    size_range: z.string().describe('e.g. "$100K–$750K"'),
    owner_types: z.array(z.string()).describe('e.g. ["healthcare", "government"]'),
    margin_target_pct: z.number().describe('Target margin % to achieve desired win rate'),
  }),
  market_position: z.enum(['low_bidder', 'competitive', 'premium', 'unknown']),
  avg_margin_by_trade: z.record(z.string(), z.number()).describe('Trade → average winning margin %'),
  bid_strategy_text: z.string().describe('1-2 sentence strategy recommendation for which bids to pursue'),
  pricing_strategy_text: z.string().describe('1-2 sentence pricing recommendation based on history'),
  scope_strategy_text: z.string().describe('1-2 sentence scope recommendation'),
  top_recommendations: z.array(RecommendationSchema).min(3).max(5),
  profile_summary: z.string().describe('3-4 paragraph narrative intelligence brief — honest, data-driven'),
  data_quality: z.enum(['insufficient', 'developing', 'solid', 'strong']),
});

const OpportunityScoreSchema = z.object({
  fit_score: z.number().int().min(0).max(100).describe('Overall fit to company profile'),
  win_probability: z.number().int().min(0).max(100).describe('Estimated probability of winning if we bid'),
  recommended_action: z.enum(['bid', 'pass', 'partner', 'investigate', 'bid_with_partner']),
  scope_alignment_score: z.number().int().min(0).max(100),
  capacity_score: z.number().int().min(0).max(100).describe('Do we have bandwidth/resources right now?'),
  relationship_score: z.number().int().min(0).max(100),
  competition_score: z.number().int().min(0).max(100).describe('Higher = less/weaker competition'),
  margin_potential_score: z.number().int().min(0).max(100),
  suggested_bid_low: z.number().describe('Low end of suggested bid range'),
  suggested_bid_high: z.number().describe('High end of suggested bid range'),
  suggested_margin_pct: z.number().describe('Suggested margin % to win at'),
  bid_recommendation_text: z.string().describe('Complete analysis and go/no-go recommendation with reasoning'),
  why_we_win: z.array(z.object({
    reason: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
  })),
  key_risks: z.array(z.object({
    risk: z.string(),
    mitigation: z.string(),
    severity: z.enum(['high', 'medium', 'low']),
  })),
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Record Bid Outcome + AI Post-Mortem
// ─────────────────────────────────────────────────────────────────────────────

export type RecordOutcomeOptions = {
  tenantId: string;
  bidSubmissionId?: string;
  bidPackageId?: string;
  outcome: 'won' | 'lost' | 'no_bid' | 'abandoned';
  // Fill in what you know:
  tradeCategory?: string;
  scopeSummary?: string;
  projectType?: string;
  projectSizeSqft?: number;
  bidAmount?: number;
  estimatedCost?: number;
  estimatedMarginPct?: number;
  winningBidAmount?: number;
  winningCompany?: string;
  ourRank?: number;
  numCompetitors?: number;
  ownerName?: string;
  gcName?: string;
  location?: string;
  lostReason?: string;        // human-provided reason
  additionalContext?: string; // any other notes
};

export async function recordBidOutcome(opts: RecordOutcomeOptions): Promise<string> {
  const now = new Date().toISOString();

  // Insert the outcome record first
  const { data: outcome, error: insertErr } = await supabaseAdmin
    .from('bid_outcomes')
    .insert({
      tenant_id: opts.tenantId,
      bid_submission_id: opts.bidSubmissionId ?? null,
      bid_package_id: opts.bidPackageId ?? null,
      trade_category: opts.tradeCategory ?? null,
      scope_summary: opts.scopeSummary ?? null,
      project_type: opts.projectType ?? null,
      project_size_sqft: opts.projectSizeSqft ?? null,
      bid_amount: opts.bidAmount ?? null,
      estimated_cost: opts.estimatedCost ?? null,
      estimated_margin_percent: opts.estimatedMarginPct ?? null,
      winning_bid_amount: opts.winningBidAmount ?? null,
      winning_company: opts.winningCompany ?? null,
      our_rank: opts.ourRank ?? null,
      num_competitors_known: opts.numCompetitors ?? null,
      owner_name: opts.ownerName ?? null,
      gc_name: opts.gcName ?? null,
      location: opts.location ?? null,
      lost_reason: opts.lostReason ?? null,
      outcome: opts.outcome,
      outcome_date: new Date().toISOString().split('T')[0],
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (insertErr || !outcome) {
    throw new Error(`bid_outcomes insert: ${insertErr?.message ?? 'null result'}`);
  }

  const outcomeId = outcome.id as string;

  // Skip AI analysis if we don't have enough data
  if (!opts.bidAmount && !opts.scopeSummary && !opts.tradeCategory) {
    return outcomeId;
  }

  // Fetch historical outcomes to give Claude context
  const { data: history } = await supabaseAdmin
    .from('bid_outcomes')
    .select('trade_category, outcome, bid_amount, estimated_margin_percent, ai_scope_fit_score')
    .eq('tenant_id', opts.tenantId)
    .in('outcome', ['won', 'lost'])
    .neq('id', outcomeId)
    .order('created_at', { ascending: false })
    .limit(30);

  const winRate = history && history.length > 0
    ? `${Math.round((history.filter((h) => h.outcome === 'won').length / history.length) * 100)}%`
    : 'unknown (first bid)';

  const contextBlock = history && history.length > 0
    ? `\nYour recent bid history (last ${history.length} bids):\n` +
      history.map((h) => `  - ${h.trade_category ?? 'unknown trade'}: ${h.outcome} | bid $${((h.bid_amount ?? 0) as number).toLocaleString()} | margin ${h.estimated_margin_percent ?? '?'}%`).join('\n')
    : '';

  const prompt = `
You are a construction business intelligence expert analyzing a bid outcome to extract lessons and improve future bidding.

## Company Context
Overall win rate: ${winRate}${contextBlock}

## This Bid
Trade/Category: ${opts.tradeCategory ?? 'Not specified'}
Scope: ${opts.scopeSummary ?? 'Not specified'}
Project Type: ${opts.projectType ?? 'Not specified'}
Location: ${opts.location ?? 'Not specified'}
Our Bid: ${opts.bidAmount ? `$${opts.bidAmount.toLocaleString()}` : 'Not specified'}
Estimated Cost: ${opts.estimatedCost ? `$${opts.estimatedCost.toLocaleString()}` : 'Not specified'}
Our Margin: ${opts.estimatedMarginPct ? `${opts.estimatedMarginPct}%` : 'Not specified'}
Winning Bid: ${opts.winningBidAmount ? `$${opts.winningBidAmount.toLocaleString()}` : 'Unknown'}
Our Rank: ${opts.ourRank ? `#${opts.ourRank} of ${opts.numCompetitors ?? '?'} bidders` : 'Unknown'}
Winner: ${opts.winningCompany ?? 'Unknown'}
Owner: ${opts.ownerName ?? 'Not specified'}
GC: ${opts.gcName ?? 'Not specified'}
**OUTCOME: ${opts.outcome.toUpperCase()}**
${opts.lostReason ? `\nReason provided: ${opts.lostReason}` : ''}
${opts.additionalContext ? `\nAdditional context: ${opts.additionalContext}` : ''}

Analyze this outcome in depth. Be honest and specific — vague analysis helps no one.
If we won, explain exactly why and what to replicate. If we lost, explain exactly what went wrong and what to fix.
`.trim();

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      // thinking: adaptive (use standard create — SDK 0.54 uses enabled/budget_tokens)
      system: `You are an expert construction business analyst. Your job is to do ruthlessly honest post-mortem analysis of bid outcomes. Use data. Be specific. Do not soften feedback. Every lesson must be actionable.`,
      messages: [{ role: 'user', content: prompt }],
    });

    const analysis = (JSON.parse((response.content.find((b: {type:string}) => b.type === "text") as {type:string,text:string})?.text ?? "{}")) as z.infer<typeof BidPostMortemSchema>;

    await supabaseAdmin
      .from('bid_outcomes')
      .update({
        ai_win_factors: analysis.win_factors,
        ai_loss_factors: analysis.loss_factors,
        ai_price_analysis: analysis.price_analysis,
        ai_scope_fit_score: analysis.scope_fit_score,
        ai_relationship_score: analysis.relationship_score,
        ai_lessons: analysis.lessons,
        ai_analysis_text: analysis.analysis_narrative,
        ai_model: 'claude-opus-4-6',
        ai_analyzed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', outcomeId);
  } catch (err) {
    // Non-fatal — outcome is saved, just without AI analysis
    console.error('[BidIntelligence] Post-mortem AI error:', err instanceof Error ? err.message : err);
  }

  // Trigger profile rebuild asynchronously (don't block)
  buildIntelligenceProfile(opts.tenantId).catch((err) =>
    console.error('[BidIntelligence] Profile rebuild error:', err instanceof Error ? err.message : err),
  );

  return outcomeId;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Build / Rebuild the Company Intelligence Profile
// ─────────────────────────────────────────────────────────────────────────────

export async function buildIntelligenceProfile(tenantId: string): Promise<void> {
  // Fetch all outcomes
  const { data: allOutcomes, error } = await supabaseAdmin
    .from('bid_outcomes')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('outcome', ['won', 'lost'])
    .order('outcome_date', { ascending: false });

  if (error) throw new Error(`Outcomes fetch: ${error.message}`);

  const outcomes = allOutcomes ?? [];
  const now = new Date().toISOString();

  // Compute rolling stats
  const wins = outcomes.filter((o) => o.outcome === 'won');
  const losses = outcomes.filter((o) => o.outcome === 'lost');
  const totalBids = outcomes.length;
  const winRate = totalBids > 0 ? Math.round((wins.length / totalBids) * 100 * 10) / 10 : 0;

  // Trade-level stats
  const tradeMap = new Map<string, { bids: number; wins: number; amounts: number[]; margins: number[] }>();
  for (const o of outcomes) {
    const trade = (o.trade_category as string) ?? 'other';
    if (!tradeMap.has(trade)) tradeMap.set(trade, { bids: 0, wins: 0, amounts: [], margins: [] });
    const t = tradeMap.get(trade)!;
    t.bids++;
    if (o.outcome === 'won') t.wins++;
    if (o.bid_amount) t.amounts.push(o.bid_amount as number);
    if (o.estimated_margin_percent) t.margins.push(o.estimated_margin_percent as number);
  }

  const tradeStats: Record<string, unknown> = {};
  const avgMarginByTrade: Record<string, number> = {};
  for (const [trade, data] of tradeMap.entries()) {
    const wr = data.bids > 0 ? Math.round((data.wins / data.bids) * 100 * 10) / 10 : 0;
    const avgAmt = data.amounts.length > 0 ? Math.round(data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length) : 0;
    const avgMargin = data.margins.length > 0
      ? Math.round((data.margins.reduce((a, b) => a + b, 0) / data.margins.length) * 10) / 10
      : 0;
    tradeStats[trade] = { bids: data.bids, wins: data.wins, win_rate: wr, avg_bid: avgAmt, avg_margin: avgMargin };
    avgMarginByTrade[trade] = avgMargin;
  }

  // Data quality assessment
  let dataQuality: 'insufficient' | 'developing' | 'solid' | 'strong' = 'insufficient';
  if (totalBids >= 50) dataQuality = 'strong';
  else if (totalBids >= 21) dataQuality = 'solid';
  else if (totalBids >= 5) dataQuality = 'developing';

  if (totalBids < 3) {
    // Not enough data for AI analysis — save basic stats only
    await supabaseAdmin.from('bid_intelligence_profiles').upsert(
      {
        tenant_id: tenantId,
        total_bids: totalBids,
        total_wins: wins.length,
        total_losses: losses.length,
        win_rate_percent: winRate,
        trade_stats: tradeStats,
        avg_margin_by_trade: avgMarginByTrade,
        data_quality: dataQuality,
        outcomes_analyzed: totalBids,
        last_analyzed_at: now,
        next_analysis_due: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: now,
      },
      { onConflict: 'tenant_id' },
    );
    return;
  }

  // Build the prompt with full history summary
  const tradeSummary = [...tradeMap.entries()]
    .sort((a, b) => b[1].bids - a[1].bids)
    .map(([t, d]) => `  ${t}: ${d.bids} bids, ${d.wins} wins (${Math.round((d.wins / d.bids) * 100)}% win rate), avg margin ${d.margins.length > 0 ? Math.round(d.margins.reduce((a, b) => a + b, 0) / d.margins.length) : '?'}%`)
    .join('\n');

  const recentLessons = outcomes
    .filter((o) => o.ai_lessons)
    .slice(0, 20)
    .flatMap((o) => ((o.ai_lessons as Array<{ lesson: string; recommendation: string }>) ?? []).map((l) => `- ${l.lesson}: ${l.recommendation}`))
    .slice(0, 30)
    .join('\n');

  const prompt = `
You are a construction business intelligence analyst. Build a comprehensive intelligence profile for this company from their complete bid history.

## Bid History Summary
Total bids analyzed: ${totalBids}
Overall win rate: ${winRate}%
Total wins: ${wins.length} | Total losses: ${losses.length}

Trade performance:
${tradeSummary}

Recent lessons from AI post-mortems:
${recentLessons || 'None yet'}

Recent bid details (last 10):
${outcomes.slice(0, 10).map((o) => `  ${o.trade_category ?? 'unknown'} | ${o.outcome} | $${((o.bid_amount ?? 0) as number).toLocaleString()} | margin ${o.estimated_margin_percent ?? '?'}% | ${o.project_type ?? 'unknown type'}`).join('\n')}

Build a complete, honest intelligence profile. Identify real patterns in the data.
Be specific — say "You win 78% of healthcare projects under $500K" not "You do well in healthcare."
All recommendations must be tied to the data above.
`.trim();

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 6144,
      // thinking: adaptive (use standard create — SDK 0.54 uses enabled/budget_tokens)
      system: `You are an expert construction business intelligence analyst. Build honest, data-driven profiles. Never be vague. Every statement must reference actual patterns from the data provided.`,
      messages: [{ role: 'user', content: prompt }],
    });

    const profile = (JSON.parse((response.content.find((b: {type:string}) => b.type === "text") as {type:string,text:string})?.text ?? "{}")) as z.infer<typeof IntelligenceProfileSchema>;

    const avgMarginWon = wins.length > 0
      ? wins.reduce((sum, o) => sum + ((o.estimated_margin_percent as number) ?? 0), 0) / wins.length
      : null;

    const avgBidAmount = outcomes.length > 0
      ? outcomes.reduce((sum, o) => sum + ((o.bid_amount as number) ?? 0), 0) / outcomes.length
      : null;

    const totalRevenue = wins.reduce((sum, o) => sum + ((o.bid_amount as number) ?? 0), 0);

    await supabaseAdmin.from('bid_intelligence_profiles').upsert(
      {
        tenant_id: tenantId,
        total_bids: totalBids,
        total_wins: wins.length,
        total_losses: losses.length,
        win_rate_percent: winRate,
        avg_margin_won: avgMarginWon ? Math.round(avgMarginWon * 10) / 10 : null,
        avg_bid_amount: avgBidAmount ? Math.round(avgBidAmount) : null,
        total_revenue_won: totalRevenue,
        trade_stats: tradeStats,
        avg_margin_by_trade: profile.avg_margin_by_trade,
        market_position: profile.market_position,
        core_strengths: profile.core_strengths,
        areas_to_improve: profile.areas_to_improve,
        ideal_project_profile: profile.ideal_project_profile,
        bid_strategy_text: profile.bid_strategy_text,
        pricing_strategy_text: profile.pricing_strategy_text,
        scope_strategy_text: profile.scope_strategy_text,
        top_recommendations: profile.top_recommendations,
        profile_summary: profile.profile_summary,
        data_quality: profile.data_quality,
        outcomes_analyzed: totalBids,
        last_analyzed_at: now,
        next_analysis_due: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // daily
        updated_at: now,
      },
      { onConflict: 'tenant_id' },
    );
  } catch (err) {
    console.error('[BidIntelligence] Profile build error:', err instanceof Error ? err.message : err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Score a New Bid Opportunity
// ─────────────────────────────────────────────────────────────────────────────

export type OpportunityInput = {
  tenantId: string;
  opportunityTitle: string;
  description: string;
  tradeCategory?: string;
  projectType?: string;
  location?: string;
  estimatedValue?: number;
  bidDueDate?: string;
  projectStartDate?: string;
  projectDurationDays?: number;
  ownerName?: string;
  gcName?: string;
  source?: string;
  sourceUrl?: string;
};

export async function scoreBidOpportunity(opts: OpportunityInput): Promise<string> {
  // Fetch company profile, recent outcomes, AND current active project load (capacity)
  const [profileRes, outcomesRes, activeProjectsRes] = await Promise.all([
    supabaseAdmin
      .from('bid_intelligence_profiles')
      .select('*')
      .eq('tenant_id', opts.tenantId)
      .maybeSingle(),
    supabaseAdmin
      .from('bid_outcomes')
      .select('trade_category, project_type, outcome, bid_amount, estimated_margin_percent, ai_scope_fit_score, outcome_date, lost_reason')
      .eq('tenant_id', opts.tenantId)
      .in('outcome', ['won', 'lost'])
      .order('outcome_date', { ascending: false })
      .limit(25),
    supabaseAdmin
      .from('projects')
      .select('id, name, status')
      .eq('tenant_id', opts.tenantId)
      .in('status', ['active', 'awarded']),
  ]);

  const profileRow = profileRes.data;
  const similarOutcomes = outcomesRes.data ?? [];
  const activeProjects = activeProjectsRes.data ?? [];

  // Capacity utilization — too busy = must demand higher margin
  const activeCount = activeProjects.length;
  let capacityNote = '';
  let minMarginForCapacity = 0;
  if (activeCount >= 8) {
    capacityNote = `⚠️ HIGH CAPACITY: ${activeCount} active projects. Only pursue this if margin ≥ 18%. Crew is stretched.`;
    minMarginForCapacity = 18;
  } else if (activeCount >= 5) {
    capacityNote = `MODERATE CAPACITY: ${activeCount} active projects. Recommend margin ≥ 15% to justify taking on additional work.`;
    minMarginForCapacity = 15;
  } else if (activeCount <= 2) {
    capacityNote = `LOW CAPACITY: Only ${activeCount} active projects. Good time to bid aggressively — consider 12-13% margin to win volume.`;
    minMarginForCapacity = 12;
  } else {
    capacityNote = `NORMAL CAPACITY: ${activeCount} active projects. Standard margin targets apply.`;
    minMarginForCapacity = 14;
  }

  // Build trade-specific win rate from recent history
  const tradeWins = similarOutcomes.filter(o => o.outcome === 'won' && o.trade_category === opts.tradeCategory);
  const tradeLosses = similarOutcomes.filter(o => o.outcome === 'lost' && o.trade_category === opts.tradeCategory);
  const tradeWinRate = tradeWins.length + tradeLosses.length > 0
    ? Math.round(tradeWins.length / (tradeWins.length + tradeLosses.length) * 100)
    : null;

  const avgWinMargin = tradeWins.length > 0
    ? Math.round(tradeWins.reduce((s, o) => s + (Number(o.estimated_margin_percent) || 0), 0) / tradeWins.length * 10) / 10
    : null;

  const profileSummary = profileRow ? `
COMPANY INTELLIGENCE PROFILE:
- Overall win rate: ${profileRow.win_rate_percent}%
- Market position: ${profileRow.market_position ?? 'unknown'}
- Average winning margin: ${profileRow.avg_margin_won ?? '?'}%
- Trade performance: ${JSON.stringify(profileRow.trade_stats ?? {})}
- Ideal project type: ${JSON.stringify(profileRow.ideal_project_profile ?? {})}
- Bid strategy: ${profileRow.bid_strategy_text ?? 'Not yet established'}
- Pricing strategy: ${profileRow.pricing_strategy_text ?? 'Not yet established'}
`.trim() : 'No company profile yet — limited history available.';

  const tradeHistory = `
TRADE-SPECIFIC HISTORY (${opts.tradeCategory ?? 'this category'}):
- Win rate in this trade: ${tradeWinRate !== null ? `${tradeWinRate}%` : 'No history'}
- Average winning margin: ${avgWinMargin !== null ? `${avgWinMargin}%` : 'No history'}
- Recent wins: ${tradeWins.slice(0,3).map(o => `$${Number(o.bid_amount ?? 0).toLocaleString()} at ${o.estimated_margin_percent}% margin`).join(', ') || 'None'}
- Recent losses: ${tradeLosses.slice(0,3).map(o => `$${Number(o.bid_amount ?? 0).toLocaleString()} — ${o.lost_reason ?? 'reason unknown'}`).join(', ') || 'None'}
`.trim();

  const prompt = `
You are a senior construction bid strategy advisor with 25+ years of experience. You specialize in helping GCs decide WHICH bids to pursue and at WHAT margin.

${profileSummary}

${tradeHistory}

CURRENT CAPACITY:
${capacityNote}
Minimum margin justified by capacity: ${minMarginForCapacity}%

## OPPORTUNITY TO EVALUATE
Title: ${opts.opportunityTitle}
Description: ${opts.description}
Trade/Category: ${opts.tradeCategory ?? 'Not specified'}
Project Type: ${opts.projectType ?? 'Not specified'}
Location: ${opts.location ?? 'Not specified'}
Estimated Value: ${opts.estimatedValue ? `$${opts.estimatedValue.toLocaleString()}` : 'Not specified'}
Bid Due: ${opts.bidDueDate ?? 'Not specified'}
Owner: ${opts.ownerName ?? 'Not specified'}
GC: ${opts.gcName ?? 'Not specified'}
Project Duration: ${opts.projectDurationDays ? `${opts.projectDurationDays} days` : 'Not specified'}

SCORING INSTRUCTIONS:
1. Base fit score on: trade match, project type history, location, size vs. past wins
2. Win probability must account for: current capacity (${activeCount} active), trade win rate, margin competitiveness
3. Suggested bid range MUST reflect: historical winning margins for this trade + capacity premium
4. Capacity minimum margin (${minMarginForCapacity}%) is a hard floor — never recommend below it given current workload
5. If company has no history in this trade/type, say so clearly and score conservatively (fit ≤ 40)
6. Be direct: "BID", "PASS", "INVESTIGATE", or "BID_WITH_PARTNER" — no hedging
`.trim();

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    // thinking: adaptive (use standard create — SDK 0.54 uses enabled/budget_tokens)
    system: `You are an expert construction bid strategy advisor. Score opportunities ruthlessly honestly. A high fit score should only be given when the data clearly supports it. Low win probability should be stated clearly even if it's uncomfortable.`,
    messages: [{ role: 'user', content: prompt }],
  });

  const score = (JSON.parse((response.content.find((b: {type:string}) => b.type === "text") as {type:string,text:string})?.text ?? "{}")) as z.infer<typeof OpportunityScoreSchema>;
  const now = new Date().toISOString();

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('bid_opportunity_scores')
    .insert({
      tenant_id: opts.tenantId,
      opportunity_title: opts.opportunityTitle,
      opportunity_description: opts.description,
      trade_category: opts.tradeCategory ?? null,
      project_type: opts.projectType ?? null,
      location: opts.location ?? null,
      estimated_value: opts.estimatedValue ?? null,
      bid_due_date: opts.bidDueDate ?? null,
      project_start_date: opts.projectStartDate ?? null,
      project_duration_days: opts.projectDurationDays ?? null,
      owner_name: opts.ownerName ?? null,
      gc_name: opts.gcName ?? null,
      source: opts.source ?? 'manual',
      source_url: opts.sourceUrl ?? null,
      fit_score: score.fit_score,
      win_probability: score.win_probability,
      recommended_action: score.recommended_action,
      scope_alignment_score: score.scope_alignment_score,
      capacity_score: score.capacity_score,
      relationship_score: score.relationship_score,
      competition_score: score.competition_score,
      margin_potential_score: score.margin_potential_score,
      suggested_bid_low: score.suggested_bid_low,
      suggested_bid_high: score.suggested_bid_high,
      suggested_margin_pct: score.suggested_margin_pct,
      bid_recommendation_text: score.bid_recommendation_text,
      why_we_win: score.why_we_win,
      key_risks: score.key_risks,
      ai_model: 'claude-opus-4-6',
      ai_analyzed_at: now,
      status: 'new',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    throw new Error(`Opportunity score insert: ${insertErr?.message ?? 'null result'}`);
  }

  return inserted.id as string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Get Bid Strategy for an Active Bid Package
// ─────────────────────────────────────────────────────────────────────────────

export type BidStrategyResult = {
  recommended_bid_range: { low: number; high: number };
  recommended_margin_pct: number;
  scope_recommendations: string[];
  competitive_positioning: string;
  win_probability_estimate: number;
  strategy_narrative: string;
  top_risks: string[];
  go_no_go: 'go' | 'go_with_caution' | 'no_go';
  go_no_go_rationale: string;
};

export async function getBidStrategy(opts: {
  tenantId: string;
  bidPackageId: string;
  opportunityId?: string;
}): Promise<BidStrategyResult> {
  const [packageRes, jacketRes, profileRes] = await Promise.all([
    supabaseAdmin
      .from('bid_packages')
      .select('*, bid_package_items(*)')
      .eq('id', opts.bidPackageId)
      .single(),

    supabaseAdmin
      .from('bid_jackets')
      .select('project_summary, scope_of_work, qualification_requirements, insurance_requirements')
      .eq('bid_package_id', opts.bidPackageId)
      .maybeSingle(),

    supabaseAdmin
      .from('bid_intelligence_profiles')
      .select('*')
      .eq('tenant_id', opts.tenantId)
      .maybeSingle(),
  ]);

  const pkg = packageRes.data as Record<string, unknown>;
  const jacket = jacketRes.data as Record<string, unknown> | null;
  const profile = profileRes.data as Record<string, unknown> | null;

  const itemLines = ((pkg.bid_package_items as Array<Record<string, unknown>>) ?? [])
    .map((i) => `  ${i.code}: ${i.title} | ${i.quantity} ${i.uom}`)
    .join('\n');

  const BidStrategyOutputSchema = z.object({
    recommended_bid_range: z.object({ low: z.number(), high: z.number() }),
    recommended_margin_pct: z.number(),
    scope_recommendations: z.array(z.string()),
    competitive_positioning: z.string(),
    win_probability_estimate: z.number().int().min(0).max(100),
    strategy_narrative: z.string(),
    top_risks: z.array(z.string()),
    go_no_go: z.enum(['go', 'go_with_caution', 'no_go']),
    go_no_go_rationale: z.string(),
  });

  const prompt = `
You are a construction bid strategy advisor. Give specific, actionable bid strategy for this package.

## Company Profile
${profile
    ? `Win rate: ${profile.win_rate_percent}%, Market position: ${profile.market_position},\nPricing strategy: ${profile.pricing_strategy_text ?? 'unknown'}\nTrade stats: ${JSON.stringify(profile.trade_stats ?? {})}`
    : 'No history yet — base recommendations on industry standards.'
  }

## Bid Package
Name: ${pkg.name as string}
Code: ${pkg.code as string}
Due: ${pkg.due_at as string ?? 'TBD'}

Scope of Work:
${(jacket?.scope_of_work as string) ?? 'No bid jacket generated yet.'}

Line Items:
${itemLines || 'No items defined yet.'}

Provide specific pricing guidance, scope approach, and go/no-go recommendation.
All pricing suggestions must reference the company's historical margins where available.
`.trim();

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 3072,
    // thinking: adaptive (use standard create — SDK 0.54 uses enabled/budget_tokens)
    system: `You are a construction bid strategy expert. Give specific, actionable advice. Base pricing on the company's historical data. Be decisive on go/no-go.`,
    messages: [{ role: 'user', content: prompt }],
  });

  return (JSON.parse((response.content.find((b: {type:string}) => b.type === "text") as {type:string,text:string})?.text ?? "{}")) as BidStrategyResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Get scored opportunity pipeline (sorted by fit + urgency)
// ─────────────────────────────────────────────────────────────────────────────

export async function getOpportunityPipeline(tenantId: string, limit = 20) {
  const { data, error } = await supabaseAdmin
    .from('bid_opportunity_pipeline')  // uses the view
    .select('*')
    .eq('tenant_id', tenantId)
    .limit(limit);

  if (error) throw new Error(`Pipeline fetch: ${error.message}`);
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Namespace export
// ─────────────────────────────────────────────────────────────────────────────

export const BidIntelligence = {
  recordBidOutcome,
  buildIntelligenceProfile,
  scoreBidOpportunity,
  getBidStrategy,
  getOpportunityPipeline,
};

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case 'profile': {
      const [tenantId] = args;
      if (!tenantId) { console.error('Usage: bid-intelligence.ts profile <tenantId>'); process.exit(1); }
      console.log('Rebuilding intelligence profile...');
      await buildIntelligenceProfile(tenantId);
      console.log('Done.');
      break;
    }
    case 'score': {
      const [tenantId, title, description, tradeCategory, estimatedValue] = args;
      if (!tenantId || !title || !description) {
        console.error('Usage: bid-intelligence.ts score <tenantId> <title> <description> [trade] [value]');
        process.exit(1);
      }
      const id = await scoreBidOpportunity({
        tenantId, opportunityTitle: title, description,
        tradeCategory, estimatedValue: estimatedValue ? Number(estimatedValue) : undefined,
      });
      console.log(`Opportunity scored. ID: ${id}`);
      break;
    }
    default:
      console.error('Commands: profile | score');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
