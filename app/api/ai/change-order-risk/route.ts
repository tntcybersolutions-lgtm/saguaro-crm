import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  try {
    const client = new Anthropic();

    const prompt = `You are a construction claims expert. Analyze this change order for approval risk:

Title: ${body.title || ''}
Description: ${body.description || ''}
Cost Impact: $${body.cost_impact || 0}
Schedule Impact: ${body.schedule_impact || 0} days
Reason: ${body.reason || ''}

Return a JSON object with:
{
  "risk_level": "low" | "medium" | "high",
  "approval_likelihood": number (0-100),
  "flags": string[] (list of specific concerns),
  "recommendations": string[] (how to improve approval odds),
  "summary": string (1-2 sentence summary)
}

Return only the raw JSON object, no markdown or code fences.`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const firstBlock = message.content?.[0];
    const responseText = firstBlock?.type === 'text' ? (firstBlock as { type: 'text'; text: string }).text : '';

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      // Strip any accidental markdown fences and retry
      const cleaned = responseText
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      parsed = JSON.parse(cleaned);
    }

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[ai/change-order-risk] error:', msg);
    return NextResponse.json({ risk_level: 'unknown', error: 'Internal server error' });
  }
}
