import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

// Public endpoint — token-based auth (no user session required)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  try {
    const db = createServerClient();

    // Look up token
    const { data: tokenData, error: tErr } = await db
      .from('network_access_tokens')
      .select('*, network_connections(*)')
      .eq('token', token)
      .single();

    if (tErr || !tokenData) return NextResponse.json({ error: 'Invalid or expired access link' }, { status: 404 });

    // Check expiry
    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This access link has expired', expired: true }, { status: 410 });
    }

    // Check revoked
    if (tokenData.status === 'revoked') {
      return NextResponse.json({ error: 'This access link has been revoked' }, { status: 403 });
    }

    // Log access
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const ua = req.headers.get('user-agent') || '';
    const platform = ua.includes('iPhone') || ua.includes('iPad') ? 'ios' : ua.includes('Android') ? 'android' : ua.includes('Windows') ? 'windows' : ua.includes('Mac') ? 'mac' : 'other';

    await db.from('network_access_log').insert({
      tenant_id: tokenData.tenant_id,
      project_id: tokenData.project_id,
      token_id: tokenData.id,
      connection_id: tokenData.connection_id,
      user_name: tokenData.issued_to_name || 'Unknown',
      event_type: 'viewed',
      ip_address: ip,
      user_agent: ua.slice(0, 500),
      platform,
    });

    const conn = tokenData.network_connections as any;

    return NextResponse.json({
      connection: {
        name: conn?.name || 'Network',
        network_type: conn?.network_type || 'wifi',
        ssid: conn?.ssid,
        password: conn?.password,
        security_type: conn?.security_type,
        wifi_qr_data: conn?.wifi_qr_data,
        wireguard_config: conn?.wireguard_config,
        wireguard_endpoint: conn?.wireguard_endpoint,
        gateway: conn?.gateway,
        dns: conn?.dns,
        notes: conn?.notes,
      },
      token: {
        expires_at: tokenData.expires_at,
        issued_to: tokenData.issued_to_name,
        message: tokenData.message,
      },
      platform,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
