import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';
import { assertProjectInTenant } from '@/lib/assert-project';

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
    // project_id comes from the body: it must be one of the caller's jobs.
    const notOurs = await assertProjectInTenant(db, user.tenantId, body.project_id);
    if (notOurs) return notOurs;

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

    // ── A PO is a COMMITMENT — roll its total into the matching budget line so
    //    committed cost never goes stale (same matching the CO cascade uses). ──
    const total = Number(body.total) || Number(body.subtotal) || 0;
    if (total > 0 && body.cost_code) {
      const div = String(body.cost_code).slice(0, 2);
      const { data: bLine } = await db
        .from('budget_lines')
        .select('id, committed')
        .eq('project_id', body.project_id)
        .eq('tenant_id', user.tenantId)
        .or(`cost_code.eq.${body.cost_code},division.eq.${div}`)
        .limit(1)
        .maybeSingle();
      if (bLine) {
        await must(db.from('budget_lines')
          .update({ committed: ((bLine as { committed: number | null }).committed || 0) + total })
          .eq('id', (bLine as { id: string }).id), 'budget_lines write');
      }
    }

    return NextResponse.json({ purchaseOrder: data });
  } catch (e) {
    return apiError('purchase-orders/create', e, "Couldn't create the purchase order. Please try again.");
  }
}
