import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const heatmapId = searchParams.get('heatmap_id');
    if (!heatmapId) return badRequest('heatmap_id is required');
    const db = createServerClient();
    const { data } = await db.from('network_heatmap_surveys').select('survey_points')
      .eq('id', heatmapId).eq('tenant_id', user.tenantId).maybeSingle();
    if (!data) return notFound('Heatmap not found');
    const pts = Array.isArray(data.survey_points) ? data.survey_points : [];
    const filtered = pts.filter((p: Record<string, unknown>) => p.id !== id);
    if (filtered.length === pts.length) return notFound('Survey point not found');
    const { error } = await db.from('network_heatmap_surveys')
      .update({ survey_points: filtered, updated_at: new Date().toISOString() })
      .eq('id', heatmapId).eq('tenant_id', user.tenantId);
    if (error) throw error;
    return ok({ deleted: true });
  } catch (err) { return serverError(err); }
}
