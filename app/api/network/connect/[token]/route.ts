import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

// Public endpoint — token IS the auth. No user session required.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  try {
    const db = createServerClient();

    // Look up token + join connection
    const { data: tokenData, error: tErr } = await db
      .from('network_access_tokens')
      .select('*, network_connections(*)')
      .eq('token', token)
      .single();

    if (tErr || !tokenData) {
      return NextResponse.json({ error: 'Invalid access link' }, { status: 401 });
    }

    // Check revoked
    if (tokenData.status === 'revoked') {
      return NextResponse.json({ error: 'This access link has been revoked by your administrator.' }, { status: 401 });
    }

    // Check expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This access link expired. Contact your project manager for a new one.', expired: true }, { status: 401 });
    }

    // Log access
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const ua = req.headers.get('user-agent') || '';
    const platform = /iPhone|iPad/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : /Windows/i.test(ua) ? 'windows' : /Mac/i.test(ua) ? 'mac' : 'other';

    await db.from('network_access_log').insert({
      tenant_id: tokenData.tenant_id,
      project_id: tokenData.project_id,
      token_id: tokenData.id,
      connection_id: tokenData.connection_id,
      user_id: tokenData.issued_to_user_id || null,
      user_name: tokenData.issued_to_name || 'Unknown',
      event_type: 'viewed',
      ip_address: ip,
      user_agent: ua.slice(0, 500),
      platform,
    }).then(() => {}, () => {});

    // Update token usage
    await db.from('network_access_tokens').update({
      last_used_at: new Date().toISOString(),
      use_count: (tokenData.use_count || 0) + 1,
    }).eq('id', tokenData.id).then(() => {}, () => {});

    const conn = tokenData.network_connections as Record<string, unknown>;

    // Get project name
    let projectName = 'Job Site';
    if (tokenData.project_id) {
      const { data: proj } = await db.from('projects').select('name').eq('id', tokenData.project_id).single();
      if (proj?.name) projectName = proj.name;
    }

    // Build WiFi QR data
    let wifiQrData: string | null = null;
    if (conn?.ssid) {
      const sec = (conn.security_type as string) || 'WPA2';
      const hidden = conn.wifi_hidden ? 'true' : 'false';
      wifiQrData = `WIFI:T:${sec};S:${conn.ssid};P:${conn.password || ''};H:${hidden};;`;
    }

    // Build WireGuard config if VPN enabled
    let wireguardConfig: string | null = null;
    if (conn?.vpn_enabled && conn.wireguard_public_key) {
      const pskLine = conn.vpn_preshared_key ? `PresharedKey = ${conn.vpn_preshared_key}\n` : '';
      wireguardConfig = `[Interface]
PrivateKey = PASTE_YOUR_PRIVATE_KEY_HERE
Address = 10.100.0.X/32
DNS = ${conn.vpn_dns || '1.1.1.1'}

[Peer]
PublicKey = ${conn.wireguard_public_key}
${pskLine}Endpoint = ${conn.wireguard_endpoint || 'vpn.example.com'}:${conn.vpn_port || 51820}
AllowedIPs = ${conn.vpn_allowed_ips || '0.0.0.0/0'}
PersistentKeepalive = 25`;
    }

    // Also use the pre-built wireguard_config if stored directly
    if (!wireguardConfig && conn?.wireguard_config) {
      wireguardConfig = conn.wireguard_config as string;
    }

    return NextResponse.json({
      connection: {
        name: conn?.name || 'Network',
        ssid: conn?.ssid || null,
        wifi_password: conn?.password || null,
        wifi_security: (conn?.security_type as string) || 'WPA2',
        wifi_hidden: !!conn?.wifi_hidden,
        frequency: (conn?.frequency as string) || '5GHz',
        wifi_qr_data: wifiQrData,
        vpn_enabled: !!conn?.vpn_enabled,
        vpn_type: (conn?.vpn_type as string) || 'wireguard',
        wireguard_config: wireguardConfig,
        gateway_ip: conn?.gateway || null,
        notes: conn?.notes || null,
      },
      expires_at: tokenData.expires_at,
      project_name: projectName,
      token_id: tokenData.id,
      issued_to: tokenData.issued_to_name,
      message: tokenData.message,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
