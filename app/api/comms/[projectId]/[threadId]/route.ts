import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string; threadId: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { threadId } = await params;
  const db = createServerClient();

  try {
    const [threadRes, messagesRes] = await Promise.all([
      db.from('sub_communications').select('*').eq('id', threadId).eq('tenant_id', user.tenantId).single(),
      db.from('sub_messages').select('*').eq('thread_id', threadId).eq('tenant_id', user.tenantId).order('created_at', { ascending: true }),
    ]);

    if (threadRes.error || !threadRes.data) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });

    return NextResponse.json({
      thread: threadRes.data,
      messages: messagesRes.data || [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string; threadId: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { threadId } = await params;
  const db = createServerClient();
  const body = await req.json();

  if (!body.message_text) return NextResponse.json({ error: 'Missing required field: message_text' }, { status: 400 });

  try {
    const { data, error } = await db
      .from('sub_messages')
      .insert({
        tenant_id: user.tenantId,
        thread_id: threadId,
        sender_type: body.sender_type || 'gc',
        sender_name: body.sender_name || user.email,
        message_text: body.message_text,
        is_sage_generated: body.is_sage_generated || false,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Update thread
    await db.from('sub_communications')
      .update({
        last_message_at: new Date().toISOString(),
        status: body.sender_type === 'sub' ? 'responded' : 'awaiting_response',
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId)
      .eq('tenant_id', user.tenantId);

    return NextResponse.json({ data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
