import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { summarizeContract, toCents, toDollars, type ChangeOrder } from '@/lib/calc';

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; id: string } }) {
  const g = await requirePermission(req, 'Budget', 'Edit', { projectId: params.projectId });
  if (!g.ok) return g.res;
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = ['title','contract_type','vendor_name','vendor_email','original_amount','approved_changes','retainage_pct','start_date','end_date','status','scope_of_work','insurance_required','insurance_verified','bonding_verified','notes','invoiced_amount','paid_amount'];
    for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k];
    // Two UI names have different column names. Sending them raw made PostgREST
    // reject the whole PATCH, which the page then queued for a doomed retry.
    if (body.signed_date !== undefined) updates.executed_date = body.signed_date || null;
    if (body.description !== undefined) updates.scope_summary = body.description;
    // bonding_required is TEXT on this table, not the boolean the UI models.
    if (body.bonding_required !== undefined) updates.bonding_required = String(body.bonding_required);

    // Revised/adjusted contract money is computed by the exact-cents engine.
    // Only APPROVED change orders move the contract; pending/rejected are excluded.
    // DB stores dollars, so convert to cents for math and back to dollars to store.
    if (body.original_amount !== undefined || Array.isArray(body.change_orders)) {
      const originalCents = toCents((body.original_amount ?? 0) as number | string);
      const changeOrders: ChangeOrder[] = Array.isArray(body.change_orders)
        ? body.change_orders.map((c: { id?: string; description?: string; amount: number | string; status: ChangeOrder['status'] }) => ({
            id: String(c.id ?? ''),
            description: String(c.description ?? ''),
            amount: toCents(c.amount),
            status: c.status,
          }))
        : [];
      const summary = summarizeContract(originalCents, changeOrders);
      updates.original_amount = toDollars(summary.originalContract);
      updates.approved_changes = toDollars(summary.approvedChangeOrders);
    } else if (body.approved_changes !== undefined) {
      // Normalize a directly-supplied approved-changes value through the cents engine.
      updates.approved_changes = toDollars(toCents(body.approved_changes as number | string));
    }

    // Tenant-scope the write — service-role bypasses RLS; project_id from the URL
    // is attacker-controlled, so it alone does NOT prove tenant ownership.
    const { data, error } = await supabase.from('contracts').update(updates).eq('id', params.id).eq('project_id', params.projectId).eq('tenant_id', g.user.tenantId).select().maybeSingle();
    if (error) throw error;
    // No row matched — wrong id, wrong project, or another tenant. Failed write.
    if (!data) return NextResponse.json({ error: 'Contract not found.' }, { status: 404 });
    return NextResponse.json({ contract: data });
  } catch (e: unknown) {
    console.error('[projects/contracts/PATCH]', e);
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[projects/projectId/contracts/id]', e);
    const msg = "Failed to update the contract.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
