import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

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
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/closeout] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/closeout', e, 'Failed to load items');
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
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
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[projects/projectId/closeout]', e);
    const msg = "Failed";
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
