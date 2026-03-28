import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response';

/**
 * GET /api/network/projects/[id]
 * Full detail with counts of devices, vlans, cables.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const { id } = await params;
    const db = createServerClient();

    const { data: project, error } = await db
      .from('network_projects')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (error || !project) return notFound('Network project not found');

    // Fetch counts in parallel
    const [devicesRes, vlansRes, cablesRes, firewallRes, wifiRes] = await Promise.all([
      db.from('network_devices').select('id', { count: 'exact', head: true }).eq('network_project_id', id),
      db.from('network_vlans').select('id', { count: 'exact', head: true }).eq('network_project_id', id),
      db.from('network_cable_runs').select('id', { count: 'exact', head: true }).eq('network_project_id', id),
      db.from('network_firewall_rules').select('id', { count: 'exact', head: true }).eq('network_project_id', id),
      db.from('network_wifi_networks').select('id', { count: 'exact', head: true }).eq('network_project_id', id),
    ]);

    return ok({
      ...project,
      counts: {
        devices: devicesRes.count || 0,
        vlans: vlansRes.count || 0,
        cables: cablesRes.count || 0,
        firewall_rules: firewallRes.count || 0,
        wifi_networks: wifiRes.count || 0,
      },
    });
  } catch (err) {
    return serverError(err);
  }
}

/**
 * PATCH /api/network/projects/[id]
 * Update network project fields.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const { id } = await params;
    const body = await req.json();
    const db = createServerClient();

    // Strip fields that shouldn't be updated directly
    const { id: _id, tenant_id: _tid, created_at: _ca, created_by: _cb, ...updates } = body;

    const { data, error } = await db
      .from('network_projects')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return notFound('Network project not found');

    return ok(data);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * DELETE /api/network/projects/[id]
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const { id } = await params;
    const db = createServerClient();

    const { error } = await db
      .from('network_projects')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;

    return ok({ deleted: true });
  } catch (err) {
    return serverError(err);
  }
}
