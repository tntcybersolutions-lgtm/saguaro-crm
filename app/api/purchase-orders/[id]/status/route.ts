import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Budget', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const body = await req.json().catch(() => ({}));
  if (!body.status) return NextResponse.json({ error: 'Status is required' }, { status: 400 });
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('purchase_orders')
      .update({ status: body.status })
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, purchase_order: data });
  } catch (err) {
    return apiError('purchase-orders/[id]/status PATCH', err, 'Failed to update purchase order status');
  }
}
