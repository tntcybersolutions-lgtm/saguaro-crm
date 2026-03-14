import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

async function getPortalSession(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_client_sessions')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .single();

  return session;
}

/** GET — list messages for project channel */
export async function GET(req: NextRequest) {
  try {
    const session = await getPortalSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = createServerClient();
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10);
    const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0', 10);

    const { data: messages, error } = await db
      .from('portal_messages')
      .select('*')
      .eq('project_id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Count unread messages for the client
    const { count: unreadCount } = await db
      .from('portal_messages')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .eq('read', false)
      .neq('sender_type', 'client');

    return NextResponse.json({
      messages: messages || [],
      unread_count: unreadCount || 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load messages' }, { status: 500 });
  }
}

/** POST — send a message as the client */
export async function POST(req: NextRequest) {
  try {
    const session = await getPortalSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { content, attachments } = body;

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Message content required' }, { status: 400 });
    }

    const db = createServerClient();
    const { data: message, error } = await db
      .from('portal_messages')
      .insert({
        project_id: session.project_id,
        tenant_id: session.tenant_id,
        sender_type: 'client',
        sender_name: session.client_name || session.client_email,
        sender_session_id: session.id,
        content: content.trim(),
        attachments: attachments || null,
        read: false,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ message });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to send message' }, { status: 500 });
  }
}

/** PATCH — mark messages as read */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getPortalSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { message_ids } = body;

    const db = createServerClient();

    if (message_ids && Array.isArray(message_ids) && message_ids.length > 0) {
      // Mark specific messages as read
      const { error } = await db
        .from('portal_messages')
        .update({ read: true, read_at: new Date().toISOString() })
        .in('id', message_ids)
        .eq('project_id', session.project_id)
        .eq('tenant_id', session.tenant_id);

      if (error) throw error;
    } else {
      // Mark all non-client messages as read
      const { error } = await db
        .from('portal_messages')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('project_id', session.project_id)
        .eq('tenant_id', session.tenant_id)
        .eq('read', false)
        .neq('sender_type', 'client');

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to mark messages as read' }, { status: 500 });
  }
}
