import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requestDay } from '@/lib/time-zone';
import { contractMoney } from '@/lib/job-contract';
import { retainageRate } from '@/lib/retainage';
import { buildCommitments, isLiveCommitment } from '@/lib/commitments';
import { projectCashFlow } from '@/lib/cash-flow-projection';

/**
 * GET — the job's six-month cash flow. Every figure is money really still
 * owed in or out (see lib/cash-flow-projection.ts): sent-but-unpaid pay apps,
 * unpaid owner invoices, unpaid vendor bills, contract still to bill and
 * committed cost still to bill (both spread only to the job's end month), and
 * retainage held. A closed job carries only its open items.
 */

/** Pay apps that went to the owner and are waiting on payment. */
const SENT_UNPAID = new Set(['submitted', 'under_review', 'in_review', 'certified', 'approved']);
/** Bills / invoices that are not owed (paid, or never real). */
const NOT_OWED = new Set(['paid', 'void', 'voided', 'cancelled', 'canceled', 'rejected', 'draft']);
/** Days from a pay app going out to the owner's payment. */
const PAY_TERMS_DAYS = 30;

const N = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const low = (v: unknown) => String(v ?? '').toLowerCase().trim();
const day = (v: unknown) => (v ? String(v).slice(0, 10) : null);
const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10);
};
const owed = (r: any) => Math.max(0, (N(r.total) || N(r.amount)) - N(r.paid_amount));

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { projectId } = await params;
  const t = user.tenantId;

  try {
    const db = createServerClient();

    const { data: project, error: pErr } = await db
      .from('projects')
      .select('id, name, status, contract_amount, original_contract_amount, original_contract_value, original_contract, revised_contract_value, contract_value, retainage_pct, start_date, end_date')
      .eq('id', projectId)
      .eq('tenant_id', t)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const p = project as any;

    const [payAppsQ, invoicesQ, billsQ, contractsQ, posQ, legacyQ, cosQ, budgetQ, tasksQ] = await Promise.all([
      db.from('pay_applications')
        .select('id, app_number, status, period_to, submitted_at, created_at, current_payment_due, payment_amount, total_retainage, retainage_held, retainage_percent, total_completed_stored, deleted_at')
        .eq('project_id', projectId).eq('tenant_id', t),
      db.from('invoices')
        .select('id, invoice_number, vendor_name, amount, total, paid_amount, status, due_date, direction, created_at')
        .eq('project_id', projectId).eq('tenant_id', t),
      db.from('bills')
        .select('id, bill_number, vendor_name, amount, total, paid_amount, status, due_date, created_at')
        .eq('project_id', projectId).eq('tenant_id', t),
      db.from('contracts')
        .select('id, contract_number, contract_type, title, trade, scope_summary, party_name, party_company, vendor_name, counterparty_name, status, amount, contract_amount, original_amount, approved_changes, invoiced_amount, paid_amount, retainage_pct, executed_date, executed_at, bid_package_id')
        .eq('project_id', projectId).eq('tenant_id', t),
      db.from('purchase_orders')
        .select('id, po_number, purchase_order, vendor_name, description, cost_code, status, total, subtotal, tax, shipping, line_items, issued_date, notes')
        .eq('project_id', projectId).eq('tenant_id', t),
      db.from('commitments')
        .select('id, commitment_number, commitment_type, vendor_name, description, scope_of_work, status, original_amount, approved_changes, invoiced_to_date, retainage_held, contract_date, bid_package_id')
        .eq('project_id', projectId).eq('tenant_id', t),
      db.from('change_orders').select('id, status, amount, cost_impact').eq('project_id', projectId).eq('tenant_id', t),
      db.from('budget_lines').select('id, committed, actual').eq('project_id', projectId).eq('tenant_id', t),
      db.from('schedule_tasks').select('id, end_date, status, pct_complete').eq('project_id', projectId).eq('tenant_id', t),
    ]);
    for (const q of [payAppsQ, invoicesQ, billsQ, contractsQ, cosQ]) if (q.error) throw q.error;

    const payApps = ((payAppsQ.data || []) as any[]).filter((a) => !a.deleted_at && !['void', 'voided', 'rejected'].includes(low(a.status)));
    const invoices = (invoicesQ.data || []) as any[];
    const bills = (billsQ.data || []) as any[];
    const contracts = (contractsQ.data || []) as any[];
    // Optional sources: a missing table or column leaves them empty, never the page.
    const pos = (posQ.error ? [] : posQ.data || []) as any[];
    const legacy = (legacyQ.error ? [] : legacyQ.data || []) as any[];
    const budget = (budgetQ.error ? [] : budgetQ.data || []) as any[];
    const tasks = (tasksQ.error ? [] : tasksQ.data || []) as any[];

    // Contract: the same rule as /api/project-context and the owner portal.
    const prime = contracts.find((c) => low(c.contract_type) === 'prime') ?? null;
    const contract = contractMoney({ project: p, prime, changeOrders: (cosQ.data || []) as any[] });

    // Billed and retainage held: the latest application (both are cumulative).
    const latest = payApps.reduce<any | null>((best, a) => {
      if (!best) return a;
      const an = N(a.app_number), bn = N(best.app_number);
      if (an !== bn) return an > bn ? a : best;
      return N(a.total_completed_stored) > N(best.total_completed_stored) ? a : best;
    }, null);
    const billedToDate = N(latest?.total_completed_stored);
    const retainageHeld = N(latest?.total_retainage ?? latest?.retainage_held);
    const retainagePct = retainageRate(latest?.retainage_percent, retainageRate(p.retainage_pct));

    const unpaidPayApps = payApps
      .filter((a) => SENT_UNPAID.has(low(a.status)))
      .map((a) => {
        const sent = day(a.submitted_at) || day(a.period_to) || day(a.created_at);
        return {
          label: `Pay App #${a.app_number}`,
          amount: Math.max(0, N(a.current_payment_due) - N(a.payment_amount)),
          expectedDate: sent ? addDays(sent, PAY_TERMS_DAYS) : null,
        };
      });

    const open = (r: any) => !NOT_OWED.has(low(r.status));
    const payableInvoices = invoices.filter((i) => low(i.direction) === 'payable');
    const receivableInvoices = invoices.filter((i) => low(i.direction) !== 'payable');
    const unpaidReceivables = receivableInvoices.filter(open).map((i) => ({
      label: `Invoice #${i.invoice_number || ''}`.trim(), amount: owed(i), dueDate: day(i.due_date) || day(i.created_at),
    }));
    const unpaidPayables = [
      ...bills.filter(open).map((b) => ({ label: `Bill: ${b.vendor_name || 'Vendor'}${b.bill_number ? ' #' + b.bill_number : ''}`, amount: owed(b), dueDate: day(b.due_date) || day(b.created_at) })),
      ...payableInvoices.filter(open).map((i) => ({ label: `Bill: ${i.vendor_name || 'Vendor'}${i.invoice_number ? ' #' + i.invoice_number : ''}`, amount: owed(i), dueDate: day(i.due_date) || day(i.created_at) })),
    ];

    // Committed but not yet billed: commitments' remaining, or the budget's
    // committed − actual where that is larger (both measure the same thing).
    const commitments = buildCommitments({ projectId, contracts, purchaseOrders: pos, legacy, bills: [...bills, ...payableInvoices] });
    const commitmentRemaining = commitments.filter(isLiveCommitment).reduce((s, c) => s + Math.max(0, c.remaining), 0);
    const budgetToBill = budget.reduce((s, b) => s + Math.max(0, N(b.committed) - N(b.actual)), 0);
    const committedUnbilled = Math.max(commitmentRemaining, budgetToBill);

    const openTaskEndDates = tasks
      .filter((tk) => !['complete', 'completed', 'done'].includes(low(tk.status)) && N(tk.pct_complete) < 100)
      .map((tk) => day(tk.end_date));

    const { today } = await requestDay(req.headers, db, t, 'cash-flow');

    const projection = projectCashFlow({
      today, status: p.status, endDate: day(p.end_date), openTaskEndDates,
      revisedContract: contract.current, billedToDate, retainageHeld, retainagePct,
      unpaidPayApps, unpaidReceivables, unpaidPayables, committedUnbilled,
    });

    return NextResponse.json({
      project: {
        id: p.id,
        name: p.name,
        status: p.status,
        closed: projection.closed,
        end_month: projection.endMonth,
        contract_amount: contract.original,
        adjusted_contract: contract.current,
        retainage_pct: retainagePct,
        total_billed: billedToDate,
        remaining_to_bill: projection.remainingToBill,
        total_retainage_held: retainageHeld,
        committed_unbilled: Math.round(committedUnbilled * 100) / 100,
      },
      periods: projection.periods,
      summary: projection.summary,
    });
  } catch (e) {
    return apiError('cash-flow', e, "Couldn't build the cash flow for this job.");
  }
}
