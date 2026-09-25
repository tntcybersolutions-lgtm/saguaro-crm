import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { toCents, toDollars, sumCents, subCents, scaleCents } from '@/lib/calc';

function monthLabel(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

function monthRange(offset: number): { start: string; end: string } {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServerClient();

    // Verify project belongs to tenant
    const { data: project, error: pErr } = await db
      .from('projects')
      .select('id, name, original_contract_value, contract_value, original_contract, contract_amount, retainage_pct, start_date, end_date, status')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (pErr || !project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const p = project as any;

    // Fetch all financial data in parallel
    const [
      { data: payApps },
      { data: invoices },
      { data: bills },
      { data: contracts },
      { data: changeOrders },
    ] = await Promise.all([
      db.from('pay_applications')
        .select('id, app_number, status, period_to, current_payment_due, retainage_held, total_completed_stored, created_at')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)
        .order('app_number', { ascending: true }),
      db.from('invoices')
        .select('id, invoice_number, vendor_name, amount, status, due_date, description, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      db.from('bills')
        .select('id, vendor_name, amount, status, due_date, description, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      db.from('contracts')
        .select('id, party_company, contract_amount, status, retainage_pct, created_at')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId),
      db.from('change_orders')
        .select('id, title, amount, status, created_at')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId),
    ]);

    const allPayApps = (payApps || []) as any[];
    const allInvoices = (invoices || []) as any[];
    const allBills = (bills || []) as any[];
    const allContracts = (contracts || []) as any[];
    const allCOs = (changeOrders || []) as any[];

    // Contract totals (all money math in integer cents). Original = first
    // POSITIVE contract column (see project-report/route.ts) — many projects
    // leave contract_amount at 0 and carry the value in contract_value.
    const contractAmountCents = toCents(p.original_contract_value || p.contract_value || p.original_contract || p.contract_amount || 0);
    const retainagePct = p.retainage_pct || 10;
    const approvedCOs = allCOs.filter((co: any) => co.status === 'approved');
    const totalCOAmountCents = sumCents(approvedCOs.map((co: any) => toCents(co.amount || 0)));
    const adjustedContractCents = sumCents([contractAmountCents, totalCOAmountCents]);

    /* Total billed so far — the LATEST application's figure, not a sum.
       total_completed_stored is AIA G702 line 4, "Total Completed and Stored
       to Date": already cumulative on every application, so adding them counts
       application 1's work once for every application that followed it.

       This fed remainingToBill, which feeds the monthly billing target below —
       so on a job billed to $3.73M across six applications it computed $13.8M
       billed, clamped remaining-to-bill to zero, and forecast that there was
       nothing left to bill on a job 44% complete. A contractor plans payroll
       off that number.

       Ties on app_number happen in real data; break them on the larger
       cumulative total so a stray duplicate carrying 0 can never win and zero
       out the whole forecast. (Same rule as the mobile app's financials
       screen, which is where this reasoning was already written down.) */
    const latestPayApp = allPayApps.reduce<any | null>((best, a) => {
      if (!best) return a;
      const an = Number(a.app_number) || 0, bn = Number(best.app_number) || 0;
      if (an !== bn) return an > bn ? a : best;
      return (Number(a.total_completed_stored) || 0) > (Number(best.total_completed_stored) || 0) ? a : best;
    }, null);
    const totalBilledCents = toCents(latestPayApp?.total_completed_stored || 0);
    const remainingToBillCents = Math.max(0, subCents(adjustedContractCents, totalBilledCents));

    // Total retainage held
    const totalRetainageHeldCents = sumCents(allPayApps.map((pa: any) => toCents(pa.retainage_held || 0)));

    // Outstanding payables
    const unpaidBills = allBills.filter((b: any) => b.status !== 'paid');
    const unpaidInvoices = allInvoices.filter((inv: any) => inv.status !== 'paid');

    // Sub contract totals for payable projections
    const subContractTotalCents = sumCents(allContracts.map((c: any) => toCents(c.contract_amount || 0)));
    const paidBillsTotalCents = sumCents(
      allBills.filter((b: any) => b.status === 'paid').map((b: any) => toCents(b.amount || 0))
    );
    const remainingSubPayableCents = Math.max(0, subCents(subContractTotalCents, paidBillsTotalCents));

    // Build 6 monthly periods
    const periodCount = 6;
    const monthlyBillingTargetCents = remainingToBillCents > 0 ? scaleCents(remainingToBillCents, 1 / periodCount) : 0;
    const monthlyPayableTargetCents = remainingSubPayableCents > 0 ? scaleCents(remainingSubPayableCents, 1 / periodCount) : 0;

    let runningBalanceCents = 0;
    const periods: any[] = [];
    // Accumulate period receivables/payables in cents so the summary totals
    // are exact sums of the per-period figures (no rounded-then-resummed drift).
    let totalReceivablesCents = 0;
    let totalPayablesCents = 0;

    for (let i = 0; i < periodCount; i++) {
      const range = monthRange(i);
      const label = monthLabel(i);

      // Receivables: scheduled pay apps that fall in this period + projected billing
      const periodPayApps = allPayApps.filter((pa: any) => {
        const dt = pa.period_to || pa.created_at;
        return dt && dt >= range.start && dt <= range.end;
      });
      const scheduledReceivablesCents = sumCents(
        periodPayApps.map((pa: any) => toCents(pa.current_payment_due || 0))
      );
      // If no scheduled pay apps, use projected monthly billing
      const receivablesCents = scheduledReceivablesCents > 0 ? scheduledReceivablesCents : monthlyBillingTargetCents;

      // Payables: bills/invoices due in this period + projected sub payments
      const periodBills = unpaidBills.filter((b: any) => {
        const due = b.due_date || b.created_at;
        return due && due >= range.start && due <= range.end;
      });
      const periodInvoices = unpaidInvoices.filter((inv: any) => {
        const due = inv.due_date || inv.created_at;
        return due && due >= range.start && due <= range.end;
      });
      const scheduledBillPayablesCents = sumCents(periodBills.map((b: any) => toCents(b.amount || 0)));
      const scheduledInvoicePayablesCents = sumCents(periodInvoices.map((inv: any) => toCents(inv.amount || 0)));
      const scheduledPayablesCents = sumCents([scheduledBillPayablesCents, scheduledInvoicePayablesCents]);
      const payablesCents = scheduledPayablesCents > 0 ? scheduledPayablesCents : monthlyPayableTargetCents;

      // Retainage release: assume last period releases all retainage
      const retainageReleaseCents = i === periodCount - 1 ? totalRetainageHeldCents : 0;

      const netCents = sumCents([subCents(receivablesCents, payablesCents), retainageReleaseCents]);
      runningBalanceCents += netCents;
      totalReceivablesCents += receivablesCents;
      totalPayablesCents += payablesCents;

      // Line items for expandable detail
      const lineItems: any[] = [];
      if (periodPayApps.length > 0) {
        periodPayApps.forEach((pa: any) => {
          lineItems.push({
            type: 'receivable',
            label: `Pay App #${pa.app_number}`,
            amount: toDollars(toCents(pa.current_payment_due || 0)),
          });
        });
      } else {
        lineItems.push({
          type: 'receivable',
          label: 'Projected billing',
          amount: toDollars(monthlyBillingTargetCents),
        });
      }

      periodBills.forEach((b: any) => {
        lineItems.push({
          type: 'payable',
          label: `Bill: ${b.vendor_name || 'Vendor'}`,
          amount: toDollars(subCents(0, toCents(b.amount || 0))),
        });
      });
      periodInvoices.forEach((inv: any) => {
        lineItems.push({
          type: 'payable',
          label: `Invoice: ${inv.vendor_name || 'Vendor'} #${inv.invoice_number || ''}`,
          amount: toDollars(subCents(0, toCents(inv.amount || 0))),
        });
      });
      if (scheduledPayablesCents === 0 && monthlyPayableTargetCents > 0) {
        lineItems.push({
          type: 'payable',
          label: 'Projected sub payments',
          amount: toDollars(subCents(0, monthlyPayableTargetCents)),
        });
      }
      if (retainageReleaseCents > 0) {
        lineItems.push({
          type: 'retainage',
          label: 'Retainage release',
          amount: toDollars(retainageReleaseCents),
        });
      }

      periods.push({
        month: label,
        start: range.start,
        end: range.end,
        receivables: toDollars(receivablesCents),
        payables: toDollars(payablesCents),
        retainage_release: toDollars(retainageReleaseCents),
        net: toDollars(netCents),
        running_balance: toDollars(runningBalanceCents),
        line_items: lineItems,
      });
    }

    const netCashFlowCents = sumCents([subCents(totalReceivablesCents, totalPayablesCents), totalRetainageHeldCents]);
    const dangerZone = periods.some((p) => p.running_balance < 0);

    return NextResponse.json({
      project: {
        id: p.id,
        name: p.name,
        contract_amount: toDollars(contractAmountCents),
        adjusted_contract: toDollars(adjustedContractCents),
        retainage_pct: retainagePct,
        total_billed: toDollars(totalBilledCents),
        remaining_to_bill: toDollars(remainingToBillCents),
        total_retainage_held: toDollars(totalRetainageHeldCents),
      },
      periods,
      summary: {
        total_receivables: toDollars(totalReceivablesCents),
        total_payables: toDollars(totalPayablesCents),
        net_cash_flow: toDollars(netCashFlowCents),
        retainage_due: toDollars(totalRetainageHeldCents),
        danger_zone: dangerZone,
      },
    });
  } catch (e) {
    console.error('Cash flow projection error:', e);
    return NextResponse.json({ error: 'Failed to generate cash flow projection' }, { status: 500 });
  }
}
