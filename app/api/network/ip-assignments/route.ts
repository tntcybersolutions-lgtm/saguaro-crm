import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('project_id');

  try {
    const db = createServerClient();
    let query = db
      .from('network_ip_tracker')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('ip_address', { ascending: true });

    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ assignments: data || [] });
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
    if (!body.ip_address) return NextResponse.json({ error: 'ip_address required' }, { status: 400 });

    const db = createServerClient();

    // Check for duplicate IP in same project
    const { data: existing } = await db
      .from('network_ip_tracker')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('ip_address', body.ip_address)
      .eq('project_id', body.project_id || '')
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'IP already assigned', conflict: true, existing }, { status: 409 });
    }

    const { data, error } = await db
      .from('network_ip_tracker')
      .insert({
        tenant_id: user.tenantId,
        project_id: body.project_id || null,
        ip_address: body.ip_address,
        hostname: body.hostname || null,
        device_type: body.device_type || null,
        mac_address: body.mac_address || null,
        vlan_id: body.vlan_id || null,
        vendor: body.vendor || null,
        model: body.model || null,
        location_notes: body.location_notes || null,
        assigned_to: body.assigned_to || null,
        subnet_cidr: body.subnet_cidr || null,
        notes: body.notes || null,
        status: body.status || 'active',
        is_reserved: body.is_reserved || false,
        assigned_by: user.id,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, assignment: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
