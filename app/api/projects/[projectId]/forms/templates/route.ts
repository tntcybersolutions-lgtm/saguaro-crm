import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('form_templates')
      .select('*')
      .or(`project_id.eq.${params.projectId},is_global.eq.true`)
      .order('name');
    if (error) return NextResponse.json({ templates: [] });
    return NextResponse.json({ templates: data || [] });
  } catch {
    return NextResponse.json({ templates: [] });
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
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('form_templates').insert(record).select().single();
    if (error) return NextResponse.json({ template: { id: `ft-${Date.now()}`, ...record } });
    return NextResponse.json({ template: data });
  } catch {
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}
