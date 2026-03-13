import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data: project } = await supabase.from('projects').select('id').eq('id', params.projectId).eq('tenant_id', user.tenantId).single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const url = new URL(req.url);
    const type = url.searchParams.get('type');
    const status = url.searchParams.get('status');
    let q = supabase.from('closeout').select('*').eq('project_id', params.projectId);
    if (type) q = q.eq('item_type', type);
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch { return NextResponse.json({ items: [] }); }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { data, error } = await supabase.from('closeout').insert({
      tenant_id: user.tenantId, project_id: params.projectId,
      item_type: body.item_type, title: body.title,
      description: body.description || null, trade: body.trade || null,
      responsible_party: body.responsible_party || null, due_date: body.due_date || null,
      status: body.status || 'pending', warranty_start: body.warranty_start || null,
      warranty_end: body.warranty_end || null, warranty_duration: body.warranty_duration || null,
      manufacturer: body.manufacturer || null, file_url: body.file_url || null,
      file_name: body.file_name || null, notes: body.notes || null, created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
