import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { stampPayment, type InvoiceMoneyRow } from '@/lib/invoice-payment';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Budget', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const body = await req.json().catch(() => ({}));
  try {
    const db = createServerClient();
    const ALLOWED_INVOICE_COLUMNS = [
      'project_id', 'invoice_number', 'vendor_name', 'vendor_email', 'description', 'category',
      'cost_code', 'amount', 'tax', 'total', 'due_date', 'status', 'paid_at', 'paid_amount',
      'payment_method', 'check_number', 'pdf_url', 'notes', 'created_by', 'approved_by',
      'approved_at', 'updated_at', 'qbo_id',
    ];
    const updates: Record<string, any> = {};
    for (const k of ALLOWED_INVOICE_COLUMNS) {
      if (body[k] !== undefined) updates[k] = body[k];
    }

    /* Moving an invoice to another job: the job must be one of this tenant's.
       The id comes from the browser, so it is checked, never trusted. */
    if (updates.project_id) {
      const { data: proj } = await db.from('projects').select('id')
        .eq('id', updates.project_id).eq('tenant_id', user.tenantId).maybeSingle();
      if (!proj) return NextResponse.json({ error: 'project_id is not a project on this account' }, { status: 400 });
    }

    if (updates.status !== undefined && updates.status !== null) updates.status = String(updates.status).toLowerCase();
    const { data: cur, error: curErr } = await db.from('invoices').select('status, amount, tax, total, paid_at, paid_amount')
      .eq('id', params.id).eq('tenant_id', user.tenantId).maybeSingle();
    if (curErr) throw curErr;
    if (!cur) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    // Money is server-canonical: any amount/tax change recomputes total from
    // the merged row — client-sent totals are never trusted.
    if (updates.amount !== undefined || updates.tax !== undefined) {
      const amt = updates.amount !== undefined ? Number(updates.amount) || 0 : Number((cur as any)?.amount) || 0;
      const tx = updates.tax !== undefined ? Number(updates.tax) || 0 : Number((cur as any)?.tax) || 0;
      updates.amount = amt; updates.tax = tx; updates.total = amt + tx;
    } else if (updates.total !== undefined) {
      updates.total = Number(updates.total) || 0;
    }
    // Status → Paid records the payment: when, and how much (lib/invoice-payment).
    stampPayment(updates, cur as InvoiceMoneyRow);
    const { data, error } = await db.from('invoices').update(updates).eq('id', params.id).eq('tenant_id', user.tenantId).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, invoice: data });
  } catch (err) {
    // This route records payment (status→paid, paid_at, paid_amount, check_number).
    // A payment write that failed used to log but return a flat 'Failed to update
    // invoice' with no correlation id — exactly the call a GC makes to support.
    // apiError keeps the log and adds the id that ties screen to server line (§3).
    return apiError('invoices/update', err, 'Could not update the invoice');
  }
}
