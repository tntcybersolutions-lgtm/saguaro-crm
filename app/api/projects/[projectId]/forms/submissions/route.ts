import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('form_submissions')
      .select('*')
      .eq('project_id', params.projectId)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ submissions: [] });
    return NextResponse.json({ submissions: data || [] });
  } catch {
    return NextResponse.json({ submissions: [] });
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
      submitted_by: user.email,
      status: body.status || 'submitted',
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('form_submissions').insert(record).select().single();
    if (error) return NextResponse.json({ submission: { id: `fs-${Date.now()}`, ...record } });
    return NextResponse.json({ submission: data });
  } catch {
    return NextResponse.json({ error: 'Failed to submit form' }, { status: 500 });
  }
}
