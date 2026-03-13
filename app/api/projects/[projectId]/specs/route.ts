import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data: project } = await supabase.from('projects').select('id').eq('id', params.projectId).eq('tenant_id', user.tenantId).single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { data, error } = await supabase.from('specs').select('*').eq('project_id', params.projectId).order('section_number', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ specs: data ?? [] });
  } catch { return NextResponse.json({ specs: [] }); }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { data, error } = await supabase.from('specs').insert({
      tenant_id: user.tenantId, project_id: params.projectId,
      section_number: body.section_number, title: body.title,
      content: body.content || null, file_url: body.file_url || null,
      version: body.version || '1.0',
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ spec: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
