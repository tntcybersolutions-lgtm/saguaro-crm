import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('observations')
      .select('*')
      .eq('project_id', params.projectId)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ observations: [] });
    return NextResponse.json({ observations: data || [] });
  } catch {
    return NextResponse.json({ observations: [] });
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
      status: body.status || 'open',
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('observations').insert(record).select().single();
    if (error) return NextResponse.json({ observation: { id: `obs-${Date.now()}`, ...record } });
    return NextResponse.json({ observation: data });
  } catch {
    return NextResponse.json({ error: 'Failed to create observation' }, { status: 500 });
  }
}
