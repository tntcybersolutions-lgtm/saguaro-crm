import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const db = createServerClient();

    const { data: pkg } = await db
      .from('bid_packages')
      .select('*, bid_submissions(*)')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const subs = ((pkg.bid_submissions || []) as Array<{
      id: string;
      sub_name?: string;
      company_name?: string;
      base_bid?: number;
      base_amount?: number;
      inclusions?: string;
      exclusions?: string;
      scope_notes?: string;
      clarifications?: string;
      schedule_days?: number;
      bond_available?: boolean;
      insurance_meets?: boolean;
    }>);

    if (subs.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 bids to level' }, { status: 400 });
    }

    const client = new Anthropic();

    const bidSummaries = subs.map((s, i) => `
BID ${i + 1}: ${s.company_name || s.sub_name || 'Unknown'}
  Base Bid: $${Number(s.base_bid || s.base_amount || 0).toLocaleString()}
  Schedule: ${s.schedule_days || 'Not stated'} days
  Bond: ${s.bond_available ? 'Yes' : 'No'}
  Insurance: ${s.insurance_meets ? 'Confirmed' : 'Unconfirmed'}
  Inclusions: ${s.inclusions || 'None stated'}
  Exclusions: ${s.exclusions || 'None stated'}
  Clarifications: ${s.clarifications || 'None'}
  Scope Notes: ${s.scope_notes || 'None'}
`).join('\n');

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: `You are an expert construction bid analyst. Analyze multiple bids for the same scope of work.
Identify scope gaps between bidders, flag missing inclusions, assess risk, and recommend the best value bid.
Be specific about dollar amounts. Use construction industry terminology.
Respond ONLY with valid JSON matching this schema exactly:
{
  "summary": "2-3 sentence overall analysis",
  "low_bid_warning": "string or null — warn if low bid is suspiciously low",
  "recommended_bid_id_index": number (0-based index of recommended bid),
  "recommendation_reason": "string",
  "bids": [
    {
      "index": 0,
      "risk_score": 1-10,
      "adjusted_amount": number,
      "scope_gaps": ["string array of missing scope items"],
      "sage_analysis": "2-3 sentence analysis of this specific bid",
      "is_recommended": boolean
    }
  ]
}`,
      messages: [{
        role: 'user',
        content: `Package: ${pkg.name}\nEstimated Value: $${Number(pkg.estimated_value || 0).toLocaleString()}\n\n${bidSummaries}\n\nLevel these bids.`,
      }],
    });

    const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : '{}';
    let analysis: {
      summary?: string;
      low_bid_warning?: string;
      recommended_bid_id_index?: number;
      recommendation_reason?: string;
      bids?: Array<{
        index?: number;
        risk_score?: number;
        adjusted_amount?: number;
        scope_gaps?: string[];
        sage_analysis?: string;
        is_recommended?: boolean;
      }>;
    };
    try {
      const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      analysis = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
    } catch {
      return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 });
    }

    const updates = (analysis.bids || []).map(async (bid) => {
      const sub = subs[bid.index ?? 0];
      if (!sub) return;
      const gaps = Array.isArray(bid.scope_gaps) ? bid.scope_gaps : [];
      const analysisText = [
        bid.sage_analysis || '',
        gaps.length ? `Scope gaps: ${gaps.join('; ')}` : '',
      ].filter(Boolean).join('\n\n');
      const levelingText = [
        analysis.summary || '',
        bid.is_recommended && analysis.recommendation_reason
          ? `Recommended: ${analysis.recommendation_reason}`
          : '',
      ].filter(Boolean).join('\n\n');

      await db
        .from('bid_submissions')
        .update({
          risk_score: bid.risk_score ?? null,
          adjusted_amount: bid.adjusted_amount ?? null,
          sage_analysis: analysisText || null,
          is_recommended: bid.is_recommended ?? false,
          is_low_bid: bid.index === 0 && !!analysis.low_bid_warning,
          leveling_notes: levelingText || null,
        })
        .eq('id', sub.id)
        .eq('tenant_id', user.tenantId);
    });

    await Promise.all(updates);

    return NextResponse.json({ success: true, analysis });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
