import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response';

/**
 * GET /api/network/projects?project_id=xxx
 * List network_projects filtered by project_id or tenant_id.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id');

    const db = createServerClient();
    let query = db
      .from('network_projects')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return ok(data || []);
  } catch (err) {
    return serverError(err);
  }
}

/**
 * POST /api/network/projects
 * Create a network project linked to a construction project.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const { project_id, name, site_type, building_count, floor_count, square_footage, notes } = body;

    if (!project_id) return badRequest('project_id is required');
    if (!name) return badRequest('name is required');

    const db = createServerClient();

    // Validate the parent construction project exists and belongs to tenant
    const { data: project, error: projErr } = await db
      .from('projects')
      .select('id, name')
      .eq('id', project_id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();

    if (projErr) throw projErr;
    if (!project) return badRequest('Construction project not found');

    const { data, error } = await db
      .from('network_projects')
      .insert({
        tenant_id: user.tenantId,
        project_id,
        name,
        site_type: site_type || 'commercial',
        building_count: building_count || 1,
        floor_count: floor_count || 1,
        square_footage: square_footage || 0,
        notes: notes || '',
        status: 'planning',
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return ok(data, 201);
  } catch (err) {
    return serverError(err);
  }
}
