import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('correspondence')
      .select('*')
      .eq('project_id', params.projectId)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ items: [] });
    return NextResponse.json({ items: data || [] });
  } catch {
    return NextResponse.json({ items: [] });
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
      from_email: user.email,
      status: body.status || 'draft',
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('correspondence').insert(record).select().single();
    if (error) return NextResponse.json({ item: { id: `corr-${Date.now()}`, ...record } });
    return NextResponse.json({ item: data });
  } catch {
    return NextResponse.json({ error: 'Failed to create correspondence' }, { status: 500 });
  }
}
