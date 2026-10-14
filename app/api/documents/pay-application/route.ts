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
    const retainagePercent = Number(pa.retainage_percent) || 10;
    const previousPaymentsLessRetainage = toCents(pa.prev_payments || 0);

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

    // Compute the schedule of values so the document cross-foots. The computed
    // totals — not the client/DB-supplied ones — drive the math.
    const calc = computePayApp({
      lines: sovLines,
      retainagePercent,
      previousPaymentsLessRetainage,
    });

    // Contract sum to date = original contract sum ± net change orders (rows 1–3
    // of the G702; these are not part of the SOV completed-work math).
    const contractSumCents = toCents(pa.contract_sum || 0);
    const changeOrdersTotalCents = toCents(pa.change_orders_total || 0);
    const contractSumToDateCents = addCents(contractSumCents, changeOrdersTotalCents);

    // Work-completed totals for the G702 4a/4b/4c breakdown lines.
    const prevCompletedCents = sumCents(sovLines.map((l) => l.fromPrevious));
    const thisPeriodCents = sumCents(sovLines.map((l) => l.thisPeriod));
    const materialsStoredCents = sumCents(sovLines.map((l) => l.storedMaterials));

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
      prevPayments: toDollars(previousPaymentsLessRetainage),
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

    // Update pay app with PDF URLs and the computed (cross-footed) summary so
    // the stored figures match the issued document. Existing columns only.
    await must(db.from('pay_applications').update({
      g702_pdf_url: g702Url,
      g703_pdf_url: g703Url,
      total_completed: toDollars(calc.completedAndStoredTotal),
      percent_complete: calc.percentComplete,
      retainage_amount: toDollars(calc.retainageTotal),
      total_earned_less_retainage: toDollars(calc.totalEarnedLessRetainage),
      current_payment_due: toDollars(calc.currentPaymentDue),
      /* net_amount_due is NOT a column on pay_applications. Writing it made
         Postgres reject the whole update with 42703, must() threw, and the
         empty catch below turned it into a bare 500 — so generating a G702
         failed every time and left nothing to diagnose it by. */
    } as unknown as Database['public']['Tables']['pay_applications']['Update']).eq('id', body.payAppId).eq('tenant_id', user.tenantId), 'pay_applications update');

    return NextResponse.json({ g702Url, g703Url, success: true });
  } catch (e) {
    /* Was a bare `catch {}`. A G702 is the document a contractor gets paid
       with; when generating one fails, somebody has to be able to find out
       why. Logged server-side with a correlation id; the caller still gets a
       message written for a GC, never the database's words. */
    return apiError('documents/pay-application', e, 'Could not generate the pay application documents');
  }
}
