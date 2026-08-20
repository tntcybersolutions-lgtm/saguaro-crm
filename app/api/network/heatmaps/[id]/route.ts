import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();
    const { id } = await params;
    const db = createServerClient();
    const { data, error } = await db.from('network_heatmap_surveys').select('*')
      .eq('id', id).eq('tenant_id', user.tenantId).maybeSingle();
    if (error) throw error;
    if (!data) return notFound('Heatmap not found');
    return ok(data);
  } catch (err) { return serverError(err); }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();
    const { id } = await params;
    const body = await req.json();
    const db = createServerClient();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.floor_plan_url !== undefined) updates.floor_plan_url = body.floor_plan_url;
    if (body.floor_plan_width !== undefined) updates.floor_plan_width = body.floor_plan_width;
    if (body.floor_plan_height !== undefined) updates.floor_plan_height = body.floor_plan_height;
    if (body.ap_placements !== undefined) updates.ap_placements = body.ap_placements;
    if (body.walls !== undefined) updates.walls = body.walls;
    if (body.survey_points !== undefined) updates.survey_points = body.survey_points;
    if (body.coverage_percent !== undefined) updates.coverage_percent = body.coverage_percent;
    if (body.dead_zones !== undefined) updates.dead_zones = body.dead_zones;
    const { data, error } = await db.from('network_heatmap_surveys')
      .update(updates).eq('id', id).eq('tenant_id', user.tenantId).select().single();
    if (error) throw error;
    if (!data) return notFound('Heatmap not found');
    return ok(data);
  } catch (err) { return serverError(err); }
}
