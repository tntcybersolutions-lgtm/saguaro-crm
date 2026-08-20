import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { projectId } = await params;
    const body = await req.json();
    const {
      amount, entry_date, entry_type, vendor_name,
      invoice_number, description, csi_division,
      commitment_id, period_from, period_to,
    } = body;

    if (!amount) return NextResponse.json({ error: 'Missing required field: amount' }, { status: 400 });
    if (!entry_date) return NextResponse.json({ error: 'Missing required field: entry_date' }, { status: 400 });
    if (!description) return NextResponse.json({ error: 'Missing required field: description' }, { status: 400 });

    const db = createServerClient();
    const parsedAmount = parseFloat(amount);

    // Find budget line item for this division
    let budgetLineItemId: string | null = null;
    if (csi_division) {
      const { data: bli } = await db
        .from('budget_line_items')
        .select('id')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)
        .eq('csi_division', csi_division)
        .maybeSingle();
      budgetLineItemId = bli?.id || null;
    }

    // Insert cost entry
    const { data: costEntry, error: ceErr } = await db
      .from('cost_entries')
      .insert({
        project_id: projectId,
        tenant_id: user.tenantId,
        commitment_id: commitment_id || null,
        budget_line_item_id: budgetLineItemId,
        amount: parsedAmount,
        entry_date,
        entry_type: entry_type || 'invoice',
        vendor_name: vendor_name || null,
        invoice_number: invoice_number || null,
        description,
        csi_division: csi_division || null,
        period_from: period_from || null,
        period_to: period_to || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (ceErr) throw ceErr;

    // Update budget line item cost_to_date atomically
    if (budgetLineItemId) {
      await db.rpc('increment_budget_cost_to_date', {
        p_line_item_id: budgetLineItemId,
        p_amount: parsedAmount,
      }).then(() => {}, () => {});
    }

    // Update commitment invoiced_to_date
    if (commitment_id) {
      const { data: commit } = await db
        .from('commitments')
        .select('invoiced_to_date')
        .eq('id', commitment_id)
        .eq('tenant_id', user.tenantId)
        .single();

      if (commit) {
        await db
          .from('commitments')
          .update({
            invoiced_to_date: (commit.invoiced_to_date || 0) + parsedAmount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', commitment_id)
          .eq('tenant_id', user.tenantId)
          .then(() => {}, () => {});
      }
    }

    // Fetch updated line item to return
    let updatedLineItem = null;
    if (budgetLineItemId) {
      const { data } = await db
        .from('budget_line_items')
        .select('*')
        .eq('id', budgetLineItemId)
        .eq('tenant_id', user.tenantId)
        .single();
      updatedLineItem = data;
    }

    return NextResponse.json({ cost_entry: costEntry, updated_line_item: updatedLineItem });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
