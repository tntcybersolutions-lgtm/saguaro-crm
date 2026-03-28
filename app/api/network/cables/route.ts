import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response';

/**
 * GET /api/network/cables?network_project_id=xxx
 * List cable runs by network project.
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
      .from('network_cable_runs')
      .select('*')
      .eq('network_project_id', networkProjectId)
      .order('cable_id', { ascending: true });

    if (error) throw error;

    return ok(data || []);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * POST /api/network/cables
 * Create a cable run.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const {
      network_project_id, cable_id, cable_type, category,
      from_location, from_device_id, from_port,
      to_location, to_device_id, to_port,
      length_ft, pathway, notes, status,
    } = body;

    if (!network_project_id) return badRequest('network_project_id is required');
    if (!cable_id) return badRequest('cable_id is required');
    if (!cable_type) return badRequest('cable_type is required');

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
      .from('network_cable_runs')
      .insert({
        network_project_id,
        tenant_id: user.tenantId,
        cable_id,
        cable_type,
        category: category || 'Cat6',
        from_location: from_location || '',
        from_device_id: from_device_id || null,
        from_port: from_port || null,
        to_location: to_location || '',
        to_device_id: to_device_id || null,
        to_port: to_port || null,
        length_ft: length_ft || 0,
        pathway: pathway || '',
        notes: notes || '',
        status: status || 'planned',
        tested: false,
        test_result: null,
        tested_at: null,
      })
      .select()
      .single();

    if (error) throw error;

    return ok(data, 201);
  } catch (err) {
    return serverError(err);
  }
}
