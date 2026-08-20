import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const db = createServerClient();

    const { data: meeting, error: meetingError } = await db
      .from('meetings')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('id', id)
      .single();

    if (meetingError) throw meetingError;
    if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });

    const { data: attendees, error: attError } = await db
      .from('meeting_attendees')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('meeting_id', id)
      .order('name');

    if (attError) throw attError;

    const { data: action_items, error: aiError } = await db
      .from('action_items')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('meeting_id', id)
      .order('created_at', { ascending: false });

    if (aiError) throw aiError;

    return NextResponse.json({ meeting, attendees: attendees || [], action_items: action_items || [] });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json();
    const db = createServerClient();

    const allowedFields = [
      'notes', 'transcript', 'status', 'minutes_approved',
      'minutes_text', 'title', 'meeting_date', 'location',
      'start_time', 'agenda', 'meeting_type', 'summary_line',
    ];

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    const { data, error } = await db
      .from('meetings')
      .update(updates)
      .eq('tenant_id', user.tenantId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ meeting: data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const db = createServerClient();

    const { data, error } = await db
      .from('meetings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('tenant_id', user.tenantId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ meeting: data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
