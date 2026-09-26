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
        .select('app_number, current_payment_due, total_retainage, total_completed_stored')
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

    /* TWO OF THESE THREE FIGURES WERE SUMS OF THINGS THAT MUST NOT BE SUMMED.
       Both surfaced by putting the same project through every financial
       endpoint at once and comparing: this route disagreed with the project
       API on billed-to-date by exactly one retainage, and with the cash-flow
       forecast on retainage held by a factor of four.

       BILLED TO DATE. This summed current_payment_due — each period's draw —
       and labelled the total "billed to date". On a job billed to $3,730,000
       that produced $3,357,000, because the draws are already net of
       retainage. Both numbers are real; only one is billed-to-date. AIA G702
       line 4, Total Completed and Stored to Date, is what a GC means by
       billed, it is what the project API returns, and it is what the field
       app's financials screen shows. This route was the outlier, so two
       screens in the same product quoted a customer different numbers under
       the same heading.

       RETAINAGE HELD. total_retainage is derived from total_completed_stored
       and is therefore cumulative too. Summing six applications gave
       $1,383,100 against a true $373,000 — the same double-count already
       fixed in the field app's burn chart, its command centre, and the
       cash-flow forecast. This is the fourth place it lived.

       Both are now the LATEST application's value. Ties on app_number break on
       the larger cumulative total so a stray duplicate carrying 0 cannot win. */
    const latestApp = (payApps ?? []).reduce<Record<string, unknown> | null>((best, a) => {
      if (!best) return a as Record<string, unknown>;
      const an = num((a as Record<string, unknown>).app_number);
      const bn = num(best.app_number);
      if (an !== bn) return an > bn ? (a as Record<string, unknown>) : best;
      return num((a as Record<string, unknown>).total_completed_stored) > num(best.total_completed_stored)
        ? (a as Record<string, unknown>)
        : best;
    }, null);

    const billedFromChildren = latestApp ? toCents(num(latestApp.total_completed_stored)) : null;
    const retainageFromChildren = latestApp ? toCents(num(latestApp.total_retainage)) : null;
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
