import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { recomputeAfter } from '@/lib/commitments-server';
import { must } from '@/lib/db-write';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Budget', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const body = await req.json().catch(() => ({}));

    if (!body.project_id || !body.vendor_name) {
      return NextResponse.json({ error: 'Missing required fields: project_id, vendor_name' }, { status: 400 });
    }

    const db = createServerClient();

    const { data, error } = await db.from('purchase_orders').insert({
      tenant_id: user.tenantId,
      created_by: user.id,
      project_id: body.project_id,
      vendor_name: body.vendor_name,
      po_number: body.po_number || null,
      vendor_email: body.vendor_email || null,
      vendor_phone: body.vendor_phone || null,
      vendor_address: body.vendor_address || null,
      description: body.description || null,
      line_items: body.line_items || null,
      subtotal: body.subtotal || null,
      tax: body.tax || null,
      shipping: body.shipping || null,
      total: body.total || null,
      status: body.status || null,
      delivery_date: body.delivery_date || null,
      cost_code: body.cost_code || null,
      notes: body.notes || null,
    }).select().single();

    if (error) throw error;

    /* A PO is a COMMITMENT, so committed cost has to move. This used to do
       `committed = committed + total` right here, which only ever added: a PO
       that was later cancelled, edited down or deleted left its full value
       committed forever. The rollup recomputes from source — lib/commitments.ts. */
    recomputeAfter(db, user.tenantId, body.project_id, 'po:create');

    return NextResponse.json({ purchaseOrder: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
