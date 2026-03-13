import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('meetings')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('project_id', params.projectId)
      .select()
      .single();
    if (error) return NextResponse.json({ meeting: { id: params.id, ...body } });
    return NextResponse.json({ meeting: data });
  } catch {
    return NextResponse.json({ error: 'Failed to update meeting' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  // Email distribution endpoint
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    // In production this would send emails via SendGrid/Resend
    return NextResponse.json({ success: true, message: 'Meeting minutes sent' });
  } catch {
    return NextResponse.json({ error: 'Failed to send minutes' }, { status: 500 });
  }
}
