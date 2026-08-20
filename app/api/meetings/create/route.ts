import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

interface AttendeeInput {
  name: string;
  company: string;
  role: string;
  email: string;
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { projectId, meeting_type, title, meeting_date, location, start_time, agenda, attendees } = body;

    if (!projectId) return NextResponse.json({ error: 'Missing required field: projectId' }, { status: 400 });
    if (!meeting_type) return NextResponse.json({ error: 'Missing required field: meeting_type' }, { status: 400 });
    if (!title) return NextResponse.json({ error: 'Missing required field: title' }, { status: 400 });
    if (!meeting_date) return NextResponse.json({ error: 'Missing required field: meeting_date' }, { status: 400 });

    const db = createServerClient();

    const { data: meeting, error: meetingError } = await db
      .from('meetings')
      .insert({
        project_id: projectId,
        tenant_id: user.tenantId,
        meeting_type,
        title,
        meeting_date,
        location: location || null,
        start_time: start_time || null,
        agenda: agenda || null,
        status: 'scheduled',
        created_by: user.id,
      })
      .select()
      .single();

    if (meetingError) throw meetingError;

    let insertedAttendees: unknown[] = [];

    if (attendees && Array.isArray(attendees) && attendees.length > 0) {
      const attendeeRows = (attendees as AttendeeInput[]).map((a) => ({
        meeting_id: meeting.id,
        tenant_id: user.tenantId,
        name: a.name,
        company: a.company,
        role: a.role,
        email: a.email,
      }));

      const { data: attData, error: attError } = await db
        .from('meeting_attendees')
        .insert(attendeeRows)
        .select();

      if (attError) throw attError;
      insertedAttendees = attData || [];
    }

    return NextResponse.json({ meeting, attendees: insertedAttendees });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
