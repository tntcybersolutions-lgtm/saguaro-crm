import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = createServerClient();
    const body = await req.json();
    const {
      projectId,
      name,
      originalTotal,
      revisedTotal,
      overheadPct = 10,
      profitPct = 10,
      contingencyPct = 10,
      lineItems = [],
    } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const tenantId = user.tenantId;

    // Create budget record
    const { data: budget, error: budgetErr } = await supabase
      .from('budgets')
      .insert({
        project_id: projectId,
        tenant_id: tenantId,
        name: name || 'Project Budget',
        status: 'draft',
        version: 1,
        original_total: originalTotal || 0,
        revised_total: revisedTotal || originalTotal || 0,
        committed_total: 0,
        actual_total: 0,
        variance: revisedTotal || originalTotal || 0,
        overhead_pct: overheadPct,
        profit_pct: profitPct,
        contingency_pct: contingencyPct,
      })
      .select()
      .single();

    if (budgetErr) throw budgetErr;

    // Create budget line items
    if (lineItems.length > 0 && budget) {
      const rows = lineItems.map((item: Record<string, unknown>, idx: number) => ({
        budget_id: budget.id,
        tenant_id: tenantId,
        cost_code: item.costCode || `${String(idx + 1).padStart(4, '0')}`,
        csi_division: item.csiDivision || '',
        description: item.description || '',
        category: item.category || 'material',
        unit: item.unit || 'LS',
        quantity: item.quantity || 1,
        unit_cost: item.unitCost || 0,
        original_amount: item.originalAmount || 0,
        revised_amount: item.revisedAmount || item.originalAmount || 0,
        committed: 0,
        actual: 0,
        projected: item.originalAmount || 0,
        variance: item.originalAmount || 0,
        percent_complete: 0,
      }));

      // Insert in batches of 50
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error: itemErr } = await supabase
          .from('budget_line_items')
          .insert(batch);
        if (itemErr) {
          console.error('[budgets/create] line item insert error:', itemErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: budget,
      lineItemCount: lineItems.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create budget';
    console.error('[budgets/create]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
