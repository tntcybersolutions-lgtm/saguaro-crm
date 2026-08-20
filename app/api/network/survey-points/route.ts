import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();
    const { searchParams } = new URL(req.url);
    const heatmapId = searchParams.get('heatmap_id');
    if (!heatmapId) return badRequest('heatmap_id is required');
    const db = createServerClient();
    const { data } = await db.from('network_heatmap_surveys').select('survey_points')
      .eq('id', heatmapId).eq('tenant_id', user.tenantId).maybeSingle();
    return ok(data?.survey_points || []);
  } catch (err) { return serverError(err); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();
    const body = await req.json();
    if (!body.heatmap_id) return badRequest('heatmap_id is required');
    const db = createServerClient();
    const { data } = await db.from('network_heatmap_surveys').select('survey_points')
      .eq('id', body.heatmap_id).eq('tenant_id', user.tenantId).maybeSingle();
    if (!data) return badRequest('Heatmap not found');
    const pts = Array.isArray(data.survey_points) ? [...data.survey_points] : [];
    const newPt = { id: crypto.randomUUID(), x_pct: body.x_pct, y_pct: body.y_pct, rssi_dbm: body.rssi_dbm, created_at: new Date().toISOString() };
    pts.push(newPt);
    const { error } = await db.from('network_heatmap_surveys')
      .update({ survey_points: pts, updated_at: new Date().toISOString() })
      .eq('id', body.heatmap_id).eq('tenant_id', user.tenantId);
    if (error) throw error;
    return ok(newPt, 201);
  } catch (err) { return serverError(err); }
}
