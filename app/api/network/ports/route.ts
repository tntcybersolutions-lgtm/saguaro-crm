import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response';

/**
 * GET /api/network/ports?device_id=xxx
 * List port assignments by device.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const deviceId = searchParams.get('device_id');
    if (!deviceId) return badRequest('device_id is required');

    const db = createServerClient();

    // Verify device belongs to tenant
    const { data: device } = await db
      .from('network_devices')
      .select('id')
      .eq('id', deviceId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (!device) return badRequest('Device not found');

    const { data, error } = await db
      .from('network_port_assignments')
      .select('*')
      .eq('device_id', deviceId)
      .order('port_number', { ascending: true });

    if (error) throw error;

    return ok(data || []);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * POST /api/network/ports
 * Create a single port assignment.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const {
      device_id, port_number, port_label, port_type, speed,
      vlan_id, connected_device_id, connected_port, description,
      poe_enabled, status,
    } = body;

    if (!device_id) return badRequest('device_id is required');
    if (!port_number) return badRequest('port_number is required');

    const db = createServerClient();

    // Verify device belongs to tenant
    const { data: device } = await db
      .from('network_devices')
      .select('id, network_project_id')
      .eq('id', device_id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (!device) return badRequest('Device not found');

    const { data, error } = await db
      .from('network_port_assignments')
      .insert({
        device_id,
        network_project_id: device.network_project_id,
        tenant_id: user.tenantId,
        port_number,
        port_label: port_label || `Port ${port_number}`,
        port_type: port_type || 'ethernet',
        speed: speed || '1G',
        vlan_id: vlan_id || null,
        connected_device_id: connected_device_id || null,
        connected_port: connected_port || null,
        description: description || '',
        poe_enabled: poe_enabled ?? false,
        status: status || 'available',
      })
      .select()
      .single();

    if (error) throw error;

    return ok(data, 201);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * PATCH /api/network/ports
 * Bulk update multiple ports. Body: { ports: [{ id, ...updates }] }
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const { ports } = body;

    if (!Array.isArray(ports) || ports.length === 0) {
      return badRequest('ports array is required');
    }

    const db = createServerClient();
    const results: unknown[] = [];
    const errors: string[] = [];

    for (const port of ports) {
      if (!port.id) {
        errors.push('Port entry missing id');
        continue;
      }

      const { id, device_id: _did, tenant_id: _tid, network_project_id: _npid, created_at: _ca, ...updates } = port;

      const { data, error } = await db
        .from('network_port_assignments')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', user.tenantId)
        .select()
        .single();

      if (error) {
        errors.push(`Port ${id}: ${error.message}`);
      } else if (data) {
        results.push(data);
      }
    }

    return ok({ updated: results, errors });
  } catch (err) {
    return serverError(err);
  }
}
