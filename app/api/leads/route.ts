import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const url = new URL(req.url);
    const stage = url.searchParams.get('stage');
    let q = supabase.from('lead_pipeline').select('*').eq('tenant_id', user.tenantId);
    if (stage) q = q.eq('stage', stage);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ leads: data ?? [] });
  } catch { return NextResponse.json({ leads: [] }); }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { data, error } = await supabase.from('lead_pipeline').insert({
      tenant_id: user.tenantId, name: body.name, email: body.email || null,
      phone: body.phone || null, company: body.company || null,
      source: body.source || 'website', stage: body.stage || 'new_lead',
      project_type: body.project_type || null, estimated_value: body.estimated_value || 0,
      estimated_start: body.estimated_start || null, probability: body.probability || 50,
      assigned_to: body.assigned_to || null, address: body.address || null,
      city: body.city || null, state: body.state || null, zip: body.zip || null,
      description: body.description || null, notes: body.notes || null,
      follow_up_date: body.follow_up_date || null, tags: body.tags || [],
      custom_fields: body.custom_fields || {}, created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ lead: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
