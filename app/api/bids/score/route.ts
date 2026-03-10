// app/api/bids/score/route.ts
// POST /api/bids/score
// AI-powered bid competitiveness scoring using Claude claude-sonnet-4-6.
// Falls back to deterministic scoring when ANTHROPIC_API_KEY is absent.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildBidHistoryContext } from '@/lib/construction-intelligence';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoreRequest {
  projectName: string;
  projectType?: string;
  estimatedValue: number;
  trade?: string;
  location?: string;
  competitorCount?: number;
  ourMargin: number;
}

interface ScoreResponse {
  score: number;
  recommendation: 'bid' | 'pass' | 'negotiate';
  reasoning: string;
  suggestedMargin: number;
  riskFactors: string[];
  winProbability: number;
}

// ─── Deterministic Demo Scorer ────────────────────────────────────────────────

function demoScore(body: ScoreRequest): ScoreResponse {
  const { estimatedValue, ourMargin, competitorCount = 4 } = body;

  // Base score starts at 70; adjust for margin and competitor pressure
  let score = 70;
  if (ourMargin <= 10) score += 15;
  else if (ourMargin <= 15) score += 8;
  else if (ourMargin >= 20) score -= 10;

  if (competitorCount <= 2) score += 10;
  else if (competitorCount >= 6) score -= 12;

  if (estimatedValue > 10_000_000) score -= 5; // larger jobs more competitive
  if (estimatedValue < 500_000) score += 5;

  score = Math.max(10, Math.min(98, score));

  const winProbability = Math.round(score * 0.85);
  let recommendation: 'bid' | 'pass' | 'negotiate' = 'bid';
  if (score < 35) recommendation = 'pass';
  else if (score < 55) recommendation = 'negotiate';

  const suggestedMargin =
    ourMargin > 18 ? parseFloat((ourMargin * 0.88).toFixed(1)) : ourMargin;

  const riskFactors: string[] = [];
  if (competitorCount >= 5) riskFactors.push(`High competition (${competitorCount} bidders expected)`);
  if (ourMargin > 18) riskFactors.push('Margin above typical win zone — consider sharpening');
  if (estimatedValue > 8_000_000) riskFactors.push('Large project value increases risk exposure');
  if (!body.location) riskFactors.push('Location not specified — verify prevailing wage requirements');

  return {
    score,
    recommendation,
    reasoning: `Based on your margin of ${ourMargin}% against ~${competitorCount} competitors on a $${estimatedValue.toLocaleString()} ${body.projectType ?? 'project'}, your competitiveness score is ${score}/100. ${recommendation === 'bid' ? 'Historical data supports pursuing this opportunity.' : recommendation === 'negotiate' ? 'Consider refining scope or value-engineering before submitting.' : 'Risk-adjusted return does not support bidding at current margin.'}`,
    suggestedMargin,
    riskFactors,
    winProbability,
  };
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: ScoreRequest = await req.json();

    const { projectName, projectType, estimatedValue, trade, location, competitorCount, ourMargin } = body;

    if (!projectName || typeof estimatedValue !== 'number' || typeof ourMargin !== 'number') {
      return NextResponse.json(
        { error: 'projectName, estimatedValue, and ourMargin are required.' },
        { status: 400 },
      );
    }

    // If no Anthropic key, return deterministic demo score
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ ...demoScore(body), source: 'demo' });
    }

    // Build bid history context for the tenant
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

    const bidHistoryContext = tenantId
      ? await buildBidHistoryContext(supabase, tenantId, projectType)
      : 'No bid history available.';

    // Call Claude claude-sonnet-4-6
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = `You are an expert construction bid strategist with 20+ years of GC experience. You analyze bid opportunities and provide data-driven scoring and recommendations.

${bidHistoryContext}

Always respond with valid JSON matching this exact structure:
{
  "score": <integer 0-100>,
  "recommendation": <"bid" | "pass" | "negotiate">,
  "reasoning": <string, 2-4 sentences>,
  "suggestedMargin": <number, 1 decimal place>,
  "riskFactors": [<string>, ...],
  "winProbability": <integer 0-100>
}`;

    const userPrompt = `Score this bid opportunity:
- Project: ${projectName}
- Type: ${projectType ?? 'Not specified'}
- Estimated Value: $${estimatedValue.toLocaleString()}
- Primary Trade: ${trade ?? 'General'}
- Location: ${location ?? 'Not specified'}
- Competitors Expected: ${competitorCount ?? 'Unknown'}
- Our Proposed Margin: ${ourMargin}%

Provide a competitiveness score, win probability, suggested margin, risk factors, and a clear bid/pass/negotiate recommendation.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });

    const rawText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse JSON from Claude response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Fallback if Claude didn't return clean JSON
      return NextResponse.json({ ...demoScore(body), source: 'ai-fallback' });
    }

    const parsed: ScoreResponse = JSON.parse(jsonMatch[0]);

    // Clamp and validate
    const result: ScoreResponse = {
      score: Math.max(0, Math.min(100, Math.round(parsed.score ?? 50))),
      recommendation: ['bid', 'pass', 'negotiate'].includes(parsed.recommendation)
        ? parsed.recommendation
        : 'bid',
      reasoning: parsed.reasoning ?? '',
      suggestedMargin: parseFloat((parsed.suggestedMargin ?? ourMargin).toFixed(1)),
      riskFactors: Array.isArray(parsed.riskFactors) ? parsed.riskFactors : [],
      winProbability: Math.max(0, Math.min(100, Math.round(parsed.winProbability ?? 50))),
    };

    return NextResponse.json({ ...result, source: 'ai' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
