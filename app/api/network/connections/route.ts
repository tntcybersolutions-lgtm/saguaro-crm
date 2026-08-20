import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || searchParams.get('project_id');
  try {
    const db = createServerClient();
    let query = db.from('network_connections').select('*').eq('tenant_id', user.tenantId).eq('is_active', true).order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;

    // Mask passwords in list response
    const masked = (data || []).map(c => ({
      ...c,
      password: c.password ? '••••••••' : null,
      vpn_preshared_key: c.vpn_preshared_key ? '••••••••' : null,
    }));

    // Count active tokens per connection
    const connIds = (data || []).map(c => c.id);
    let tokenCounts = new Map<string, number>();
    if (connIds.length > 0) {
      const { data: tokens } = await db
        .from('network_access_tokens')
        .select('connection_id')
        .in('connection_id', connIds)
        .eq('tenant_id', user.tenantId)
        .eq('status', 'active')
        .gte('expires_at', new Date().toISOString());
      if (tokens) {
        for (const t of tokens) {
          tokenCounts.set(t.connection_id, (tokenCounts.get(t.connection_id) || 0) + 1);
        }
      }
    }

    const enriched = masked.map(c => ({
      ...c,
      active_token_count: tokenCounts.get(c.id) || 0,
    }));

    return NextResponse.json({ connections: enriched });
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
    if (!body.project_id || !body.name) return NextResponse.json({ error: 'project_id and name required' }, { status: 400 });

    // Generate WiFi QR data string
    let wifiQr = null;
    if (body.ssid) {
      const sec = body.security_type || 'WPA2';
      const hidden = body.wifi_hidden ? 'true' : 'false';
      wifiQr = `WIFI:T:${sec};S:${body.ssid};P:${body.password || ''};H:${hidden};;`;
    }

    // Build WireGuard config if VPN enabled
    let wgConfig = body.wireguard_config || null;
    if (body.vpn_enabled && body.wireguard_public_key && !wgConfig) {
      const psk = body.vpn_preshared_key ? `PresharedKey = ${body.vpn_preshared_key}\n` : '';
      wgConfig = `[Interface]\nPrivateKey = PASTE_YOUR_PRIVATE_KEY_HERE\nAddress = 10.100.0.X/32\nDNS = ${body.vpn_dns || '1.1.1.1'}\n\n[Peer]\nPublicKey = ${body.wireguard_public_key}\n${psk}Endpoint = ${body.wireguard_endpoint || 'vpn.example.com'}:${body.vpn_port || 51820}\nAllowedIPs = ${body.vpn_allowed_ips || '0.0.0.0/0'}\nPersistentKeepalive = 25`;
    }

    const db = createServerClient();
    const { data, error } = await db.from('network_connections').insert({
      tenant_id: user.tenantId,
      project_id: body.project_id,
      name: body.name,
      network_type: body.network_type || 'wifi',
      ssid: body.ssid || null,
      password: body.password || null,
      security_type: body.security_type || 'WPA2',
      wifi_hidden: body.wifi_hidden || false,
      frequency: body.frequency || '5GHz',
      vlan_id: body.vlan_id || null,
      ip_range: body.ip_range || null,
      gateway: body.gateway || null,
      subnet_mask: body.subnet_mask || null,
      dns: body.dns || null,
      wifi_qr_data: wifiQr,
      vpn_enabled: body.vpn_enabled || false,
      vpn_type: body.vpn_type || 'wireguard',
      vpn_port: body.vpn_port || 51820,
      vpn_dns: body.vpn_dns || '1.1.1.1',
      vpn_allowed_ips: body.vpn_allowed_ips || '0.0.0.0/0',
      vpn_preshared_key: body.vpn_preshared_key || null,
      vpn_client_ip_pool: body.vpn_client_ip_pool || '10.100.0.0/24',
      wireguard_config: wgConfig,
      wireguard_endpoint: body.wireguard_endpoint || null,
      wireguard_public_key: body.wireguard_public_key || null,
      allowed_roles: body.allowed_roles || ['admin', 'pm', 'super', 'foreman', 'field'],
      token_expires_hours: body.token_expires_hours || 12,
      notes: body.notes || null,
      is_active: body.is_active !== false,
      created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, connection: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
