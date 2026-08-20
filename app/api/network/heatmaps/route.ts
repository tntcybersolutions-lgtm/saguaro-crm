import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id');
    const db = createServerClient();
    let query = db.from('network_heatmap_surveys').select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return ok(data || []);
  } catch (err) { return serverError(err); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();
    const body = await req.json();
    if (!body.name) return badRequest('name is required');
    const db = createServerClient();
    const { data, error } = await db.from('network_heatmap_surveys').insert({
      tenant_id: user.tenantId,
      project_id: body.project_id || null,
      name: body.name,
      floor_plan_url: body.floor_plan_url || null,
      floor_plan_width: body.floor_plan_width || 800,
      floor_plan_height: body.floor_plan_height || 600,
      ap_placements: body.ap_placements || [],
      walls: body.walls || [],
      survey_points: body.survey_points || [],
      coverage_percent: body.coverage_percent || 0,
      dead_zones: body.dead_zones || 0,
      created_by: user.id,
    }).select().single();
    if (error) throw error;
    return ok(data, 201);
  } catch (err) { return serverError(err); }
}
