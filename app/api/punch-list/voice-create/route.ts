import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServerClient();
  const body = await req.json();
  const { transcript, projectId } = body;

  if (!transcript) return NextResponse.json({ error: 'Missing required field: transcript' }, { status: 400 });
  if (!projectId) return NextResponse.json({ error: 'Missing required field: projectId' }, { status: 400 });

  try {
    const anthropic = new Anthropic();

    const aiResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are a construction punch list parser. Parse this voice transcript into structured punch list items.

TRANSCRIPT: "${transcript}"

Return a JSON array of punch list items:
[
  {
    "title": "short descriptive title",
    "description": "detailed description from transcript",
    "location": "location mentioned or 'TBD'",
    "trade": "responsible trade (e.g., Electrical, Plumbing, Drywall, Paint, HVAC, etc.)",
    "priority": "critical|high|medium|low",
    "category": "deficiency|incomplete|damage|cosmetic|safety"
  }
]

Parse each distinct issue mentioned. If multiple issues, create multiple items. If no location mentioned, use "TBD". Infer the trade from context.`,
      }],
    });

    const responseText = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : '';

    let punchItems: any[] = [];
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) punchItems = JSON.parse(jsonMatch[0]);
    } catch { /* use empty array */ }

    if (punchItems.length === 0) {
      return NextResponse.json({ error: 'Could not parse punch items from transcript' }, { status: 400 });
    }

    // Insert all parsed items into punch_list
    const rows = punchItems.map((item: any) => ({
      tenant_id: user.tenantId,
      project_id: projectId,
      title: item.title,
      description: item.description,
      location: item.location || 'TBD',
      trade: item.trade || 'General',
      priority: item.priority || 'medium',
      status: 'open',
      source: 'voice',
      created_by: user.id,
    }));

    const { data, error } = await db
      .from('punch_list')
      .insert(rows)
      .select();

    if (error) throw error;

    return NextResponse.json({
      data,
      parsed_count: punchItems.length,
      items: punchItems,
    }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
