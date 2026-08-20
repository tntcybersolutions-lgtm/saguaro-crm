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
    const { data, error } = await db.from('network_heatmap_surveys').select('ap_placements')
      .eq('id', heatmapId).eq('tenant_id', user.tenantId).maybeSingle();
    if (error) throw error;
    return ok(data?.ap_placements || []);
  } catch (err) { return serverError(err); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();
    const body = await req.json();
    if (!body.heatmap_id) return badRequest('heatmap_id is required');
    const db = createServerClient();
    const { data: heatmap, error: fetchErr } = await db.from('network_heatmap_surveys')
      .select('ap_placements').eq('id', body.heatmap_id).eq('tenant_id', user.tenantId).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!heatmap) return badRequest('Heatmap not found');
    const aps = Array.isArray(heatmap.ap_placements) ? [...heatmap.ap_placements] : [];
    const newAp = { ...body, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    delete newAp.heatmap_id;
    aps.push(newAp);
    const { error } = await db.from('network_heatmap_surveys')
      .update({ ap_placements: aps, updated_at: new Date().toISOString() })
      .eq('id', body.heatmap_id).eq('tenant_id', user.tenantId);
    if (error) throw error;
    return ok(newAp, 201);
  } catch (err) { return serverError(err); }
}
