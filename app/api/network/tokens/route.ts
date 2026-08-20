import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const connectionId = searchParams.get('connection_id');
  const projectId = searchParams.get('project_id');

  try {
    const db = createServerClient();
    let query = db
      .from('network_access_tokens')
      .select('*, network_connections(name, ssid, network_type)')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (connectionId) query = query.eq('connection_id', connectionId);
    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ tokens: data || [] });
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
    if (!body.connection_id) return NextResponse.json({ error: 'connection_id required' }, { status: 400 });

    const db = createServerClient();

    // Verify connection belongs to tenant
    const { data: conn } = await db
      .from('network_connections')
      .select('id, tenant_id, project_id, name, token_expires_hours')
      .eq('id', body.connection_id)
      .eq('tenant_id', user.tenantId)
      .single();
    if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

    const expiryHours = body.expires_hours || conn.token_expires_hours || 12;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiryHours * 3600000).toISOString();

    const { data, error } = await db
      .from('network_access_tokens')
      .insert({
        tenant_id: user.tenantId,
        project_id: conn.project_id,
        connection_id: body.connection_id,
        token,
        label: body.label || null,
        expires_at: expiresAt,
        status: 'active',
        created_by: user.id,
      })
      .select()
      .single();
    if (error) throw error;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.saguarocrm.com';
    return NextResponse.json({
      success: true,
      token: data!.token,
      url: `${appUrl}/field/network/connect?token=${data!.token}`,
      expires_at: data!.expires_at,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
