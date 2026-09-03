import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { publicAiLimiter } from '@/lib/rate-limit';

/**
 * POST /api/discovery/recommend   (public — no auth required)
 *
 * Powers the public /design/discover quiz. Takes the visitor's actual quiz
 * answers and asks Claude for 5 genuinely personalized home-improvement /
 * smart-building recommendations. Returns them in the exact shape the discover
 * page renders: { recommendations: [{ id, title, description, estimated_cost,
 * annual_savings, roi_years }] }.
 *
 * This route has NO tenant/customer context (it is unauthenticated lead-gen),
 * so the honest "real" source of a recommendation is a computation over the
 * user's own answers — not a static list. If Claude is unavailable/misconfigured
 * we return a 502 with an honest error so the page can show an error state,
 * NEVER a fabricated recommendation set.
 */

type Rec = {
  id: string;
  title: string;
  description: string;
  estimated_cost: string;
  annual_savings: string;
  roi_years: number;
};

export async function POST(req: NextRequest) {
  const limited = publicAiLimiter.check(req);
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const answers: Record<string, string> = body?.answers ?? {};

    if (!answers || Object.keys(answers).length === 0) {
      return NextResponse.json(
        { error: 'answers are required' },
        { status: 400 },
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      // Honest "not configured" — do NOT fabricate recommendations.
      return NextResponse.json(
        { error: 'Recommendation engine is not configured' },
        { status: 502 },
      );
    }

    const answersText = Object.entries(answers)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n');

    const prompt = `You are Sage, a home-improvement and smart-building advisor. Based ONLY on the quiz answers below, produce exactly 5 personalized upgrade recommendations tailored to this person's stated project type, budget, priorities, climate, home size, and smart-home comfort level. Keep cost ranges realistic for the chosen budget band and climate. Do NOT invent details the answers don't support.

QUIZ ANSWERS:
${answersText}

Return ONLY a valid JSON array with exactly 5 objects, no markdown. Each object:
- title: short product/system name
- description: 1-2 sentence benefit tied to their answers
- estimated_cost: a realistic dollar RANGE string, e.g. "$3,200 - $5,800"
- annual_savings: a dollar string, e.g. "$840" (use "$0" if there is no direct energy/utility savings)
- roi_years: number (payback in years; use a reasonable estimate, e.g. 6)

JSON only:`;

    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text =
      response.content[0]?.type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'Could not generate recommendations' },
        { status: 502 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any[] = JSON.parse(jsonMatch[0]);
    const recommendations: Rec[] = parsed.slice(0, 5).map((r, i) => ({
      id: String(r.id ?? i + 1),
      title: String(r.title ?? 'Recommendation'),
      description: String(r.description ?? ''),
      estimated_cost: String(r.estimated_cost ?? ''),
      annual_savings: String(r.annual_savings ?? '$0'),
      roi_years:
        typeof r.roi_years === 'number'
          ? r.roi_years
          : Number(r.roi_years) || 0,
    }));

    if (recommendations.length === 0) {
      return NextResponse.json(
        { error: 'Could not generate recommendations' },
        { status: 502 },
      );
    }

    return NextResponse.json({ recommendations });
  } catch {
    return NextResponse.json(
      { error: 'Could not generate recommendations' },
      { status: 502 },
    );
  }
}
