import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getPortalSession, PORTAL_PERMS } from '@/lib/portal-auth';
import { apiError } from '@/lib/api-error';

/** GET — list messages for project channel */
export async function GET(req: NextRequest) {
  try {
    const session = await getPortalSession(req, PORTAL_PERMS.MESSAGING);
    if (!session) {
      return NextResponse.json({ error: 'Access denied — insufficient permissions' }, { status: 403 });
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

    // Count unread messages for the client. Read state is tracked by read_at
    // (null = unread); there is no boolean read column.
    const { count: unreadCount } = await db
      .from('portal_messages')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .is('read_at', null)
      .neq('sender_type', 'client');

    return NextResponse.json({
      messages: messages || [],
      unread_count: unreadCount || 0,
    });
  } catch (e) {
    return apiError('portal/client/messages GET', e);
  }
}

/** POST — send a message as the client */
export async function POST(req: NextRequest) {
  try {
    const session = await getPortalSession(req, PORTAL_PERMS.MESSAGING);
    if (!session) {
      return NextResponse.json({ error: 'Access denied — insufficient permissions' }, { status: 403 });
    }

    const body = await req.json();
    const { content, attachments } = body;

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Message content required' }, { status: 400 });
    }

    const db = createServerClient();
    // Live portal_messages columns: tenant_id, project_id, session_id,
    // sender_name, sender_type, content, read_at, attachments (jsonb),
    // created_at. sender_session_id -> session_id; there is no boolean read
    // column (unread = read_at null).
    const { data: message, error } = await db
      .from('portal_messages')
      .insert({
        project_id: session.project_id,
        tenant_id: session.tenant_id,
        session_id: session.id,
        sender_type: 'client',
        sender_name: session.client_name || session.client_email,
        content: content.trim(),
        attachments: attachments || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ message });
  } catch (e) {
    return apiError('portal/client/messages POST', e);
  }
}

/** PATCH — mark messages as read */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getPortalSession(req, PORTAL_PERMS.MESSAGING);
    if (!session) {
      return NextResponse.json({ error: 'Access denied — insufficient permissions' }, { status: 403 });
    }

    const body = await req.json();
    const { message_ids } = body;

    const db = createServerClient();

    // Read state is tracked by read_at (null = unread); there is no boolean
    // read column.
    if (message_ids && Array.isArray(message_ids) && message_ids.length > 0) {
      // Mark specific messages as read
      const { error } = await db
        .from('portal_messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', message_ids)
        .eq('project_id', session.project_id)
        .eq('tenant_id', session.tenant_id);

      if (error) throw error;
    } else {
      // Mark all non-client messages as read
      const { error } = await db
        .from('portal_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('project_id', session.project_id)
        .eq('tenant_id', session.tenant_id)
        .is('read_at', null)
        .neq('sender_type', 'client');

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('portal/client/messages PATCH', e);
  }
}
