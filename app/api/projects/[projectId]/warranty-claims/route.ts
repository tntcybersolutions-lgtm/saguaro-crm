import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const { data: project } = await supabase.from('projects').select('id').eq('id', params.projectId).eq('tenant_id', user.tenantId).single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { data, error } = await supabase.from('warranty_claims').select('*').eq('project_id', params.projectId).order('reported_date', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ claims: data ?? [] });
  } catch { return NextResponse.json({ claims: [] }); }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const count = await supabase.from('warranty_claims').select('id', { count: 'exact', head: true }).eq('project_id', params.projectId);
    const num = (count.count || 0) + 1;
    const { data, error } = await supabase.from('warranty_claims').insert({
      tenant_id: user.tenantId, project_id: params.projectId,
      claim_number: `WC-${String(num).padStart(4, '0')}`,
      title: body.title, description: body.description,
      category: body.category || 'general', location: body.location || null,
      reported_by: body.reported_by || null, reported_date: body.reported_date,
      priority: body.priority || 'medium', status: body.status || 'submitted',
      assigned_trade: body.assigned_trade || null, assigned_contractor: body.assigned_contractor || null,
      scheduled_date: body.scheduled_date || null, warranty_expiry: body.warranty_expiry || null,
      photos: body.photos || [], notes: body.notes || null, created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ claim: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
