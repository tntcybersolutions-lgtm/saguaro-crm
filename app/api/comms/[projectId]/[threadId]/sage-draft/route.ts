import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string; threadId: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, threadId } = await params;
  const db = createServerClient();
  const body = await req.json();
  const { draft_intent } = body;

  if (!draft_intent) return NextResponse.json({ error: 'Missing required field: draft_intent' }, { status: 400 });

  try {
    // Load thread context
    const [threadRes, messagesRes, projectRes] = await Promise.all([
      db.from('sub_communications').select('*').eq('id', threadId).eq('tenant_id', user.tenantId).single(),
      db.from('sub_messages').select('sender_name, sender_type, message_text, created_at').eq('thread_id', threadId).eq('tenant_id', user.tenantId).order('created_at', { ascending: true }).limit(10),
      db.from('projects').select('name').eq('id', projectId).eq('tenant_id', user.tenantId).single(),
    ]);

    const thread = threadRes.data;
    const messages = messagesRes.data || [];
    const project = projectRes.data;

    const anthropic = new Anthropic();

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are a professional construction project manager drafting formal correspondence.

PROJECT: ${project?.name || 'Construction Project'}
THREAD SUBJECT: ${thread?.subject || 'General'}
SUB COMPANY: ${thread?.sub_company || 'Subcontractor'}

CONVERSATION HISTORY:
${messages.map((m: any) => `[${m.sender_type}] ${m.sender_name}: ${m.message_text}`).join('\n')}

GC'S INTENT (what they want to communicate):
${draft_intent}

Write a professional construction project letter/message that:
1. Is formal but direct
2. References the project and subject appropriately
3. Clearly communicates the GC's intent
4. Maintains a professional tone suitable for construction industry
5. Includes any necessary follow-up actions or deadlines

Return ONLY the message text, no JSON wrapping.`,
      }],
    });

    const draftText = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : '';

    return NextResponse.json({ draft: draftText });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
