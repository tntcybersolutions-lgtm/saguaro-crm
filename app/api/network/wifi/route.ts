import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response';

/**
 * GET /api/network/wifi?network_project_id=xxx
 * List WiFi networks (SSIDs) by network project.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const networkProjectId = searchParams.get('network_project_id');
    if (!networkProjectId) return badRequest('network_project_id is required');

    const db = createServerClient();

    const { data: project } = await db
      .from('network_projects')
      .select('id')
      .eq('id', networkProjectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (!project) return badRequest('Network project not found');

    const { data, error } = await db
      .from('network_wifi_networks')
      .select('*')
      .eq('network_project_id', networkProjectId)
      .order('ssid', { ascending: true });

    if (error) throw error;

    return ok(data || []);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * POST /api/network/wifi
 * Create WiFi SSID configuration.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const {
      network_project_id, ssid, security_type, password,
      vlan_id, band, channel_width, hidden, guest_network,
      bandwidth_limit_mbps, client_isolation, description, enabled,
    } = body;

    if (!network_project_id) return badRequest('network_project_id is required');
    if (!ssid) return badRequest('ssid is required');

    const db = createServerClient();

    const { data: project } = await db
      .from('network_projects')
      .select('id')
      .eq('id', network_project_id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (!project) return badRequest('Network project not found');

    const { data, error } = await db
      .from('network_wifi_networks')
      .insert({
        network_project_id,
        tenant_id: user.tenantId,
        ssid,
        security_type: security_type || 'WPA3-Enterprise',
        password: password || null,
        vlan_id: vlan_id || null,
        band: band || '2.4/5GHz',
        channel_width: channel_width || '20/40MHz',
        hidden: hidden ?? false,
        guest_network: guest_network ?? false,
        bandwidth_limit_mbps: bandwidth_limit_mbps || null,
        client_isolation: client_isolation ?? false,
        description: description || '',
        enabled: enabled ?? true,
      })
      .select()
      .single();

    if (error) throw error;

    return ok(data, 201);
  } catch (err) {
    return serverError(err);
  }
}
