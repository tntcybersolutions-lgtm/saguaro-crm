import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import {
  toCents,
  toDollars,
  sumCents,
  subCents,
  summarizeContract,
  type Cents,
} from '@/lib/calc';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

// GET /api/financial/project-report?projectId= -> { summary: FinancialSummary }
// Reads the stored financial roll-up columns on the project row.
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  try {
    const db = createServerClient();
    const [projectRes, payAppsRes, changeOrdersRes] = await Promise.all([
      db
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .eq('tenant_id', user.tenantId)
        .single(),
      db
        .from('pay_applications')
        .select('current_payment_due, total_retainage')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId),
      db
        .from('change_orders')
        .select('amount')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)
        .eq('status', 'approved'),
    ]);
    const { data: p, error } = projectRes;
    if (error) throw error;
    if (!p) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const num = (v: unknown) => Number(v) || 0;

    // Recompute money from child tables; fall back to the projects roll-up
    // columns only when a child aggregate is null (no child rows at all).
    // All sums are done in integer cents via the engine — never on floats.
    const sumOrNull = (rows: Record<string, unknown>[] | null, key: string): Cents | null => {
      if (!rows || rows.length === 0) return null;
      return sumCents(rows.map((r) => toCents(num(r[key]))));
    };

    const payApps = payAppsRes.error ? null : payAppsRes.data;
    const changeOrders = changeOrdersRes.error ? null : changeOrdersRes.data;

    const billedFromChildren = sumOrNull(payApps, 'current_payment_due');
    const retainageFromChildren = sumOrNull(payApps, 'total_retainage');
    const cosFromChildren = sumOrNull(changeOrders, 'amount');

    // DB stores dollars; convert to cents for all arithmetic.
    // Original contract = first POSITIVE of these columns (|| not ??): most
    // projects leave several at 0 (not null) and carry the real value in
    // whichever is non-zero, so ?? would stop at a leading 0 and report a $0
    // contract. Matches the native app (financials.tsx / change-orders.tsx).
    const originalContractCents = toCents(
      num(p.original_contract_value) || num(p.contract_value) || num(p.original_contract) || num(p.contract_amount),
    );
    const approvedCosCents =
      cosFromChildren != null ? cosFromChildren : toCents(num(p.approved_change_orders ?? p.net_change_by_co));
    const billedToDateCents =
      billedFromChildren != null ? billedFromChildren : toCents(num(p.billed_to_date ?? p.total_billed));
    const retainageHeldCents =
      retainageFromChildren != null ? retainageFromChildren : toCents(num(p.retainage_held ?? p.total_retainage));

    // Revised contract = original + APPROVED change orders only. The
    // change_orders query above is already scoped to status='approved', so the
    // summed amount is fed in as a single approved line.
    const { revisedContract: revisedContractCents } = summarizeContract(originalContractCents, [
      { id: 'approved-cos', description: 'Approved change orders', amount: approvedCosCents, status: 'approved' },
    ]);

    const balanceToFinishCents = subCents(revisedContractCents, billedToDateCents);
    const percent_billed =
      revisedContractCents > 0 ? Math.round((billedToDateCents / revisedContractCents) * 100) : 0;

    return NextResponse.json({
      summary: {
        original_contract: toDollars(originalContractCents),
        approved_cos: toDollars(approvedCosCents),
        revised_contract: toDollars(revisedContractCents),
        billed_to_date: toDollars(billedToDateCents),
        retainage_held: toDollars(retainageHeldCents),
        balance_to_finish: toDollars(balanceToFinishCents),
        percent_billed,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('financial/project-report', e);
  }
}
