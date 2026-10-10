import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { computePayApp, toCents, toDollars } from '@/lib/calc';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';
import { notOnRoster, subRecordScope } from '@/lib/sub-portal-scope';

async function authenticateSubPortal(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_sub_sessions')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .single();

  return session;
}

/** GET — List sub's pay applications with GC notes and status */
export async function GET(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    // An email-only invite has no roster sub, so no invoice can belong to it (lib/sub-portal-scope).
    // `.eq('sub_id', '')` used to stand in here — '' is not a uuid, so Postgres rejected it.
    const scope = subRecordScope(session);
    if (!scope) return NextResponse.json({ pay_apps: [] });

    const db = createServerClient();

    const { data: payApps, error } = await db
      .from('portal_sub_pay_apps')
      .select(
        `*,
         line_items:portal_sub_pay_app_line_items(*)`
      )
      .eq('sub_id', scope.subId)
      .eq('project_id', scope.projectId)
      .eq('tenant_id', scope.tenantId)
      .order('period_to', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ pay_apps: payApps || [] });
  } catch (err) {
    return apiError('portal/sub/pay-apps', err, "Couldn't load your invoices.");
  }
}

/** POST — Submit new pay application with line items tied to SOV */
export async function POST(req: NextRequest) {
  try {
    const session = await authenticateSubPortal(req);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired portal token' },
        { status: 401 }
      );
    }

    /* No roster sub → no invoice. This used to fall through: the compliance
       gate below only ran `if (session.sub_id)`, so an email-only link could
       file an invoice with no COI or W-9 check at all. */
    const scope = subRecordScope(session);
    if (!scope) {
      const r = notOnRoster(session, 'an invoice');
      return NextResponse.json(r.body, { status: r.status });
    }

    const db = createServerClient();

    // ── COMPLIANCE GATE — the reason GCs force subs onto portals: an invoice
    //    cannot be submitted while required compliance docs are missing or
    //    expired. Required: current insurance (COI) + W9 on file. ──
    {
      const { data: cdocs } = await db
        .from('portal_sub_compliance_docs')
        .select('doc_type, expiry_date, status')
        .eq('tenant_id', scope.tenantId)
        .eq('sub_id', scope.subId);
      const now = Date.now();
      const ok = (type: string) => (cdocs || []).some((d: { doc_type: string; expiry_date: string | null; status: string | null }) =>
        d.doc_type === type && d.status !== 'rejected' && d.status !== 'expired' &&
        (!d.expiry_date || new Date(d.expiry_date).getTime() > now));
      const missing = ['insurance', 'w9'].filter((t) => !ok(t));
      if (missing.length) {
        return NextResponse.json({
          error: 'Compliance hold — invoices are released once required documents are current.',
          complianceBlock: true,
          missing,
        }, { status: 409 });
      }
    }

    const body = await req.json();
    const {
      period_start,
      period_end,
      application_number,
      line_items,
      notes,
      total_requested,
      retainage_percent,
    } = body;

    if (!period_end || !line_items || !Array.isArray(line_items)) {
      return NextResponse.json(
        { error: 'period_end and line_items array are required' },
        { status: 400 }
      );
    }

    // ── Money math through the exact-cents engine (DB dollars → cents) ──
    // DB stores dollars; convert every input to integer cents, compute with the
    // engine, then convert outputs back to dollars for storage.
    const retPct = retainage_percent ?? 10;

    // Prior periods' "earned less retainage" — used so currentPaymentDue nets out
    // certificates already issued. Accepts either dollars on the body or 0.
    const previousPaymentsLessRetainage = toCents(
      body.previous_payments_less_retainage ?? 0
    );

    const engineLines = line_items.map((item: any, idx: number) => {
      const scheduledValue = toCents(item.scheduled_value ?? 0);
      const fromPrevious = toCents(item.previous_completed ?? 0);
      const thisPeriod = toCents(item.this_period ?? item.amount_requested ?? 0);
      const storedMaterials = toCents(item.stored_materials ?? 0);
      return {
        id: String(item.id ?? item.sov_item_id ?? idx),
        description: item.description ?? '',
        scheduledValue,
        fromPrevious,
        thisPeriod,
        storedMaterials,
      };
    });

    const calc = computePayApp({
      lines: engineLines,
      retainagePercent: retPct,
      previousPaymentsLessRetainage,
    });

    // Gross billed this period across all lines (this period + stored materials),
    // which is what the `amount` column represents.
    const grossThisPeriodCents = calc.lines.reduce(
      (sum, line, idx) =>
        sum + line.completedAndStored - engineLines[idx].fromPrevious,
      0
    );

    // `amount` (gross this-period request), `retainage` (on completed+stored),
    // `net_amount` (earned-less-retainage minus prior certificates) — all dollars.
    const amountDollars =
      total_requested != null ? total_requested : toDollars(grossThisPeriodCents);
    const retainageAmount = toDollars(calc.retainageTotal);
    const netAmount = toDollars(calc.currentPaymentDue);

    // Create the pay app.
    // Live portal_sub_pay_apps columns: period_from, period_to, amount, retainage,
    // net_amount, status, pdf_url, submitted_at. application_number, retainage_percent
    // and notes have no column (and no jsonb to fold into) so they are dropped.
    // period_start -> period_from, period_end -> period_to, total_requested -> amount,
    // retainage_amount -> retainage.
    const { data: payApp, error: payAppError } = await db
      .from('portal_sub_pay_apps')
      .insert({
        sub_id: scope.subId,
        project_id: scope.projectId,
        tenant_id: scope.tenantId,
        period_from: period_start || null,
        period_to: period_end,
        amount: amountDollars,
        retainage: retainageAmount,
        net_amount: netAmount,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (payAppError) throw payAppError;

    // Insert line items tied to SOV.
    // Live portal_sub_pay_app_line_items columns: pay_app_id, description,
    // scheduled_value, prev_completed, this_period, total_completed,
    // percent_complete, balance. There is no tenant_id / sov_item_id / amount_requested
    // / gc_* column. previous_completed -> prev_completed; total_completed and balance
    // are derived.
    // Line items: completed/balance/percent come from the engine (exact cents),
    // converted back to dollars for storage. total_completed here is the
    // engine's completed+stored (prior + this period + stored materials).
    const lineItemRows = line_items.map((item: any, idx: number) => {
      const src = engineLines[idx];
      const result = calc.lines[idx];
      return {
        pay_app_id: payApp.id,
        description: item.description,
        scheduled_value: toDollars(src.scheduledValue),
        prev_completed: toDollars(src.fromPrevious),
        this_period: toDollars(src.thisPeriod),
        total_completed: toDollars(result.completedAndStored),
        percent_complete: result.percentComplete,
        balance: toDollars(result.balanceToFinish),
      };
    });

    const { error: lineError } = await db
      .from('portal_sub_pay_app_line_items')
      .insert(lineItemRows);

    if (lineError) throw lineError;

    // History — every submission timestamped for the sub's activity feed.
    await must(db.from('portal_activity').insert({
      tenant_id: session.tenant_id,
      project_id: session.project_id,
      session_id: session.id,
      action: 'invoice_submitted',
      description: `Submitted pay application (${lineItemRows.length} lines)`,
      metadata: { pay_app_id: payApp.id, amount: (payApp as { amount?: number }).amount, period_end, lines: lineItemRows.length, by: session.sub_company },
    } as never), 'portal_activity insert');

    return NextResponse.json(
      { pay_app: payApp, message: 'Pay application submitted successfully' },
      { status: 201 }
    );
  } catch (err) {
    return apiError('portal/sub/pay-apps', err, "Couldn't submit the invoice. Please try again.");
  }
}
