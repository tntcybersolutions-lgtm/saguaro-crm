import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { toCents, toDollars, percentOf, subCents, computePayApp } from '@/lib/calc';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';
import { retainageLedger, retainageRate } from '@/lib/retainage';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const [{ data: payApp, error: paErr }, { data: lineItems, error: liErr }] = await Promise.all([
      db.from('pay_applications').select('*, projects(*)').eq('id', id).eq('tenant_id', user.tenantId).maybeSingle(),
      db.from('schedule_of_values').select('*').eq('tenant_id', user.tenantId).eq('pay_app_id', id).order('line_number'),
    ]);
    if (paErr) throw paErr;
    if (liErr) throw liErr;
    if (!payApp) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    /* The retainage ledger needs every application on the job: "Released to
       Date" is the sum of every drop in the held balance up to this app, and
       G702 line 7 is the previous app's line 6 (lib/retainage). */
    const { data: siblings, error: sibErr } = await db
      .from('pay_applications')
      .select('id, app_number, total_retainage, retainage_amount, total_earned_less_retainage, less_previous_certificates, deleted_at')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', (payApp as any).project_id);
    if (sibErr) throw sibErr;
    const retainage = retainageLedger(siblings as any[], id);
    return NextResponse.json({ payApp, lineItems: lineItems || [], retainage });
  } catch (e) {
    return apiError('pay-apps/[id] GET', e, "Couldn't load this pay application. Please try again.");
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Pay Apps', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const db = createServerClient();

    // Update pay app header fields.
    // Map incoming body keys onto real pay_applications columns. Several legacy
    // body keys diverge from the live schema (e.g. materials_stored ->
    // stored_materials), so we translate rather than write them verbatim.
    const headerFields: Record<string, any> = {};
    const columnMap: Record<string, string> = {
      period_from: 'period_from',
      period_to: 'period_to',
      contract_sum: 'contract_sum',
      change_orders_total: 'change_orders_total',
      contract_sum_to_date: 'contract_sum_to_date',
      prev_completed: 'prev_completed',
      this_period: 'this_period',
      materials_stored: 'stored_materials',
      total_completed: 'total_completed_stored',
      percent_complete: 'percent_complete',
      retainage_percent: 'retainage_percent',
      retainage_amount: 'total_retainage',
      total_earned_less_retainage: 'total_earned_less_retainage',
      prev_payments: 'less_previous_certificates',
      current_payment_due: 'current_payment_due',
      net_amount_due: 'net_payment_due',
      notes: 'notes',
      owner_name: 'owner_name',
      owner_address: 'owner_address',
      architect_name: 'architect_name',
    };
    for (const k of Object.keys(columnMap)) {
      if (body[k] !== undefined) headerFields[columnMap[k]] = body[k];
    }

    // The mobile edit form sends `work_completed`/`workCompleted` (the dollar
    // amount completed this period), which the columnMap above does not cover —
    // without this, editing the amount silently no-ops. Map it to `this_period`
    // and recompute the derived money fields the same way create does, so the
    // detail sheet's retainage / payment-due stay consistent after an edit.
    /* The detail sheet sends its full schedule of values. The header is then
       derived from those lines — the same engine create uses — never from the
       client's totals. (It used to fall into the lump-sum branch below on
       `thisPeriod`, which stored THIS PERIOD as completed-to-date and dropped
       every prior period from line 4 on each save.) */
    const sovEdit = Array.isArray(body.lineItems) && body.lineItems.length > 0;
    const workEdited = sovEdit ? undefined : (body.work_completed ?? body.workCompleted ?? body.thisPeriod);
    /* The row being edited: its job (schedule_of_values.project_id is NOT NULL
       and the detail sheet never sends it — every save used to delete the SOV
       and then fail the re-insert on a null project_id) and its money inputs. */
    let ex: any = null;
    if (sovEdit || Array.isArray(body.lineItems)) {
      const { data: existing, error: exErr } = await db
        .from('pay_applications')
        .select('id, project_id, app_number, retainage_percent, less_previous_certificates, contract_sum, change_orders_total')
        .eq('id', id)
        .eq('tenant_id', user.tenantId)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      ex = existing as any;
    }
    if (sovEdit) {
      const rate = retainageRate(body.retainage_percent ?? body.retainagePercent ?? ex.retainage_percent);
      /* G702 line 7 = line 6 of the application before this one, read from the
         job's ledger — the same figure the detail screen and the PDF print.
         An explicit value from a caller still wins. */
      const sentPrev = body.prev_payments ?? body.prevPayments;
      let prevCertsDollars: number;
      if (sentPrev !== undefined && sentPrev !== null && String(sentPrev).trim() !== '') {
        prevCertsDollars = Number(sentPrev) || 0;
      } else {
        const { data: siblings, error: sibErr } = await db
          .from('pay_applications')
          .select('id, app_number, total_retainage, retainage_amount, total_earned_less_retainage, less_previous_certificates, deleted_at')
          .eq('tenant_id', user.tenantId)
          .eq('project_id', ex.project_id);
        if (sibErr) throw sibErr;
        prevCertsDollars = retainageLedger(siblings as any[], id).previousCertificates;
      }
      const prevCerts = toCents(prevCertsDollars);
      const r = computePayApp({
        lines: (body.lineItems as any[]).map((item: any, i: number) => ({
          id: String(i + 1),
          description: String(item.description || ''),
          scheduledValue: toCents(Number(item.scheduled_value ?? item.scheduledValue) || 0),
          fromPrevious: toCents(Number(item.work_from_prev ?? item.workFromPrev ?? item.prev_completed) || 0),
          thisPeriod: toCents(Number(item.work_this_period ?? item.workThisPeriod ?? item.this_period) || 0),
          storedMaterials: toCents(Number(item.materials_stored ?? item.materialsStored ?? item.stored_materials) || 0),
        })),
        retainagePercent: rate,
        previousPaymentsLessRetainage: prevCerts,
      });
      const sum = (k: 'fromPrevious' | 'thisPeriod' | 'storedMaterials') => (body.lineItems as any[]).reduce((s2: number, item: any) => {
        const v = k === 'fromPrevious' ? (item.work_from_prev ?? item.workFromPrev ?? item.prev_completed)
          : k === 'thisPeriod' ? (item.work_this_period ?? item.workThisPeriod ?? item.this_period)
          : (item.materials_stored ?? item.materialsStored ?? item.stored_materials);
        return s2 + toCents(Number(v) || 0);
      }, 0);
      const contractToDate = toCents((Number(ex.contract_sum) || 0) + (Number(ex.change_orders_total) || 0));
      Object.assign(headerFields, {
        retainage_percent: rate,
        prev_completed: toDollars(sum('fromPrevious')),
        this_period: toDollars(sum('thisPeriod')),
        stored_materials: toDollars(sum('storedMaterials')),
        total_completed_stored: toDollars(r.completedAndStoredTotal),
        percent_complete: contractToDate > 0 ? Math.round((r.completedAndStoredTotal / contractToDate) * 10000) / 100 : r.percentComplete,
        total_retainage: toDollars(r.retainageTotal),
        total_earned_less_retainage: toDollars(r.totalEarnedLessRetainage),
        less_previous_certificates: toDollars(prevCerts),
        current_payment_due: toDollars(Math.max(0, r.currentPaymentDue)),
        net_payment_due: toDollars(Math.max(0, r.currentPaymentDue)),
        balance_to_finish_including_retainage: toDollars(contractToDate - r.totalEarnedLessRetainage),
      });
    }
    if (workEdited !== undefined) {
      // Recompute derived money fields with the exact-cents calc engine.
      // Need retainage % and previous certificates; use provided values or read the row.
      let retainagePercent = Number(body.retainage_percent ?? body.retainagePercent);
      let prevPaymentsDollars = Number(body.prev_payments ?? body.prevPayments);
      if (!Number.isFinite(retainagePercent) || !Number.isFinite(prevPaymentsDollars)) {
        const { data: existing } = await db
          .from('pay_applications')
          .select('retainage_percent, less_previous_certificates')
          .eq('id', id)
          .eq('tenant_id', user.tenantId)
          .maybeSingle();
        if (!Number.isFinite(retainagePercent)) retainagePercent = retainageRate((existing as any)?.retainage_percent);
        if (!Number.isFinite(prevPaymentsDollars)) prevPaymentsDollars = Number((existing as any)?.less_previous_certificates ?? 0) || 0;
      }
      const workCents = toCents(Number(workEdited) || 0);
      const retainageCents = percentOf(workCents, retainagePercent);
      const earnedCents = subCents(workCents, retainageCents);
      // current payment due = earned-less-retainage − previous certificates.
      // (Bug fix: prior payments were previously omitted, over-billing any project
      // with earlier certificates.)
      const currentDueCents = subCents(earnedCents, toCents(prevPaymentsDollars));
      headerFields.this_period = toDollars(workCents);
      headerFields.total_completed_stored = toDollars(workCents);
      headerFields.total_completed = toDollars(workCents);
      headerFields.total_retainage = toDollars(retainageCents);
      headerFields.retainage_amount = toDollars(retainageCents);
      headerFields.total_earned_less_retainage = toDollars(earnedCents);
      headerFields.current_payment_due = toDollars(currentDueCents);
      headerFields.net_payment_due = toDollars(currentDueCents);
    }

    if (Object.keys(headerFields).length > 0) {
      const { error } = await db
        .from('pay_applications')
        .update(headerFields)
        .eq('id', id)
        .eq('tenant_id', user.tenantId);
      if (error) throw error;
    }

    // Replace SOV line items if provided. Tenant-scope the delete — service-role
    // bypasses RLS and this path is reachable without a prior ownership check when
    // only lineItems are sent, so an id-only delete would wipe another tenant's SOV rows.
    /* New lines go in first; only once they are stored are the old ones
       removed. Delete-then-insert lost the whole SOV whenever the insert
       failed. */
    if (Array.isArray(body.lineItems)) {
      let keepIds: string[] = [];
      if (body.lineItems.length > 0) {
        const { data: inserted, error: liErr } = await db.from('schedule_of_values').insert(
          body.lineItems.map((item: any, i: number) => ({
            tenant_id: user.tenantId,
            project_id: ex?.project_id,
            pay_app_id: id,
            line_number: i + 1,
            description: item.description,
            scheduled_value: item.scheduled_value ?? item.scheduledValue ?? 0,
            prev_completed: item.work_from_prev ?? item.workFromPrev ?? 0,
            this_period: item.work_this_period ?? item.workThisPeriod ?? 0,
            stored_materials: item.materials_stored ?? item.materialsStored ?? 0,
            total_completed: item.total_completed ?? item.totalCompleted ?? 0,
            percent_complete: item.percent_complete ?? item.percentComplete ?? 0,
            balance_to_finish: item.balance_to_finish ?? item.balanceToFinish ?? 0,
            retainage: item.retainage ?? 0,
            cost_code: item.csi_code ?? item.csiCode,
          }))
        ).select('id');
        if (liErr) throw liErr;
        keepIds = ((inserted as Array<{ id: string }> | null) || []).map((r) => r.id);
      }
      let del = db.from('schedule_of_values').delete().eq('pay_app_id', id).eq('tenant_id', user.tenantId);
      if (keepIds.length > 0) del = del.not('id', 'in', `(${keepIds.join(',')})`);
      await must(del, 'schedule_of_values delete');
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('pay-apps/[id] PUT', e, "Couldn't save the pay application. Please try again.");
  }
}

// Partial update of pay app header fields. Whitelists real pay_applications
// columns (legacy keys are mapped to their live column names) and writes only
// the provided fields. Tenant-scoped.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Pay Apps', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const db = createServerClient();

    const columnMap: Record<string, string> = {
      period_from: 'period_from',
      period_to: 'period_to',
      contract_sum: 'contract_sum',
      change_orders_total: 'change_orders_total',
      contract_sum_to_date: 'contract_sum_to_date',
      prev_completed: 'prev_completed',
      this_period: 'this_period',
      materials_stored: 'stored_materials',
      stored_materials: 'stored_materials',
      total_completed: 'total_completed_stored',
      percent_complete: 'percent_complete',
      retainage_percent: 'retainage_percent',
      retainage_amount: 'total_retainage',
      total_earned_less_retainage: 'total_earned_less_retainage',
      prev_payments: 'less_previous_certificates',
      current_payment_due: 'current_payment_due',
      net_amount_due: 'net_payment_due',
      net_payment_due: 'net_payment_due',
      sort_order: 'sort_order',
      status: 'status',
      notes: 'notes',
      internal_notes: 'internal_notes',
      owner_name: 'owner_name',
      owner_address: 'owner_address',
      architect_name: 'architect_name',
    };

    const updates: Record<string, unknown> = {};
    for (const k of Object.keys(columnMap)) {
      if (body[k] !== undefined) updates[columnMap[k]] = body[k];
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true });
    }

    const { data, error } = await db
      .from('pay_applications')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ payApp: data });
  } catch (e) {
    return apiError('pay-apps/[id] PATCH', e, "Couldn't save the pay application. Please try again.");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Pay Apps', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { error } = await db
      .from('pay_applications')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('pay-apps/[id] DELETE', e, "Couldn't delete the pay application. Please try again.");
  }
}
