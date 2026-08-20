import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const db = createServerClient();
    let query = db.from('network_ip_tracker').select('*').eq('tenant_id', user.tenantId).order('ip_address');
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ ips: data || [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, {status: 500});
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.project_id || !body.ip_address) return NextResponse.json({ error: 'project_id and ip_address required' }, { status: 400 });
    const db = createServerClient();
    // Check for duplicate IP
    const { data: existing } = await db.from('network_ip_tracker')
      .select('id').eq('tenant_id', user.tenantId).eq('project_id', body.project_id).eq('ip_address', body.ip_address).maybeSingle();
    if (existing) return NextResponse.json({ error: 'IP address already assigned in this project' }, { status: 409 });
    const { data, error } = await db.from('network_ip_tracker').insert({
      tenant_id: user.tenantId,
      project_id: body.project_id,
      ip_address: body.ip_address,
      hostname: body.hostname || null,
      device_type: body.device_type || null,
      mac_address: body.mac_address || null,
      vlan_id: body.vlan_id || null,
      status: body.status || 'active',
      notes: body.notes || null,
      assigned_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, ip: data });
  } catch (err: any) {
    if (err?.code === '23505') return NextResponse.json({ error: 'IP address already assigned' }, { status: 409 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
