import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Budget', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const body = await req.json().catch(() => ({}));
  try {
    const db = createServerClient();
    const ALLOWED_PO_COLUMNS = [
      'project_id', 'po_number', 'vendor_name', 'vendor_email', 'vendor_phone', 'vendor_address',
      'description', 'line_items', 'subtotal', 'tax', 'shipping', 'total', 'status', 'delivery_date',
      'delivered_at', 'cost_code', 'approved_by', 'approved_at', 'pdf_url', 'notes', 'created_by',
      'issued_date', 'updated_at',
    ];
    const updates: Record<string, any> = {};
    for (const k of ALLOWED_PO_COLUMNS) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    // The UI's "amount" and "required_date" are `total` and `delivery_date` here.
    // Accept the aliases rather than dropping them — a PATCH whose whole payload
    // falls outside the allow-list used to 200 while writing nothing.
    if (updates.total === undefined && body.amount !== undefined) updates.total = Number(body.amount) || 0;
    if (updates.delivery_date === undefined && body.required_date !== undefined) updates.delivery_date = body.required_date || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No savable fields in this update.' },
        { status: 400 },
      );
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await db.from('purchase_orders').update(updates).eq('id', params.id).eq('tenant_id', user.tenantId).select().maybeSingle();
    if (error) throw error;
    // No row matched — wrong id, or another tenant's PO. That is a failed write,
    // not a success, and the client must not report it as one.
    if (!data) return NextResponse.json({ error: 'Purchase order not found.' }, { status: 404 });
    return NextResponse.json({ success: true, purchase_order: data });
  } catch (err) {
    return apiError('purchase-orders/[id]/update PATCH', err, 'Failed to update purchase order');
  }
}
