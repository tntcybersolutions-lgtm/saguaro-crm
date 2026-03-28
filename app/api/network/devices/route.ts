import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response';

/**
 * GET /api/network/devices?network_project_id=xxx&device_type=switch
 * List devices by network project, optionally filter by device_type.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const networkProjectId = searchParams.get('network_project_id');
    const deviceType = searchParams.get('device_type');

    if (!networkProjectId) return badRequest('network_project_id is required');

    const db = createServerClient();

    // Verify project belongs to tenant
    const { data: project } = await db
      .from('network_projects')
      .select('id')
      .eq('id', networkProjectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (!project) return badRequest('Network project not found');

    let query = db
      .from('network_devices')
      .select('*')
      .eq('network_project_id', networkProjectId)
      .order('name', { ascending: true });

    if (deviceType) {
      query = query.eq('device_type', deviceType);
    }

    const { data, error } = await query;
    if (error) throw error;

    return ok(data || []);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * POST /api/network/devices
 * Create a network device.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const {
      network_project_id, name, device_type, manufacturer, model,
      ip_address, mac_address, location, vlan_id, port_count,
      poe_capable, managed, stack_member, firmware_version, notes,
    } = body;

    if (!network_project_id) return badRequest('network_project_id is required');
    if (!name) return badRequest('name is required');
    if (!device_type) return badRequest('device_type is required');

    const db = createServerClient();

    // Verify project belongs to tenant
    const { data: project } = await db
      .from('network_projects')
      .select('id')
      .eq('id', network_project_id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (!project) return badRequest('Network project not found');

    const { data, error } = await db
      .from('network_devices')
      .insert({
        network_project_id,
        tenant_id: user.tenantId,
        name,
        device_type,
        manufacturer: manufacturer || '',
        model: model || '',
        ip_address: ip_address || null,
        mac_address: mac_address || null,
        location: location || '',
        vlan_id: vlan_id || null,
        port_count: port_count || 0,
        poe_capable: poe_capable ?? false,
        managed: managed ?? true,
        stack_member: stack_member || null,
        firmware_version: firmware_version || '',
        notes: notes || '',
        status: 'planned',
      })
      .select()
      .single();

    if (error) throw error;

    return ok(data, 201);
  } catch (err) {
    return serverError(err);
  }
}
