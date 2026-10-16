import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Budget', 'View');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ invoice: data });
  } catch (e) {
    return apiError('invoices/[id] GET', e);
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
      'project_id', 'vendor_name', 'invoice_number', 'vendor_email',
      'description', 'category', 'cost_code', 'amount', 'tax',
      'total', 'due_date', 'status', 'notes',
    ];
    const fields: Record<string, any> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) fields[k] = body[k];
    }

    if (fields.status !== undefined && fields.status !== null) fields.status = String(fields.status).toLowerCase();
    // Money is server-canonical: any amount/tax change recomputes total from
    // the merged row — client-sent totals are never trusted.
    if (fields.amount !== undefined || fields.tax !== undefined) {
      const { data: cur } = await db.from('invoices').select('amount, tax').eq('id', id).eq('tenant_id', user.tenantId).single();
      const amt = fields.amount !== undefined ? Number(fields.amount) || 0 : Number((cur as any)?.amount) || 0;
      const tx = fields.tax !== undefined ? Number(fields.tax) || 0 : Number((cur as any)?.tax) || 0;
      fields.amount = amt; fields.tax = tx; fields.total = amt + tx;
    } else if (fields.total !== undefined) {
      fields.total = Number(fields.total) || 0;
    }

    const { data, error } = await db
      .from('invoices')
      .update(fields)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ invoice: data });
  } catch (e) {
    return apiError('invoices/[id] PATCH', e);
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
      .from('invoices')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('invoices/[id] DELETE', e);
  }
}
