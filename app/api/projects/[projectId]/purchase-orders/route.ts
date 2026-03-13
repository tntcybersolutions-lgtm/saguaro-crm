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
    const status = url.searchParams.get('status');
    let q = supabase.from('purchase_orders').select('*').eq('project_id', params.projectId);
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ purchase_orders: data ?? [] });
  } catch { return NextResponse.json({ purchase_orders: [] }); }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { data, error } = await supabase.from('purchase_orders').insert({
      tenant_id: user.tenantId, project_id: params.projectId,
      po_number: body.po_number || null, vendor_name: body.vendor_name,
      vendor_email: body.vendor_email || null, amount: body.amount || 0,
      status: body.status || 'draft', issued_date: body.issued_date || null,
      required_date: body.required_date || null, description: body.description || null,
      line_items: body.line_items || [], file_url: body.file_url || null,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ purchase_order: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
