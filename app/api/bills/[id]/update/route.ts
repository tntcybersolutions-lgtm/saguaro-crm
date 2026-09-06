import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { recomputeAfter } from '@/lib/commitments-server';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requirePermission(req, 'Budget', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  const body = await req.json().catch(() => ({}));
  try {
    const db = createServerClient();
    const ALLOWED_BILL_COLUMNS = [
      'project_id', 'bill_number', 'vendor_name', 'vendor_email', 'description', 'category',
      'cost_code', 'amount', 'tax', 'total', 'due_date', 'status', 'paid_at', 'paid_amount',
      'payment_method', 'check_number', 'pdf_url', 'notes', 'created_by', 'approved_by',
      'approved_at', 'updated_at',
    ];
    const updates: Record<string, any> = {};
    for (const k of ALLOWED_BILL_COLUMNS) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    const { data, error } = await db.from('bills').update(updates).eq('id', params.id).eq('tenant_id', user.tenantId).select().single();
    if (error) throw error;
    recomputeAfter(db, user.tenantId, (data as { project_id?: string } | null)?.project_id, 'bill:update');
    return NextResponse.json({ success: true, bill: data });
  } catch (err) {
    console.error('[bills/update]', err);
    return NextResponse.json({ error: 'Failed to update bill' }, { status: 500 });
  }
}
