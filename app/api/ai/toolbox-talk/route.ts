import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { project_id, trades, topic, language } = body;

    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    const db = createServerClient();

    // Fetch active trades from project if not provided
    let activeTrades = trades || [];
    if (!trades || trades.length === 0) {
      const { data: teamData } = await db
        .from('project_team')
        .select('trade, company_name')
        .eq('project_id', project_id)
        .eq('tenant_id', user.tenantId)
        .not('trade', 'is', null);

      activeTrades = [...new Set((teamData || []).map((t: any) => t.trade).filter(Boolean))];
    }

    // Fetch recent incidents or observations for context
    const { data: recentObs } = await db
      .from('observations')
      .select('title, category, severity, status')
      .eq('project_id', project_id)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })
      .limit(5);

    const { data: projectData } = await db
      .from('projects')
      .select('name')
      .eq('id', project_id)
      .eq('tenant_id', user.tenantId)
      .single();

    const today = new Date();
    const month = today.toLocaleString('en-US', { month: 'long' });

    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Generate an OSHA-compliant toolbox talk for a construction project.

Project: ${projectData?.name || 'Construction Project'}
Date: ${today.toISOString().split('T')[0]}
Month: ${month}
Active Trades: ${activeTrades.join(', ') || 'General construction'}
${topic ? `Specific Topic Requested: ${topic}` : 'Select an appropriate seasonal/trade-relevant topic'}
${language ? `Language: ${language}` : ''}
Recent Safety Observations: ${JSON.stringify(recentObs || [])}

Generate a structured toolbox talk with:
1. Title
2. Topic overview (2-3 sentences)
3. Key hazards (3-5 bullet points)
4. Safe work practices (3-5 bullet points)
5. Required PPE
6. Discussion questions (2-3 questions)
7. Relevant OSHA standard references

Return as JSON: {
  "title": "...",
  "overview": "...",
  "hazards": [...],
  "safe_practices": [...],
  "required_ppe": [...],
  "discussion_questions": [...],
  "osha_references": [...],
  "estimated_duration_minutes": N
}`,
      }],
    });

    let toolboxTalk: any = {};
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) toolboxTalk = JSON.parse(jsonMatch[0]);
    } catch {
      toolboxTalk = { title: 'Toolbox Talk', overview: responseText };
    }

    // Save the generated talk
    const { data: saved, error: saveError } = await db
      .from('safety_talks')
      .insert({
        tenant_id: user.tenantId,
        project_id,
        title: toolboxTalk.title || 'Toolbox Talk',
        content: toolboxTalk,
        trades: activeTrades,
        generated_by: user.id,
        talk_date: today.toISOString().split('T')[0],
      })
      .select()
      .single();

    if (saveError) {
      // Return the talk even if save fails
      return NextResponse.json({ talk: toolboxTalk, saved: false });
    }

    return NextResponse.json({ talk: toolboxTalk, record: saved, saved: true }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
