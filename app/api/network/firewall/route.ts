import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response';

/**
 * GET /api/network/firewall?network_project_id=xxx
 * List firewall rules ordered by rule_number.
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
      .from('network_firewall_rules')
      .select('*')
      .eq('network_project_id', networkProjectId)
      .order('rule_number', { ascending: true });

    if (error) throw error;

    return ok(data || []);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * POST /api/network/firewall
 * Create a firewall rule.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const {
      network_project_id, rule_number, name, action, direction,
      protocol, source_ip, source_port, destination_ip, destination_port,
      vlan_id, description, enabled, log_enabled,
    } = body;

    if (!network_project_id) return badRequest('network_project_id is required');
    if (rule_number === undefined) return badRequest('rule_number is required');
    if (!action) return badRequest('action is required (allow/deny/drop)');

    const db = createServerClient();

    const { data: project } = await db
      .from('network_projects')
      .select('id')
      .eq('id', network_project_id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (!project) return badRequest('Network project not found');

    const { data, error } = await db
      .from('network_firewall_rules')
      .insert({
        network_project_id,
        tenant_id: user.tenantId,
        rule_number: Number(rule_number),
        name: name || `Rule ${rule_number}`,
        action,
        direction: direction || 'inbound',
        protocol: protocol || 'any',
        source_ip: source_ip || 'any',
        source_port: source_port || 'any',
        destination_ip: destination_ip || 'any',
        destination_port: destination_port || 'any',
        vlan_id: vlan_id || null,
        description: description || '',
        enabled: enabled ?? true,
        log_enabled: log_enabled ?? false,
      })
      .select()
      .single();

    if (error) throw error;

    return ok(data, 201);
  } catch (err) {
    return serverError(err);
  }
}
