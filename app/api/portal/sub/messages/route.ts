import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';
import { notOnRoster, subRecordScope } from '@/lib/sub-portal-scope';
import { portalSenderName } from '@/lib/sub-portal-sender';
import { createNotification } from '@/lib/notifications';

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

    // An email-only invite has no roster sub, so there is no thread to show (lib/sub-portal-scope).
    const scope = subRecordScope(session);
    if (!scope) return NextResponse.json({ messages: [] });

    const db = createServerClient();

    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '100', 10);
    const before = req.nextUrl.searchParams.get('before');

    let query = db
      .from('portal_sub_messages')
      .select('*')
      .eq('project_id', scope.projectId)
      .eq('sub_id', scope.subId)
      .eq('tenant_id', scope.tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data: messages, error } = await query;

    if (error) throw error;

    return NextResponse.json({ messages: (messages || []).reverse() });
  } catch (err) {
    return apiError('portal/sub/messages', err, "Couldn't load your messages.");
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

    const scope = subRecordScope(session);
    if (!scope) {
      const r = notOnRoster(session, 'a message');
      return NextResponse.json(r.body, { status: r.status });
    }

    const db = createServerClient();
    const body = await req.json();
    const { content } = body;

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: 'Message content is required' },
        { status: 400 }
      );
    }

    // sender_name is NOT NULL with no default. It was never set, so Postgres
    // rejected every message a sub sent. Name the sender from the roster sub,
    // falling back to what the GC typed on the invite (lib/sub-portal-sender).
    const { data: rosterSub, error: subErr } = await db
      .from('subcontractors')
      .select('company_name, contact_name, email, contact_email')
      .eq('id', scope.subId)
      .eq('tenant_id', scope.tenantId)
      .maybeSingle();
    if (subErr) console.error('[portal/sub/messages] roster sub lookup failed; naming the sender from the invite', { subId: scope.subId, error: subErr });
    const senderName = portalSenderName(rosterSub, session);

    // Live portal_sub_messages columns: sub_id, project_id, tenant_id,
    // sender_name, sender_type, content, read_at, created_at. There is no
    // sender_id / attachments column, and read state is tracked via read_at
    // (null = unread) rather than a boolean read column.
    const { data: message, error } = await db
      .from('portal_sub_messages')
      .insert({
        sub_id: scope.subId,
        project_id: scope.projectId,
        tenant_id: scope.tenantId,
        sender_name: senderName,
        sender_type: 'sub',
        content: content.trim(),
        created_at: new Date().toISOString(),
      } as Database['public']['Tables']['portal_sub_messages']['Insert'])
      .select()
      .single();

    if (error) throw error;

    // No GC screen lists portal_sub_messages, so without this the message
    // would be stored where nobody on the GC side ever sees it. The existing
    // notification path (bell + push) carries the text to the GC's team.
    const text = content.trim();
    await createNotification(
      scope.tenantId,
      null,
      'sub_message',
      `Message from ${senderName}`,
      text.length > 240 ? `${text.slice(0, 237)}…` : text,
      `/app/projects/${scope.projectId}/subs`,
      scope.projectId,
    );

    return NextResponse.json(
      { message, status: 'sent' },
      { status: 201 }
    );
  } catch (err) {
    return apiError('portal/sub/messages', err, "Couldn't send the message. Please try again.");
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

    const scope = subRecordScope(session);
    if (!scope) {
      const r = notOnRoster(session, 'a message');
      return NextResponse.json(r.body, { status: r.status });
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
        read_at: new Date().toISOString(),
      })
      .in('id', message_ids)
      .eq('sub_id', scope.subId)
      .eq('tenant_id', scope.tenantId)
      .neq('sender_type', 'sub');

    if (error) throw error;

    return NextResponse.json({ message: 'Messages marked as read' });
  } catch (err) {
    return apiError('portal/sub/messages', err, "Couldn't mark those messages read.");
  }
}
