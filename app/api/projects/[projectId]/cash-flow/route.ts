import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

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
      .select('id, name, contract_amount, retainage_pct, start_date, end_date, status')
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
        .eq('tenant_id', user.tenantId)
        .order('created_at', { ascending: false }),
      db.from('bills')
        .select('id, vendor_name, amount, status, due_date, description, created_at')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)
        .order('created_at', { ascending: false }),
      db.from('contracts')
        .select('id, company_name, contract_amount, status, retainage_pct, created_at')
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

    // Contract totals
    const contractAmount = p.contract_amount || 0;
    const retainagePct = p.retainage_pct || 10;
    const approvedCOs = allCOs.filter((co: any) => co.status === 'approved');
    const totalCOAmount = approvedCOs.reduce((s: number, co: any) => s + (co.amount || 0), 0);
    const adjustedContract = contractAmount + totalCOAmount;

    // Total billed so far
    const totalBilled = allPayApps.reduce((s: number, pa: any) => s + (pa.total_completed_stored || 0), 0);
    const remainingToBill = Math.max(0, adjustedContract - totalBilled);

    // Total retainage held
    const totalRetainageHeld = allPayApps.reduce((s: number, pa: any) => s + (pa.retainage_held || 0), 0);

    // Outstanding payables
    const unpaidBills = allBills.filter((b: any) => b.status !== 'paid');
    const unpaidInvoices = allInvoices.filter((inv: any) => inv.status !== 'paid');

    // Sub contract totals for payable projections
    const subContractTotal = allContracts.reduce((s: number, c: any) => s + (c.contract_amount || 0), 0);
    const paidBillsTotal = allBills.filter((b: any) => b.status === 'paid').reduce((s: number, b: any) => s + (b.amount || 0), 0);
    const remainingSubPayable = Math.max(0, subContractTotal - paidBillsTotal);

    // Build 6 monthly periods
    const periodCount = 6;
    const monthlyBillingTarget = remainingToBill > 0 ? remainingToBill / periodCount : 0;
    const monthlyPayableTarget = remainingSubPayable > 0 ? remainingSubPayable / periodCount : 0;

    let runningBalance = 0;
    const periods: any[] = [];

    for (let i = 0; i < periodCount; i++) {
      const range = monthRange(i);
      const label = monthLabel(i);

      // Receivables: scheduled pay apps that fall in this period + projected billing
      const periodPayApps = allPayApps.filter((pa: any) => {
        const dt = pa.period_to || pa.created_at;
        return dt && dt >= range.start && dt <= range.end;
      });
      const scheduledReceivables = periodPayApps.reduce(
        (s: number, pa: any) => s + (pa.current_payment_due || 0),
        0
      );
      // If no scheduled pay apps, use projected monthly billing
      const receivables = scheduledReceivables > 0 ? scheduledReceivables : monthlyBillingTarget;

      // Payables: bills/invoices due in this period + projected sub payments
      const periodBills = unpaidBills.filter((b: any) => {
        const due = b.due_date || b.created_at;
        return due && due >= range.start && due <= range.end;
      });
      const periodInvoices = unpaidInvoices.filter((inv: any) => {
        const due = inv.due_date || inv.created_at;
        return due && due >= range.start && due <= range.end;
      });
      const scheduledBillPayables = periodBills.reduce((s: number, b: any) => s + (b.amount || 0), 0);
      const scheduledInvoicePayables = periodInvoices.reduce((s: number, inv: any) => s + (inv.amount || 0), 0);
      const scheduledPayables = scheduledBillPayables + scheduledInvoicePayables;
      const payables = scheduledPayables > 0 ? scheduledPayables : monthlyPayableTarget;

      // Retainage release: assume last period releases all retainage
      const retainageRelease = i === periodCount - 1 ? totalRetainageHeld : 0;

      const net = receivables - payables + retainageRelease;
      runningBalance += net;

      // Line items for expandable detail
      const lineItems: any[] = [];
      if (periodPayApps.length > 0) {
        periodPayApps.forEach((pa: any) => {
          lineItems.push({
            type: 'receivable',
            label: `Pay App #${pa.app_number}`,
            amount: pa.current_payment_due || 0,
          });
        });
      } else {
        lineItems.push({
          type: 'receivable',
          label: 'Projected billing',
          amount: monthlyBillingTarget,
        });
      }

      periodBills.forEach((b: any) => {
        lineItems.push({
          type: 'payable',
          label: `Bill: ${b.vendor_name || 'Vendor'}`,
          amount: -(b.amount || 0),
        });
      });
      periodInvoices.forEach((inv: any) => {
        lineItems.push({
          type: 'payable',
          label: `Invoice: ${inv.vendor_name || 'Vendor'} #${inv.invoice_number || ''}`,
          amount: -(inv.amount || 0),
        });
      });
      if (scheduledPayables === 0 && monthlyPayableTarget > 0) {
        lineItems.push({
          type: 'payable',
          label: 'Projected sub payments',
          amount: -monthlyPayableTarget,
        });
      }
      if (retainageRelease > 0) {
        lineItems.push({
          type: 'retainage',
          label: 'Retainage release',
          amount: retainageRelease,
        });
      }

      periods.push({
        month: label,
        start: range.start,
        end: range.end,
        receivables: Math.round(receivables * 100) / 100,
        payables: Math.round(payables * 100) / 100,
        retainage_release: Math.round(retainageRelease * 100) / 100,
        net: Math.round(net * 100) / 100,
        running_balance: Math.round(runningBalance * 100) / 100,
        line_items: lineItems,
      });
    }

    const totalReceivables = periods.reduce((s, p) => s + p.receivables, 0);
    const totalPayables = periods.reduce((s, p) => s + p.payables, 0);
    const netCashFlow = totalReceivables - totalPayables + totalRetainageHeld;
    const dangerZone = periods.some((p) => p.running_balance < 0);

    return NextResponse.json({
      project: {
        id: p.id,
        name: p.name,
        contract_amount: contractAmount,
        adjusted_contract: adjustedContract,
        retainage_pct: retainagePct,
        total_billed: totalBilled,
        remaining_to_bill: remainingToBill,
        total_retainage_held: totalRetainageHeld,
      },
      periods,
      summary: {
        total_receivables: Math.round(totalReceivables * 100) / 100,
        total_payables: Math.round(totalPayables * 100) / 100,
        net_cash_flow: Math.round(netCashFlow * 100) / 100,
        retainage_due: Math.round(totalRetainageHeld * 100) / 100,
        danger_zone: dangerZone,
      },
    });
  } catch (e) {
    console.error('Cash flow projection error:', e);
    return NextResponse.json({ error: 'Failed to generate cash flow projection' }, { status: 500 });
  }
}
