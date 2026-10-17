import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { transitionPoStatus } from '@/lib/purchase-order-status';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Budget', 'View');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('purchase_orders')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ purchaseOrder: data });
  } catch (e) {
    return apiError('purchase-orders/[id] GET', e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Budget', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const body = await req.json();
    const db = createServerClient();

    const allowed = [
      'vendor_name', 'po_number', 'vendor_email', 'vendor_phone', 'vendor_address',
      'description', 'line_items', 'subtotal', 'tax', 'shipping', 'total',
      'status', 'delivery_date', 'cost_code', 'notes',
    ];
    const fields: Record<string, any> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) fields[k] = body[k];
    }

    // A status in the edit moves along the one transition map (lib/purchase-order-status).
    if (fields.status !== undefined) {
      const { status, ...rest } = fields;
      const r = await transitionPoStatus(db, user.tenantId, id, status, { actorId: user.id, extra: rest });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      return NextResponse.json({ purchaseOrder: r.after });
    }

    const { data, error } = await db
      .from('purchase_orders')
      .update(fields)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ purchaseOrder: data });
  } catch (e) {
    return apiError('purchase-orders/[id] PATCH', e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Budget', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const db = createServerClient();
    const { error } = await db
      .from('purchase_orders')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('purchase-orders/[id] DELETE', e);
  }
}
