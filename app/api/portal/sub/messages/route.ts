import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

async function authenticateSubPortal(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .single();

  return session;
}

/** GET — List messages for sub's project channel */
export async function GET(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    const db = createServerClient();

    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '100', 10);
    const before = req.nextUrl.searchParams.get('before');

    let query = db
      .from('portal_sub_messages')
      .select('*')
      .eq('project_id', session.project_id)
      .eq('sub_id', session.sub_id)
      .eq('tenant_id', session.tenant_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data: messages, error } = await query;

    if (error) throw error;

    return NextResponse.json({ messages: (messages || []).reverse() });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/** POST — Send a message as the sub */
export async function POST(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    const db = createServerClient();
    const body = await req.json();
    const { content, attachments } = body;

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: 'Message content is required' },
        { status: 400 }
      );
    }

    const { data: message, error } = await db
      .from('portal_sub_messages')
      .insert({
        sub_id: session.sub_id,
        project_id: session.project_id,
        tenant_id: session.tenant_id,
        sender_type: 'sub',
        sender_id: session.sub_id,
        content: content.trim(),
        attachments: attachments || [],
        read: false,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(
      { message, status: 'sent' },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/** PATCH — Mark messages as read */
export async function PATCH(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    const db = createServerClient();
    const body = await req.json();
    const { message_ids } = body;

    if (!message_ids || !Array.isArray(message_ids) || message_ids.length === 0) {
      return NextResponse.json(
        { error: 'message_ids array is required' },
        { status: 400 }
      );
    }

    // Only mark messages that are sent TO this sub (sender_type != 'sub')
    const { error } = await db
      .from('portal_sub_messages')
      .update({
        read: true,
        read_at: new Date().toISOString(),
      })
      .in('id', message_ids)
      .eq('sub_id', session.sub_id)
      .eq('tenant_id', session.tenant_id)
      .neq('sender_type', 'sub');

    if (error) throw error;

    return NextResponse.json({ message: 'Messages marked as read' });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
