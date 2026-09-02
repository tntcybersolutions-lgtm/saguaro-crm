import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Budget', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const db = createServerClient();
    // Map incoming aliases to real `contracts` columns; drop fields with no column.
    const fieldMap: Record<string, string> = {
      title: 'title',
      contract_number: 'contract_number',
      status: 'status',
      type: 'contract_type',
      contract_type: 'contract_type',
      value: 'amount',
      amount: 'amount',
      // The field page's "Revised Amount" IS the current commitment — it lives in
      // `amount`. These four used to have no entry here, so a money edit produced
      // an empty patch that the route happily 200-ed on while writing nothing.
      revised_amount: 'amount',
      original_amount: 'original_amount',
      approved_changes: 'approved_changes',
      invoiced_amount: 'invoiced_amount',
      paid_amount: 'paid_amount',
      start_date: 'start_date',
      end_date: 'end_date',
      description: 'scope_of_work',
      scope_of_work: 'scope_of_work',
      project_id: 'project_id',
      notes: 'notes',
      retainage_percent: 'retainage_pct',
      retainage_pct: 'retainage_pct',
      signed_date: 'executed_date',
      executed_date: 'executed_date',
    };
    const fields: Record<string, any> = {};
    for (const k of Object.keys(fieldMap)) {
      if (body[k] !== undefined) fields[fieldMap[k]] = body[k];
    }
    // `original_amount` is a TEXT column; hand it a string so PostgREST does not
    // reject a numeric edit. Everything else money-shaped goes in as a number.
    if (fields.original_amount !== undefined) fields.original_amount = String(fields.original_amount);
    for (const k of ['amount', 'approved_changes', 'invoiced_amount', 'paid_amount', 'retainage_pct']) {
      if (fields[k] !== undefined) fields[k] = Number(fields[k]) || 0;
    }

    // Refuse an update we cannot persist rather than reporting success on a
    // no-op. A silently-dropped money edit is exactly the bug this guards.
    if (Object.keys(fields).length === 0) {
      const unknown = Object.keys(body).filter((k) => !(k in fieldMap));
      return NextResponse.json(
        { error: unknown.length ? `No savable fields in this update (${unknown.join(', ')}).` : 'Nothing to update.' },
        { status: 400 },
      );
    }
    fields.updated_at = new Date().toISOString();

    const { data: updated, error } = await db
      .from('contracts')
      .update(fields)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select('id, project_id, bid_package_id, contract_type, amount, original_amount, status, executed_at')
      .maybeSingle();
    if (error) throw error;
    // No row matched — wrong id, or another tenant's contract. Failed write.
    if (!updated) return NextResponse.json({ error: 'Contract not found.' }, { status: 404 });

    // ── EXECUTION CASCADE: an executed subcontract is no longer a dead end —
    //    stamp executed_at, mark its bid package contracted, and make sure the
    //    committed amount reached the budget (idempotent: only when the award
    //    path didn't already commit it via the same cost code). ──
    const c = updated as Record<string, any> | null;
    if (fields.status === 'executed' && c) {
      const patch: Record<string, unknown> = {};
      if (!c.executed_at) patch.executed_at = new Date().toISOString();
      if (Object.keys(patch).length) {
        await must(db.from('contracts').update(patch as never).eq('id', id).eq('tenant_id', user.tenantId), 'contracts update');
      }
      if (c.bid_package_id) {
        await must(db.from('bid_packages')
          .update({ status: 'contracted' } as never)
          .eq('id', c.bid_package_id)
          .eq('tenant_id', user.tenantId)
          .eq('status', 'awarded'), 'bid_packages write');
      }
    }

    return NextResponse.json({ success: true, contract: updated });
  } catch (e) {
    console.error('[contracts/update]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
