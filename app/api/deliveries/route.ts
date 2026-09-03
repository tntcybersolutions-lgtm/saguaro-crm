import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * GET /api/deliveries
 * Delivery logs, stored in punch_list with trade='delivery', tenant-scoped.
 *
 * Uses the service-role client (from requirePermission): every RLS policy on
 * punch_list targets `authenticated` or `service_role`, so the previous bare
 * anon client matched no policy and the SELECT returned zero rows with no error.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  const g = await requirePermission(req, 'Projects', 'View', { projectId });
  if (!g.ok) return g.res;

  const { db, user } = g;

  let query = db
    .from('punch_list')
    .select('*')
    .eq('trade', 'delivery')
    .eq('tenant_id', user.tenantId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (projectId) query = query.eq('project_id', projectId);

  const { data, error } = await query;

  if (error) {
    console.error('[deliveries] read failed:', error.message);
    return apiError('deliveries', error, 'Failed to load deliveries');
  }

  const deliveries = (data ?? []).map((d) => {
    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(d.notes || '{}'); } catch { /* notes may be plain text */ }
    return {
      id:           d.id,
      project_id:   d.project_id,
      supplier:     d.location || 'Unknown Supplier',
      description:  d.description,
      status:       d.status || 'open',
      po_number:    meta.po_number    || '',
      qty_ordered:  meta.qty_ordered  || '',
      qty_received: meta.qty_received || '',
      condition:    meta.condition    || 'Accepted',
      received_by:  meta.received_by  || '',
      // punch_list stores attachments in `photos` (jsonb); `photo_url` is the
      // legacy single-value column. There is no `photo_urls` column, so the
      // previous `d.photo_urls` was always undefined.
      photo_urls:   (Array.isArray(d.photos) ? d.photos : d.photo_url ? [d.photo_url] : []),
      created_at:   d.created_at,
    };
  });

  return NextResponse.json({ deliveries });
}
