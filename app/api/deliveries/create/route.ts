import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

/**
 * POST /api/deliveries/create
 * Logs a delivery. Deliveries live in punch_list with trade='delivery'.
 *
 * Writes go through the service-role client (from requirePermission). The
 * previous bare anon client matched no RLS policy on punch_list — every policy
 * targets `authenticated` or `service_role` — so every insert was rejected with
 * 42501 and this endpoint returned 500 for every delivery logged in the field.
 */
export async function POST(req: NextRequest) {
  const body: Record<string, unknown> = await req.json().catch(() => ({}));
  const projectId = (body.projectId || body.project_id || null) as string | null;

  const g = await requirePermission(req, 'Projects', 'Edit', { projectId });
  if (!g.ok) return g.res;

  const { db, user } = g;

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  const supplier = (body.supplier as string) || 'Unknown Supplier';

  const row = {
    tenant_id:   user.tenantId,
    project_id:  projectId,
    // punch_list.title is NOT NULL with no default — omitting it (as this route
    // used to) fails the insert outright.
    title:       (body.title as string) || `Delivery — ${supplier}`,
    description: body.description || `Delivery from ${supplier}`,
    location:    supplier,
    trade:       'delivery',
    status:      body.condition === 'Refused' ? 'flagged' : 'open',
    priority:    'normal',
    notes: JSON.stringify({
      po_number:     body.poNumber    || '',
      qty_ordered:   body.qtyOrdered  || '',
      qty_received:  body.qtyReceived || '',
      condition:     body.condition   || 'Accepted',
      received_by:   body.receivedBy  || '',
      delivery_time: new Date().toISOString(),
      extra_notes:   body.notes       || '',
    }),
    // The column is `photos` (jsonb). There is no `photo_urls` column — writing
    // to that name made PostgREST reject the whole insert.
    photos: (body.photoUrls || body.photo_urls || []) as string[],
  };

  const { data, error } = await db
    .from('punch_list')
    .insert(row as Database['public']['Tables']['punch_list']['Insert'])
    .select()
    .single();

  if (error) {
    console.error('[deliveries/create] insert failed:', error.message);
    return apiError('deliveries/create', error, 'Failed to log delivery');
  }

  return NextResponse.json({ success: true, delivery: data });
}
