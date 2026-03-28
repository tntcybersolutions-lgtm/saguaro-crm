import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response';

/**
 * Validate a CIDR subnet string (e.g. "192.168.10.0/24").
 */
function isValidCidr(cidr: string): boolean {
  const match = cidr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!match) return false;
  const octets = [+match[1], +match[2], +match[3], +match[4]];
  const prefix = +match[5];
  return octets.every((o) => o >= 0 && o <= 255) && prefix >= 0 && prefix <= 32;
}

/**
 * GET /api/network/vlans?network_project_id=xxx
 * List VLANs by network project.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const networkProjectId = searchParams.get('network_project_id');
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

    const { data, error } = await db
      .from('network_vlans')
      .select('*')
      .eq('network_project_id', networkProjectId)
      .order('vlan_id', { ascending: true });

    if (error) throw error;

    return ok(data || []);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * POST /api/network/vlans
 * Create VLAN with subnet validation.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const { network_project_id, vlan_id, name, subnet, gateway, description, purpose } = body;

    if (!network_project_id) return badRequest('network_project_id is required');
    if (vlan_id === undefined || vlan_id === null) return badRequest('vlan_id is required');
    if (!name) return badRequest('name is required');

    // Validate VLAN ID range
    const vid = Number(vlan_id);
    if (vid < 1 || vid > 4094) return badRequest('vlan_id must be between 1 and 4094');

    // Validate subnet if provided
    if (subnet && !isValidCidr(subnet)) {
      return badRequest('Invalid subnet CIDR format (e.g. 192.168.10.0/24)');
    }

    const db = createServerClient();

    // Verify project belongs to tenant
    const { data: project } = await db
      .from('network_projects')
      .select('id')
      .eq('id', network_project_id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (!project) return badRequest('Network project not found');

    // Check for duplicate VLAN ID within the same network project
    const { data: existing } = await db
      .from('network_vlans')
      .select('id')
      .eq('network_project_id', network_project_id)
      .eq('vlan_id', vid)
      .maybeSingle();

    if (existing) return badRequest(`VLAN ${vid} already exists in this network project`);

    const { data, error } = await db
      .from('network_vlans')
      .insert({
        network_project_id,
        tenant_id: user.tenantId,
        vlan_id: vid,
        name,
        subnet: subnet || null,
        gateway: gateway || null,
        description: description || '',
        purpose: purpose || '',
      })
      .select()
      .single();

    if (error) throw error;

    return ok(data, 201);
  } catch (err) {
    return serverError(err);
  }
}
