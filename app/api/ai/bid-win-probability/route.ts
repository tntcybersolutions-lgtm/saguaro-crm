import { NextRequest, NextResponse } from 'next/server';
import { requireAnyPermission, PROPOSAL_MONEY } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(req: NextRequest) {
  // Reads past bid amounts. Bid and proposal dollars: Sales or Budget (PROPOSAL_MONEY, lib/permissions).
  const g = await requireAnyPermission(req, PROPOSAL_MONEY, 'View');
  if (!g.ok) return g.res;
  const user = g.user;

  const body = await req.json().catch(() => ({}));
  const db = createServerClient();
  const tenantId = user.tenantId;

  // Fetch historical bid submissions to establish win rate
  const { data: historicalBids } = await db
    .from('bid_submissions')
    .select('id, amount, status, is_awarded, sub_name')
    .eq('tenant_id', tenantId)
    .in('status', ['awarded', 'not_awarded'])
    .limit(50);

  const bids = (historicalBids || []) as any[];
  const wins = bids.filter((b: any) => b.is_awarded || b.status === 'awarded').length;
  const historicalWinRate = bids.length > 0 ? Math.round(wins / bids.length * 100) : null;

  // Current bid being analyzed
  const { trade, bidAmount, competitorCount, projectBudget, scopeSummary, yourStrengths } = body;

  const prompt = `You are a construction bidding expert. Analyze the probability of winning this bid.

Historical performance: ${bids.length > 0 ? `${wins} wins from ${bids.length} bids (${historicalWinRate}% win rate)` : 'No historical bid data available'}

Current bid:
- Trade: ${trade || 'Unknown'}
- Your bid amount: $${(bidAmount || 0).toLocaleString()}
- Project budget: $${(projectBudget || 0).toLocaleString()}
- Number of competitors: ${competitorCount || 'Unknown'}
- Scope summary: ${scopeSummary || 'Not provided'}
- Your strengths: ${yourStrengths || 'Not provided'}

Return JSON:
{
  "win_probability": number (0-100),
  "confidence": number (0-100),
  "price_position": "too_high" | "competitive" | "too_low" | "unknown",
  "key_factors": string[],
  "risks": string[],
  "recommendations": string[],
  "summary": string
}

Return only the raw JSON, no markdown.`;

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content?.[0]?.type === 'text' ? (message.content[0] as any).text : '';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    }

    return NextResponse.json({ ...parsed, historicalWinRate, historicalBidCount: bids.length });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[ai/bid-win-probability] error:', msg);
    return NextResponse.json({
      win_probability: historicalWinRate ?? 50,
      confidence: 40,
      price_position: 'unknown',
      key_factors: ['Historical win rate used as baseline'],
      risks: ['AI analysis unavailable'],
      recommendations: ['Ensure competitive pricing vs. project budget'],
      summary: 'Estimate based on historical win rate only.',
      historicalWinRate,
      historicalBidCount: bids.length,
    });
  }
}
