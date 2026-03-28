import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response';

/**
 * GET /api/network/ap-placements?network_project_id=xxx
 * List WiFi AP placements by network project.
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
      .from('network_wifi_ap_placements')
      .select('*')
      .eq('network_project_id', networkProjectId)
      .order('name', { ascending: true });

    if (error) throw error;

    return ok(data || []);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * POST /api/network/ap-placements
 * Create an AP placement with x_pct, y_pct position.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const {
      network_project_id, name, device_id, floor, building,
      x_pct, y_pct, mounting_type, height_ft,
      coverage_radius_ft, channel_2g, channel_5g, power_level,
      connected_switch_id, switch_port, notes,
    } = body;

    if (!network_project_id) return badRequest('network_project_id is required');
    if (!name) return badRequest('name is required');
    if (x_pct === undefined || y_pct === undefined) {
      return badRequest('x_pct and y_pct are required for AP placement');
    }

    // Validate percentage bounds
    const xPct = Number(x_pct);
    const yPct = Number(y_pct);
    if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) {
      return badRequest('x_pct and y_pct must be between 0 and 100');
    }

    const db = createServerClient();

    const { data: project } = await db
      .from('network_projects')
      .select('id')
      .eq('id', network_project_id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (!project) return badRequest('Network project not found');

    const { data, error } = await db
      .from('network_wifi_ap_placements')
      .insert({
        network_project_id,
        tenant_id: user.tenantId,
        name,
        device_id: device_id || null,
        floor: floor || '1',
        building: building || 'Main',
        x_pct: xPct,
        y_pct: yPct,
        mounting_type: mounting_type || 'ceiling',
        height_ft: height_ft || 10,
        coverage_radius_ft: coverage_radius_ft || 35,
        channel_2g: channel_2g || null,
        channel_5g: channel_5g || null,
        power_level: power_level || 'auto',
        connected_switch_id: connected_switch_id || null,
        switch_port: switch_port || null,
        notes: notes || '',
      })
      .select()
      .single();

    if (error) throw error;

    return ok(data, 201);
  } catch (err) {
    return serverError(err);
  }
}
