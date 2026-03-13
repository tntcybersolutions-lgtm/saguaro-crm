import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .eq('project_id', params.projectId)
      .order('meeting_date', { ascending: false });
    if (error) return NextResponse.json({ meetings: [] });
    return NextResponse.json({ meetings: data || [] });
  } catch {
    return NextResponse.json({ meetings: [] });
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const supabase = createServerClient();
    const record = {
      project_id: params.projectId,
      ...body,
      created_by: user.email,
      status: body.status || 'scheduled',
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('meetings').insert(record).select().single();
    if (error) return NextResponse.json({ meeting: { id: `mtg-${Date.now()}`, ...record } });
    return NextResponse.json({ meeting: data });
  } catch {
    return NextResponse.json({ error: 'Failed to create meeting' }, { status: 500 });
  }
}
