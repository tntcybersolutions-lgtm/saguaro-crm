import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const heatmapId = searchParams.get('heatmap_id');
    if (!heatmapId) return badRequest('heatmap_id is required');
    const db = createServerClient();
    const { data } = await db.from('network_heatmap_surveys').select('ap_placements')
      .eq('id', heatmapId).eq('tenant_id', user.tenantId).maybeSingle();
    const aps = Array.isArray(data?.ap_placements) ? data.ap_placements : [];
    const ap = aps.find((a: Record<string, unknown>) => a.id === id);
    if (!ap) return notFound('AP not found');
    return ok(ap);
  } catch (err) { return serverError(err); }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();
    const { id } = await params;
    const body = await req.json();
    if (!body.heatmap_id) return badRequest('heatmap_id is required');
    const db = createServerClient();
    const { data } = await db.from('network_heatmap_surveys').select('ap_placements')
      .eq('id', body.heatmap_id).eq('tenant_id', user.tenantId).maybeSingle();
    if (!data) return notFound('Heatmap not found');
    const aps = Array.isArray(data.ap_placements) ? [...data.ap_placements] : [];
    const idx = aps.findIndex((a: Record<string, unknown>) => a.id === id);
    if (idx === -1) return notFound('AP not found');
    const updates = { ...body }; delete updates.heatmap_id;
    aps[idx] = { ...aps[idx], ...updates };
    const { error } = await db.from('network_heatmap_surveys')
      .update({ ap_placements: aps, updated_at: new Date().toISOString() })
      .eq('id', body.heatmap_id).eq('tenant_id', user.tenantId);
    if (error) throw error;
    return ok(aps[idx]);
  } catch (err) { return serverError(err); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser(req);
    if (!user) return unauthorized();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const heatmapId = searchParams.get('heatmap_id');
    if (!heatmapId) return badRequest('heatmap_id is required');
    const db = createServerClient();
    const { data } = await db.from('network_heatmap_surveys').select('ap_placements')
      .eq('id', heatmapId).eq('tenant_id', user.tenantId).maybeSingle();
    if (!data) return notFound('Heatmap not found');
    const aps = Array.isArray(data.ap_placements) ? data.ap_placements : [];
    const filtered = aps.filter((a: Record<string, unknown>) => a.id !== id);
    if (filtered.length === aps.length) return notFound('AP not found');
    const { error } = await db.from('network_heatmap_surveys')
      .update({ ap_placements: filtered, updated_at: new Date().toISOString() })
      .eq('id', heatmapId).eq('tenant_id', user.tenantId);
    if (error) throw error;
    return ok({ deleted: true });
  } catch (err) { return serverError(err); }
}
