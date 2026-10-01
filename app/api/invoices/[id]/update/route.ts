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

    if (updates.status !== undefined && updates.status !== null) updates.status = String(updates.status).toLowerCase();
    // Money is server-canonical: any amount/tax change recomputes total from
    // the merged row — client-sent totals are never trusted.
    if (updates.amount !== undefined || updates.tax !== undefined) {
      const { data: cur } = await db.from('invoices').select('amount, tax').eq('id', params.id).eq('tenant_id', user.tenantId).single();
      const amt = updates.amount !== undefined ? Number(updates.amount) || 0 : Number((cur as any)?.amount) || 0;
      const tx = updates.tax !== undefined ? Number(updates.tax) || 0 : Number((cur as any)?.tax) || 0;
      updates.amount = amt; updates.tax = tx; updates.total = amt + tx;
    } else if (updates.total !== undefined) {
      updates.total = Number(updates.total) || 0;
    }
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
