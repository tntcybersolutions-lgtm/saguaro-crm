import { NextRequest, NextResponse } from 'next/server';
import { generateG702, generateG703, saveDocument, resolveBranding } from '@/lib/pdf-engine';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import {
  toCents,
  toDollars,
  addCents,
  sumCents,
  computePayApp,
  type SovLine,
} from '@/lib/calc';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';
import { fmtDate } from '@/lib/format-date';
import { architectName, ownerName } from '@/lib/project-parties';
import { retainageLedger, retainageRate } from '@/lib/retainage';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  try {
    const user = g.user;
    const body = await req.json();
    const db = createServerClient();

    // Tenant-scope every read — service-role bypasses RLS, so an id-only fetch would
    // let one tenant generate G702/G703 PDFs from (and overwrite) another tenant's pay app.
    const [{ data: payApp }, { data: lineItems }] = await Promise.all([
      db.from('pay_applications').select('*, projects(*)').eq('id', body.payAppId).eq('tenant_id', user.tenantId).single(),
      db.from('schedule_of_values').select('*').eq('pay_app_id', body.payAppId).eq('tenant_id', user.tenantId).order('line_number'),
    ]);

    if (!payApp) return NextResponse.json({ error: 'Pay app not found' }, { status: 404 });
    const pa = payApp as any;
    const project = pa.projects;
    const rows = (lineItems || []) as any[];

    // Resolve tenant branding once (Saguaro default unless on the white-label tier).
    const tenantId = user?.tenantId || project?.tenant_id;
    const branding = await resolveBranding(tenantId);

    // ── Money math: everything in exact integer cents via @/lib/calc ──
    // DB stores dollars → convert to cents before any arithmetic, back to
    // dollars only when handing values to the PDF (which renders dollars).
    /* A 0 % release application prints 0 % — `|| 10` re-held the retainage
       it released. Line 7 is the previous application's line 6, read from the
       job's ledger (lib/retainage); it used to read prev_payments, a text
       column nothing fills, so every PDF printed $0 there and billed the
       whole contract-to-date again on line 8. */
    const retainagePercent = retainageRate(pa.retainage_percent);
    const { data: siblings, error: sibErr } = await db
      .from('pay_applications')
      .select('id, app_number, total_retainage, retainage_amount, total_earned_less_retainage, less_previous_certificates, deleted_at')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', pa.project_id);
    if (sibErr) throw sibErr;
    const ledger = retainageLedger(siblings as any[], String(pa.id));
    const previousPaymentsLessRetainage = toCents(ledger.previousCertificates);

    /* schedule_of_values stores prev_completed / this_period / stored_materials.
       These read work_from_prev / work_this_period / materials_stored, which are
       on no table — so every figure came back undefined, was coalesced to 0, and
       the G702 would have been issued showing no work completed in any period.
       The older names are kept as a fallback in case a caller sends them. */
    const sovLines: SovLine[] = rows.map((i, idx) => ({
      id: String(i.id ?? i.line_number ?? idx + 1),
      description: i.description || '',
      scheduledValue: toCents(i.scheduled_value || 0),
      fromPrevious: toCents(i.prev_completed ?? i.work_from_prev ?? 0),
      thisPeriod: toCents(i.this_period ?? i.work_this_period ?? 0),
      storedMaterials: toCents(i.stored_materials ?? i.materials_stored ?? 0),
    }));

    /* With a schedule of values, the SOV is the truth: compute it so the
       document cross-foots. WITHOUT one (a lump-sum application) there is
       nothing to compute from — the engine returns $0 for every line, and
       that $0 used to be printed on the G702 AND written back over the pay
       app's real money. A lump-sum app prints its own stored figures. */
    const hasSov = sovLines.length > 0;
    const sovCalc = computePayApp({
      lines: sovLines,
      retainagePercent,
      previousPaymentsLessRetainage,
    });
    const storedCompleted = toCents(Number(pa.total_completed_stored ?? pa.total_completed) || 0);
    const storedRetainage = toCents(Number(pa.total_retainage ?? pa.retainage_amount) || 0);
    const storedEarned = toCents(Number(pa.total_earned_less_retainage) || 0);
    const storedPrevCerts = pa.less_previous_certificates != null && String(pa.less_previous_certificates).trim() !== ''
      ? toCents(Number(pa.less_previous_certificates) || 0)
      : previousPaymentsLessRetainage;
    const calc = hasSov ? sovCalc : {
      ...sovCalc,
      completedAndStoredTotal: storedCompleted,
      retainageTotal: storedRetainage,
      totalEarnedLessRetainage: storedEarned,
      currentPaymentDue: toCents(Number(pa.current_payment_due) || 0),
      percentComplete: Number(pa.percent_complete) || 0,
    };
    // Line 7 printed on a lump-sum app is the one it was computed with.
    const printedPrevCerts = hasSov ? previousPaymentsLessRetainage : storedPrevCerts;

    // Contract sum to date = original contract sum ± net change orders (rows 1–3
    // of the G702; these are not part of the SOV completed-work math).
    const contractSumCents = toCents(pa.contract_sum || 0);
    const changeOrdersTotalCents = toCents(pa.change_orders_total || 0);
    const contractSumToDateCents = addCents(contractSumCents, changeOrdersTotalCents);

    // Work-completed totals for the G702 4a/4b/4c breakdown lines.
    const prevCompletedCents = hasSov ? sumCents(sovLines.map((l) => l.fromPrevious)) : toCents(Number(pa.prev_completed) || 0);
    const thisPeriodCents = hasSov ? sumCents(sovLines.map((l) => l.thisPeriod)) : toCents(Number(pa.this_period) || 0);
    const materialsStoredCents = hasSov ? sumCents(sovLines.map((l) => l.storedMaterials)) : toCents(Number(pa.stored_materials) || 0);

    const g702Bytes = await generateG702({
      projectName: project?.name || '',
      projectAddress: project?.address || '',
      ownerName: pa.owner_name || ownerName(project) || '',
      architectName: pa.architect_name || architectName(project) || '',
      gcName: body.gcName || project?.gc_name || 'General Contractor',
      appNumber: pa.app_number,
      periodFrom: pa.period_from || '',
      periodTo: pa.period_to || '',
      contractSum: toDollars(contractSumCents),
      changeOrdersTotal: toDollars(changeOrdersTotalCents),
      contractSumToDate: toDollars(contractSumToDateCents),
      prevCompleted: toDollars(prevCompletedCents),
      thisPeriod: toDollars(thisPeriodCents),
      materialsStored: toDollars(materialsStoredCents),
      totalCompleted: toDollars(calc.completedAndStoredTotal),
      percentComplete: calc.percentComplete,
      retainagePercent,
      retainageAmount: toDollars(calc.retainageTotal),
      totalEarnedLessRetainage: toDollars(calc.totalEarnedLessRetainage),
      prevPayments: toDollars(printedPrevCerts),
      // Row 8 = (Total Earned Less Retainage) − (Previous Certificates).
      // The engine subtracts prior payments; the old code emitted the raw DB
      // value, which omitted that subtraction.
      currentPaymentDue: toDollars(calc.currentPaymentDue),
      branding,
    });

    const g703Bytes = await generateG703({
      projectName: project?.name || '',
      appNumber: pa.app_number,
      periodTo: pa.period_to || '',
      branding,
      lineItems: rows.map((i, idx) => {
        const line = calc.lines[idx];
        const sv = sovLines[idx];
        return {
          lineNumber: i.line_number || idx + 1,
          description: i.description,
          scheduledValue: toDollars(sv.scheduledValue),
          workFromPrev: toDollars(sv.fromPrevious),
          workThisPeriod: toDollars(sv.thisPeriod),
          materialsStored: toDollars(sv.storedMaterials),
          totalCompleted: toDollars(line.completedAndStored),
          percentComplete: line.percentComplete,
          balanceToFinish: toDollars(line.balanceToFinish),
          retainage: toDollars(line.retainage),
        };
      }),
    });

    /* Five applications on one job filed five identical library rows reading
       "AIA G702", because saveDocument() was never told which application this
       was. The number and the period are what a GC looks for. */
    const period = pa.period_to ? fmtDate(pa.period_to, { month: 'short', year: 'numeric' }, '') : '';
    const label = `Application ${pa.app_number ?? '—'}${period ? ` — ${period}` : ''}`;
    const source = { sourceType: 'pay_application', sourceId: body.payAppId };

    const [g702Url, g703Url] = await Promise.all([
      saveDocument(body.projectId || project?.id, 'g702', g702Bytes, { payAppId: body.payAppId }, tenantId,
        { ...source, title: `${label} — G702` }),
      saveDocument(body.projectId || project?.id, 'g703', g703Bytes, { payAppId: body.payAppId }, tenantId,
        { ...source, title: `${label} — G703 continuation` }),
    ]);

    /* Generating a document records the document — the PDF links. The money
       is written only where it can be recomputed from a schedule of values
       AND the application is still a draft the GC is editing (the same
       engine PUT /api/pay-apps/[id] uses, so the stored G702 cross-foots
       with the issued one). A lump-sum app, or one already with the owner
       or approved, never has its money rewritten by printing it.
       (net_amount_due is not a column; writing it failed every generation.) */
    const draft = ['draft', 'rejected'].includes(String(pa.status || 'draft').toLowerCase());
    const writeBack: Record<string, unknown> = { g702_pdf_url: g702Url, g703_pdf_url: g703Url };
    if (hasSov && draft) {
      Object.assign(writeBack, {
        total_completed: toDollars(calc.completedAndStoredTotal),
        percent_complete: calc.percentComplete,
        retainage_amount: toDollars(calc.retainageTotal),
        // total_retainage is the column every screen reads first (lib/retainage).
        total_retainage: toDollars(calc.retainageTotal),
        total_earned_less_retainage: toDollars(calc.totalEarnedLessRetainage),
        less_previous_certificates: toDollars(previousPaymentsLessRetainage),
        current_payment_due: toDollars(calc.currentPaymentDue),
      });
    }
    await must(db.from('pay_applications').update(writeBack as unknown as Database['public']['Tables']['pay_applications']['Update'])
      .eq('id', body.payAppId).eq('tenant_id', user.tenantId), 'pay_applications update');

    return NextResponse.json({ g702Url, g703Url, success: true });
  } catch (e) {
    /* Was a bare `catch {}`. A G702 is the document a contractor gets paid
       with; when generating one fails, somebody has to be able to find out
       why. Logged server-side with a correlation id; the caller still gets a
       message written for a GC, never the database's words. */
    return apiError('documents/pay-application', e, 'Could not generate the pay application documents');
  }
}
