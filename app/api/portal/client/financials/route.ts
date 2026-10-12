import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getPortalSession, PORTAL_PERMS } from '@/lib/portal-auth';
import { toCents, toDollars, addCents, subCents } from '@/lib/calc';
import { companyPaymentAccount, invoiceBalanceCents, invoiceIsPayable, onlinePaymentsConfigured } from '@/lib/online-payments';

/** GET — financial summary for the client portal financials tab */
export async function GET(req: NextRequest) {
  try {
    const session = await getPortalSession(req, PORTAL_PERMS.VIEW_FINANCIALS);
    if (!session) {
      return NextResponse.json({ error: 'Access denied — insufficient permissions' }, { status: 403 });
    }

    const db = createServerClient();
    const projectId = session.project_id;
    const tenantId = session.tenant_id;

    // Invoices
    const { data: invoiceRows } = await db
      .from('invoices')
      .select('id, invoice_number, amount, total, paid_amount, due_date, status, created_at')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      // Only what the owner owes. Vendor / sub bills (direction 'payable') are
      // the GC's costs — the owner never sees them.
      .eq('direction', 'receivable')
      .order('created_at', { ascending: false });

    // Pay online only when the contractor's Stripe account can take payments.
    const payOnline = onlinePaymentsConfigured() && (await companyPaymentAccount(db, tenantId)).ready;
    const invoices = (invoiceRows || []).map((inv: any) => ({
      id: inv.id,
      number: inv.invoice_number || '',
      amount: inv.total ?? inv.amount ?? 0,
      balance: invoiceBalanceCents(inv) / 100,
      payable: payOnline && invoiceIsPayable({ ...inv, direction: 'receivable' }),
      date: inv.created_at,
      due_date: inv.due_date,
      status: inv.status || 'pending',
    }));

    // Budget line items
    const { data: budgetRows } = await db
      .from('budget_lines')
      .select(
        'id, cost_code, description, original_budget, approved_changes, revised_budget, committed, actual, variance, sort_order'
      )
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true });

    const budget_lines = (budgetRows || []).map((line: any) => {
      // DB dollars → cents for any fallback arithmetic, back to dollars to output.
      const originalC = toCents(line.original_budget ?? 0);
      const changesC = toCents(line.approved_changes ?? 0);
      // revised budget = original + approved changes (when not stored explicitly)
      const currentC =
        line.revised_budget != null
          ? toCents(line.revised_budget)
          : addCents(originalC, changesC);
      const spentC = toCents(line.actual ?? 0);
      // remaining/variance = revised budget − actual spent (when not stored)
      const remainingC =
        line.variance != null ? toCents(line.variance) : subCents(currentC, spentC);
      return {
        id: line.id,
        code: line.cost_code || '',
        description: line.description || '',
        original: toDollars(originalC),
        changes: toDollars(changesC),
        current: toDollars(currentC),
        committed: line.committed ?? 0,
        spent: toDollars(spentC),
        remaining: toDollars(remainingC),
      };
    });

    // Payment history (same source the payments route reads/writes)
    const { data: paymentRows } = await db
      .from('portal_payments')
      .select('id, amount, payment_type, status, paid_at, created_at')
      .eq('project_id', projectId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    const payments = (paymentRows || []).map((p: any) => ({
      id: p.id,
      amount: p.amount ?? 0,
      date: p.paid_at || p.created_at,
      method: p.payment_type || 'Portal',
      reference: p.id,
    }));

    return NextResponse.json({ invoices, budget_lines, payments, payOnline });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
