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

    const prompt = `You are a construction schedule expert. Analyze this project schedule data and predict delays:

Activities: ${JSON.stringify(body.activities || [])}
Weather days lost: ${body.weather_days_lost || 0}
Planned crew: ${body.crew_count_planned || 0}, Actual crew: ${body.crew_count_actual || 0}
Pending change orders: ${body.change_orders_count || 0}

Return JSON:
{
  "predicted_delay_days": number,
  "confidence": number (0-100),
  "risk_factors": string[],
  "critical_path_activities": string[],
  "recommendations": string[],
  "summary": string
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
      const cleaned = responseText
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      parsed = JSON.parse(cleaned);
    }

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[ai/schedule-predict] error:', msg);
    return NextResponse.json({ predicted_delay_days: 0, error: 'Internal server error' });
  }
}
