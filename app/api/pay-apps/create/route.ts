import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { onPayAppCreated } from '@/lib/triggers';
import { recordLearning } from '@/lib/learning';
import { toCents, toDollars, percentOf, subCents, computePayApp } from '@/lib/calc';
import { must } from '@/lib/db-write';
import { logActivity, money } from '@/lib/activity';

/** GET ?projectId= — seed data for a NEW pay app: next number, the prior app's
 *  schedule of values (rolled forward), and the approved-CO total. The new-app
 *  form starts pre-filled instead of blank. */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Pay Apps', 'View');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = g.db;
    const projectId = req.nextUrl.searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    const { data: lastApp } = await db
      .from('pay_applications')
      .select('id, app_number, total_completed_stored, total_earned_less_retainage, retainage_percent')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('app_number', { ascending: false })
      .limit(1)
      .single();
    const prior = lastApp as any;

    let priorSov: any[] = [];
    if (prior?.id) {
      const { data } = await db
        .from('schedule_of_values')
        .select('description, scheduled_value, total_completed, cost_code, line_number')
        .eq('pay_app_id', prior.id)
        .eq('tenant_id', user.tenantId)
        .order('line_number', { ascending: true });
      priorSov = (data as any[]) || [];
    }

    const { data: approvedCos } = await db
      .from('change_orders')
      .select('cost_impact')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .eq('status', 'approved');
    const changeOrdersTotal = (approvedCos || []).reduce((s: number, c: any) => s + (Number(c.cost_impact) || 0), 0);

    return NextResponse.json({
      nextAppNumber: (prior?.app_number || 0) + 1,
      retainagePercent: prior?.retainage_percent ?? 10,
      changeOrdersTotal,
      priorSov: priorSov.map((r) => ({
        description: r.description,
        scheduledValue: Number(r.scheduled_value) || 0,
        workFromPrev: Number(r.total_completed) || 0,
        workThisPeriod: 0,
        materialsStored: 0,
        csiCode: r.cost_code,
      })),
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Pay Apps', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const db = g.db;

    const projectId = body.projectId ?? body.project_id;
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    /* projectId is caller-supplied and db is the service role, so without the
       tenant filter this read any project by id — and its contract amount and
       retainage then seeded the pay application. Every other query in this
       route was already tenant-scoped; this one was not. */
    const { data: project } = await db.from('projects').select('*')
      .eq('id', projectId).eq('tenant_id', user.tenantId).maybeSingle();
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const p = project as any;

    // Get next application number
    const { data: lastApp } = await db
      .from('pay_applications')
      .select('id, app_number, total_completed_stored, total_earned_less_retainage')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('app_number', { ascending: false })
      .limit(1)
      .single();
    const prior = lastApp as any;
    const appNumber = (prior?.app_number || 0) + 1;

    // ── G702 line 2 derives from APPROVED change orders — never hand-typed.
    //    (The typed value wins only when the client explicitly sends one.) ──
    const { data: approvedCos } = await db
      .from('change_orders')
      .select('cost_impact')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .eq('status', 'approved');
    const derivedCoTotal = (approvedCos || []).reduce((s: number, c: any) => s + (Number(c.cost_impact) || 0), 0);
    const changeOrdersTotal = body.changeOrdersTotal != null ? Number(body.changeOrdersTotal) || 0 : derivedCoTotal;

    // Accept both camelCase and snake_case for the keys the mobile form sends.
    const periodTo = body.periodTo ?? body.period_to ?? null;
    const periodFrom = body.periodFrom ?? body.period_from ?? null;
    const retainagePercent = Number(body.retainagePercent ?? body.retainage_percent ?? 10) || 0;
    // AIA roll-forward: G702 line 7 (LESS PREVIOUS CERTIFICATES) of app N = line 6 (TOTAL EARNED
    // LESS RETAINAGE) of app N-1, and prior completed-to-date carries forward. The mobile lump-sum
    // form sends NEITHER, so without deriving these from the prior pay app the deduction is always
    // 0 → every owner pay app after #1 over-bills. Client values still win when supplied.
    const prevCompletedDollars = Number(body.prevCompleted ?? body.prev_completed ?? prior?.total_completed_stored ?? 0) || 0;
    const prevPaymentsDollars = Number(body.prevPayments ?? body.prev_payments ?? prior?.total_earned_less_retainage ?? 0) || 0;

    // ── Derive every money field with the exact-cents calc engine. The server is
    // the source of truth — client-sent totals are never trusted. When a schedule
    // of values is provided, the full G702/G703 cross-footed calculator runs.
    let rawLines: any[] = Array.isArray(body.lineItems) ? body.lineItems : [];
    // ── SOV ROLLFORWARD: when no lines are sent and a prior pay app has a
    //    schedule of values, CLONE it — scheduled values carry over, prior
    //    completed rolls into "from previous", this period starts at 0. The GC
    //    stops retyping a 20-100 line SOV every billing cycle. ──
    let rolledForward = false;
    // The clone must NEVER shadow the mobile lump-sum path: if the request
    // carries period money (workCompleted/thisPeriod), that path owns the math.
    const lumpMoney = Number(body.workCompleted ?? body.work_completed ?? body.thisPeriod ?? 0) > 0;
    if (rawLines.length === 0 && !lumpMoney && prior?.id) {
      const { data: priorSov } = await db
        .from('schedule_of_values')
        .select('description, scheduled_value, total_completed, cost_code, line_number')
        .eq('pay_app_id', prior.id)
        .eq('tenant_id', user.tenantId)
        .order('line_number', { ascending: true });
      if (priorSov && priorSov.length > 0) {
        rolledForward = true;
        recordLearning(db, { tenantId: user.tenantId, kind: 'sov_rollforward', projectId, userId: user.id, meta: { lines: priorSov.length } });
        rawLines = (priorSov as any[]).map((r) => ({
          description: r.description,
          scheduled_value: r.scheduled_value,
          prev_completed: r.total_completed,
          this_period: 0,
          stored_materials: 0,
          csi_code: r.cost_code,
        }));
      }
    }
    // ── G702 line 1 must be the ORIGINAL contract sum. projects.contract_amount
    //    is CO-INCLUSIVE (the CO cascade bumps it), so pairing it with a derived
    //    change_orders_total would double-count every approved CO. ──
    const originalContractSum = p?.original_contract_amount != null
      ? Number(p.original_contract_amount) || 0
      : Math.max(0, (Number(body.contractSum) || Number(p?.contract_amount) || 0) - changeOrdersTotal);
    // G702 line 3 (CONTRACT SUM TO DATE) = line 1 + line 2 (approved COs) —
    // never the SOV scheduled total, which tracks billing lines, not the contract.
    const contractPlusCos = originalContractSum + changeOrdersTotal;

    let sovRows: any[] = [];
    let m: {
      contractSumToDate: number; thisPeriod: number; totalCompletedStored: number;
      percentComplete: number; totalRetainage: number; totalEarnedLessRetainage: number; currentPaymentDue: number;
    };

    if (rawLines.length > 0) {
      const lines = rawLines.map((it, i) => ({
        id: String(i + 1),
        description: String(it.description || ''),
        scheduledValue:  toCents(Number(it.scheduledValue ?? it.scheduled_value ?? 0) || 0),
        fromPrevious:    toCents(Number(it.workFromPrev ?? it.prev_completed ?? 0) || 0),
        thisPeriod:      toCents(Number(it.workThisPeriod ?? it.this_period ?? 0) || 0),
        storedMaterials: toCents(Number(it.materialsStored ?? it.stored_materials ?? 0) || 0),
      }));
      const r = computePayApp({ lines, retainagePercent, previousPaymentsLessRetainage: toCents(prevPaymentsDollars) });
      m = {
        // Contract + approved COs; the SOV scheduled total is only an honest
        // fallback when the project carries no contract amount at all.
        contractSumToDate: contractPlusCos > 0 ? contractPlusCos : toDollars(r.scheduledTotal),
        thisPeriod: toDollars(r.completedAndStoredTotal),
        totalCompletedStored: toDollars(r.completedAndStoredTotal),
        percentComplete: r.percentComplete,
        totalRetainage: toDollars(r.retainageTotal),
        totalEarnedLessRetainage: toDollars(r.totalEarnedLessRetainage),
        currentPaymentDue: toDollars(r.currentPaymentDue),
      };
      sovRows = r.lines.map((pl, i) => ({
        line_number: i + 1,
        description: lines[i].description,
        scheduled_value: toDollars(lines[i].scheduledValue),
        prev_completed: toDollars(lines[i].fromPrevious),
        this_period: toDollars(lines[i].thisPeriod),
        stored_materials: toDollars(lines[i].storedMaterials),
        total_completed: toDollars(pl.completedAndStored),
        percent_complete: pl.percentComplete,
        balance_to_finish: toDollars(pl.balanceToFinish),
        retainage: toDollars(pl.retainage),
        cost_code: rawLines[i].csiCode ?? rawLines[i].csi_code,
      }));
    } else {
      // Lump-sum path (mobile): "work this period" + cumulative roll-forward from the prior app.
      const thisPeriodCents = toCents(Number(body.workCompleted ?? body.work_completed ?? body.thisPeriod ?? 0) || 0);
      const totalCompletedCents = toCents(prevCompletedDollars) + thisPeriodCents; // completed & stored TO DATE
      const retCents = percentOf(totalCompletedCents, retainagePercent);
      const earnedCents = subCents(totalCompletedCents, retCents);
      const dueCents = subCents(earnedCents, toCents(prevPaymentsDollars)); // less previous certificates
      m = {
        // Client value wins when sent; otherwise contract + approved COs (see above).
        contractSumToDate: Number(body.contractSumToDate) || contractPlusCos || Number(p?.contract_amount) || 0,
        thisPeriod: toDollars(thisPeriodCents),
        totalCompletedStored: toDollars(totalCompletedCents),
        percentComplete: Number(body.percentComplete) || 0,
        totalRetainage: toDollars(retCents),
        totalEarnedLessRetainage: toDollars(earnedCents),
        currentPaymentDue: toDollars(dueCents),
      };
    }

    const { data: payApp, error } = await db.from('pay_applications').insert({
      tenant_id: user.tenantId,
      project_id: projectId,
      app_number: appNumber,
      period_from: periodFrom,
      period_to: periodTo,
      status: body.status || 'draft',
      // G702 line 1 — ORIGINAL contract sum (derived once above, so line 3 =
      // line 1 + line 2 cross-foots with the stored contract_sum_to_date).
      contract_sum: originalContractSum,
      change_orders_total: changeOrdersTotal,
      contract_sum_to_date: m.contractSumToDate,
      prev_completed: prevCompletedDollars,
      this_period: m.thisPeriod,
      stored_materials: body.materialsStored || 0,
      total_completed_stored: m.totalCompletedStored,
      total_completed: m.totalCompletedStored,
      percent_complete: m.percentComplete,
      retainage_percent: retainagePercent,
      total_retainage: m.totalRetainage,
      retainage_amount: m.totalRetainage,
      total_earned_less_retainage: m.totalEarnedLessRetainage,
      less_previous_certificates: prevPaymentsDollars,
      current_payment_due: m.currentPaymentDue,
      net_payment_due: m.currentPaymentDue,
      owner_name: p?.owner_entity?.name || body.ownerName,
      owner_address: p?.owner_entity?.address || body.ownerAddress,
      architect_name: p?.architect_entity?.name || body.architectName,
      notes: body.notes,
    } as unknown as Database['public']['Tables']['pay_applications']['Insert']).select().single();

    if (error) throw error;

    // Insert SOV line items (computed by the engine when provided)
    if (sovRows.length > 0) {
      await must(db.from('schedule_of_values').insert(
        sovRows.map((row) => ({ tenant_id: user.tenantId, project_id: projectId, pay_app_id: (payApp as any).id, ...row }))
      ), 'schedule_of_values insert');
    }

    // Non-blocking trigger
    onPayAppCreated((payApp as any).id).catch(console.error);

    /* The money event a GC watches hardest — a pay application going out is
       the job asking to be paid. */
    const pa = payApp as Record<string, any>;
    void logActivity({
      tenantId: user.tenantId,
      projectId,
      userId: user.id,
      userName: user.email,
      action: String(pa?.status || 'draft') === 'draft' ? 'payapp_drafted' : 'payapp_submitted',
      entityType: 'pay_application',
      entityId: pa?.id ?? null,
      description: `Pay application ${pa?.app_number ?? ''} ${String(pa?.status || 'draft') === 'draft' ? 'drafted' : 'submitted'} — ${money(Number(pa?.current_payment_due ?? pa?.total_earned ?? 0))}`.replace(/\s+/g, ' '),
      metadata: { appNumber: pa?.app_number ?? null, status: pa?.status ?? null, rolledForward, changeOrdersTotal },
    });

    return NextResponse.json({ payApp, success: true, rolledForward, changeOrdersTotal });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
