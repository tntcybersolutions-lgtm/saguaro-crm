import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('toolbox_talks')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('talk_date', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ talks: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    if (!body.topic || !body.talk_date) {
      return NextResponse.json({ error: 'topic and talk_date are required' }, { status: 400 });
    }

    let aiContent: string | null = null;
    if (body.generate_ai && process.env.ANTHROPIC_API_KEY) {
      try {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const msg = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          messages: [{
            role: 'user',
            content: `Write a 10-15 minute toolbox safety talk for construction workers on the topic: "${body.topic}".
Include: (1) Why this matters — real statistics, (2) Key hazards to watch for, (3) Step-by-step safe work procedures, (4) PPE requirements, (5) What to do if something goes wrong.
Format for a superintendent to read aloud. Plain language, no jargon. Around 400-500 words.`,
          }],
        });
        const first = msg.content[0];
        if (first && first.type === 'text') aiContent = first.text;
      } catch {
        // Non-fatal — talk still gets saved without AI content
      }
    }

    const db = createServerClient();
    const attendees = Array.isArray(body.attendees) ? body.attendees : [];
    const { data, error } = await db
      .from('toolbox_talks')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        topic: body.topic,
        presenter: body.presenter || null,
        talk_date: body.talk_date,
        duration_minutes: body.duration_minutes || 15,
        attendees,
        attendee_count: body.attendee_count || attendees.length,
        content: body.content || null,
        ai_generated_content: aiContent,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ talk: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
