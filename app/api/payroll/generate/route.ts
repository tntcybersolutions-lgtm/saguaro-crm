import { NextRequest, NextResponse } from 'next/server';
import { generateWH347, saveDocument } from '@/lib/pdf-engine';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { fmtDate } from '@/lib/format-date';

/**
 * POST /api/payroll/generate
 *
 * Generates + PERSISTS a DOL WH-347 certified payroll for a prevailing-wage
 * (Davis-Bacon) week. This is a legal compliance record: it must persist the
 * header AND every employee line (name, SSN last-4, classification, daily
 * hours, wages) and render a real WH-347 PDF the GC can retrieve.
 *
 * Accepts the exact payload the Certified Payroll page sends:
 *   { projectId, weekEndingDate, employees[{ name, last4ssn, classification,
 *     hours{Mon..Sun}, hourlyRate, otRate, gross, deductions, net, overtime }],
 *     totalGross }
 *
 * Persists:
 *   - certified_payroll  (one header row, tenant-scoped, with entries JSON snapshot)
 *   - certified_payroll_lines  (one normalized row per employee — audit/query source of truth)
 *
 * Returns { downloadUrl, id }.
 */

const DAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type DayKey = typeof DAY_KEYS[number];

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Pay Apps', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;

  let body: {
    projectId?: string;
    weekEndingDate?: string;
    employees?: Array<Record<string, unknown>>;
    totalGross?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const projectId = body.projectId;
  const weekEnding = body.weekEndingDate;
  const rawEmployees = Array.isArray(body.employees) ? body.employees : [];

  if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 });
  if (!weekEnding) return NextResponse.json({ error: 'Week Ending Date is required.' }, { status: 400 });
  if (rawEmployees.length === 0) {
    return NextResponse.json({ error: 'At least one employee is required.' }, { status: 400 });
  }

  const db = createServerClient();

  try {
    // ── Project + tenant context (tenant-scoped) ─────────────────────────────
    const [{ data: project }, { data: tenant }] = await Promise.all([
      db.from('projects').select('*').eq('id', projectId).eq('tenant_id', user.tenantId).single(),
      db.from('tenants').select('name').eq('id', user.tenantId).maybeSingle(),
    ]);
    const p = project as { name?: string; address?: string; city?: string; state?: string; zip?: string; gc_name?: string; project_number?: string } | null;
    if (!p) {
      // Project doesn't belong to this tenant (or doesn't exist) — never file payroll against it.
      return NextResponse.json({ error: 'Project not found for this account.' }, { status: 404 });
    }
    const contractorName = p.gc_name || (tenant as { name?: string } | null)?.name || 'Contractor';
    const projectAddress = [p.address, p.city, p.state, p.zip].filter(Boolean).join(', ');

    // ── Normalize employees + recompute wages server-side ────────────────────
    const employees = rawEmployees.map((e) => {
      const hoursIn = (e.hours ?? {}) as Partial<Record<DayKey, unknown>>;
      const daily = {} as Record<DayKey, number>;
      let totalHours = 0;
      for (const k of DAY_KEYS) {
        const v = Number(hoursIn[k]) || 0;
        daily[k] = v;
        totalHours += v;
      }
      const regularHours = Math.min(totalHours, 40);
      const overtimeHours = Math.max(0, totalHours - 40);
      const hourlyRate = Number(e.hourlyRate) || 0;
      const otRate = Number(e.otRate) || hourlyRate * 1.5;
      // Trust client gross if provided (page computes it), else derive.
      const gross = e.gross != null ? Number(e.gross) || 0 : regularHours * hourlyRate + overtimeHours * otRate;
      // Real WH-347 deduction columns — per employee, from the employer's payroll.
      // These populate FICA / Fed W/H / State W/H / Other on the form instead of
      // hardcoded $0. `deductions` is the "Other" bucket (dues, garnishments, etc.).
      const fica = Math.max(0, Number(e.fica) || 0);
      const fedWH = Math.max(0, Number(e.fedWH) || 0);
      const stateWH = Math.max(0, Number(e.stateWH) || 0);
      const otherDed = Math.max(0, Number(e.deductions) || 0);
      const totalDeductions = fica + fedWH + stateWH + otherDed;
      // Net is derived authoritatively from gross minus the itemized deductions so
      // the columns always reconcile (gross − total deductions == net).
      const net = Math.max(0, gross - totalDeductions);
      return {
        name: String(e.name ?? '').trim(),
        last4ssn: String(e.last4ssn ?? '').replace(/\D/g, '').slice(-4),
        classification: String(e.classification ?? 'Laborer'),
        daily,
        totalHours,
        regularHours,
        overtimeHours,
        hourlyRate,
        otRate,
        gross,
        fica,
        fedWH,
        stateWH,
        otherDed,
        deductions: totalDeductions,
        net,
        overtime: !!e.overtime,
      };
    });

    const totalGross = employees.reduce((s, e) => s + e.gross, 0);
    const totalDeductions = employees.reduce((s, e) => s + e.deductions, 0);
    const totalNet = employees.reduce((s, e) => s + e.net, 0);

    // ── Sequential payroll number per project ────────────────────────────────
    const { count } = await db
      .from('certified_payroll')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId);
    const payrollNumber = (count || 0) + 1;

    // ── Render the WH-347 PDF (existing engine) ──────────────────────────────
    const pdfBytes = await generateWH347({
      projectName: p.name || 'Project',
      projectAddress,
      gcName: contractorName,
      weekEnding,
      payrollNumber,
      employees: employees.map((e) => ({
        name: e.name,
        title: e.classification,
        classification: e.classification,
        hoursMonday: e.daily.Mon,
        hoursTuesday: e.daily.Tue,
        hoursWednesday: e.daily.Wed,
        hoursThursday: e.daily.Thu,
        hoursFriday: e.daily.Fri,
        hoursSaturday: e.daily.Sat,
        hoursSunday: e.daily.Sun,
        regularRate: e.hourlyRate,
        otRate: e.otRate,
        grossEarnings: e.gross,
        fica: e.fica,
        withholding: e.fedWH,
        stateWH: e.stateWH,
        otherDed: e.otherDed,
        netPay: e.net,
      })),
    });

    // Upload to the private 'documents' bucket + register in generated_documents.
    // Returns a signed URL for immediate download.
    /* A certified payroll is filed every week a crew is on a prevailing-wage
       job, so this is the document the library accumulates fastest — fifty-two
       rows a year, all reading "WH-347 Certified Payroll" until the payroll
       number and the week are on the row. */
    const pdfUrl = await saveDocument(
      projectId,
      'wh347-certified-payroll',
      pdfBytes,
      { weekEnding, payrollNumber, employeeCount: employees.length, totalGross, totalNet },
      user.tenantId,
      { title: `Payroll #${payrollNumber} — week ending ${fmtDate(weekEnding, { month: 'short', day: 'numeric', year: 'numeric' }, weekEnding)}` },
    );

    // ── Persist the header ───────────────────────────────────────────────────
    const entriesSnapshot = employees.map((e) => ({
      name: e.name,
      last4ssn: e.last4ssn,
      classification: e.classification,
      hours: e.daily,
      totalHours: e.totalHours,
      regularHours: e.regularHours,
      overtimeHours: e.overtimeHours,
      hourlyRate: e.hourlyRate,
      otRate: e.otRate,
      gross: e.gross,
      fica: e.fica,
      fedWH: e.fedWH,
      stateWH: e.stateWH,
      otherDed: e.otherDed,
      deductions: e.deductions, // total of all deduction columns
      net: e.net,
      overtime: e.overtime,
    }));

    const { data: header, error: headerErr } = await db
      .from('certified_payroll')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        week_ending: weekEnding,
        payroll_number: payrollNumber,
        contractor_name: contractorName,
        project_name: p.name || null,
        project_number: p.project_number || null,
        project_location: projectAddress || null,
        entries: entriesSnapshot,
        total_gross: totalGross,
        total_deductions: totalDeductions,
        total_net: totalNet,
        statement_of_compliance: true,
        signed_by: user.email,
        signed_at: new Date().toISOString(),
        status: 'submitted',
        pdf_url: pdfUrl,
      })
      .select('id')
      .single();

    if (headerErr) throw headerErr;
    const certifiedPayrollId = (header as { id: string }).id;

    // ── Persist normalized employee line items ───────────────────────────────
    const lineRows = employees.map((e, i) => ({
      certified_payroll_id: certifiedPayrollId,
      tenant_id: user.tenantId,
      project_id: projectId,
      line_number: i + 1,
      employee_name: e.name,
      last4_ssn: e.last4ssn,
      classification: e.classification,
      hours_mon: e.daily.Mon,
      hours_tue: e.daily.Tue,
      hours_wed: e.daily.Wed,
      hours_thu: e.daily.Thu,
      hours_fri: e.daily.Fri,
      hours_sat: e.daily.Sat,
      hours_sun: e.daily.Sun,
      total_hours: e.totalHours,
      regular_hours: e.regularHours,
      overtime_hours: e.overtimeHours,
      hourly_rate: e.hourlyRate,
      ot_rate: e.otRate,
      gross_wages: e.gross,
      fica: e.fica,
      federal_withholding: e.fedWH,
      state_withholding: e.stateWH,
      other_deductions: e.otherDed,
      deductions: e.deductions, // total of all deduction columns
      net_wages: e.net,
      overtime_eligible: e.overtime,
    }));

    const { error: linesErr } = await db.from('certified_payroll_lines').insert(lineRows);
    if (linesErr) {
      // Never leave a filed certified-payroll header without its employee lines.
      await must(db.from('certified_payroll').delete().eq('id', certifiedPayrollId), 'certified_payroll delete');
      throw linesErr;
    }

    return NextResponse.json({ downloadUrl: pdfUrl, id: certifiedPayrollId });
  } catch (err) {
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[payroll/generate]', err);
    const message = "Failed to generate certified payroll.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
