import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json();
    const additional_emails: string[] = body.additional_emails || [];

    const db = createServerClient();

    // Verify meeting exists and belongs to tenant
    const { data: meeting, error: meetingError } = await db
      .from('meetings')
      .select('id')
      .eq('tenant_id', user.tenantId)
      .eq('id', id)
      .single();

    if (meetingError) throw meetingError;
    if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });

    // Get attendee emails
    const { data: attendees, error: attError } = await db
      .from('meeting_attendees')
      .select('email')
      .eq('tenant_id', user.tenantId)
      .eq('meeting_id', id);

    if (attError) throw attError;

    const attendeeEmails = (attendees || []).map((a) => a.email).filter(Boolean);
    const allEmails = [...new Set([...attendeeEmails, ...additional_emails])];

    const { data, error } = await db
      .from('meetings')
      .update({
        distributed_at: new Date().toISOString(),
        distributed_to: allEmails,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', user.tenantId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ meeting: data, distributed_to: allEmails });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
