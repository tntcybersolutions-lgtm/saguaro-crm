import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

import { apiError } from '@/lib/api-error';
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const db = createServerClient();
    // Real tm_tickets columns only. The previous list used imaginary column names
    // (markup_percent / material_cost / total_amount / priority / assigned_to) that
    // don't exist, and it ignored the `markup_pct_adjust` flag the field UI sends —
    // so `fields` came out empty and `.update({})` was a silent 0-change no-op.
    const allowed = [
      'description', 'work_date', 'labor', 'labor_total', 'materials', 'materials_total',
      'equipment', 'equipment_total', 'markup_pct', 'tax_pct', 'total', 'status',
      'approved_by', 'approved_at', 'signature_url', 'contractor_signature',
      'owner_signature', 'pdf_url', 'notes',
    ];
    const fields: Record<string, any> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) fields[k] = body[k];
    }

    // Relative markup adjustment: the swipe action sends { markup_pct_adjust: delta }.
    // Apply it against the current value and recompute the total server-side.
    if (body.markup_pct_adjust !== undefined) {
      const { data: cur } = await db
        .from('tm_tickets')
        .select('markup_pct, labor_total, materials_total, equipment_total, tax_pct')
        .eq('id', id)
        .eq('tenant_id', user.tenantId)
        .single();
      if (!cur) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      const c = cur as unknown as Record<string, unknown>;
      const newMarkup = Math.max(0, (Number(c.markup_pct) || 0) + Number(body.markup_pct_adjust));
      const sub = (Number(c.labor_total) || 0) + (Number(c.materials_total) || 0) + (Number(c.equipment_total) || 0);
      const mk = (sub * newMarkup) / 100;
      const tx = ((sub + mk) * (Number(c.tax_pct) || 0)) / 100;
      fields.markup_pct = newMarkup;
      fields.total = sub + mk + tx;
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }
    fields.updated_at = new Date().toISOString();
    const { data, error } = await db
      .from('tm_tickets')
      .update(fields as never)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) {
      const status = error.code === 'PGRST116' ? 404 : 500;
      return apiError('tm-tickets/id/update', error, "Failed to update ticket", status);
    }
    return NextResponse.json({ success: true, ticket: data });
  } catch (err) {
    console.error('[tm-tickets/update]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
