import { PDFDocument, StandardFonts, PageSizes } from 'pdf-lib';
import { createServerClient } from '../supabase-server';
import {
  getProjectContext,
  drawField,
  fmtCurrency,
  saveDocument,
} from '../pdf-engine';
import { brandDoc, drawBrandHeader, stampFooters, DOC } from './report-theme';

export interface PrevailingWageInput {
  projectId: string;
  county?: string;
}

interface WageRate {
  trade: string;
  baseRate: number;
  fringe: number;
  total: number;
  custom: boolean;
  determination: string | null;
  effectiveDate: string | null;
}

/**
 * Real prevailing-wage rate schedule from the `wage_determinations` table — the
 * SAME source the /api/prevailing-wage lookup and the WH-347 certified-payroll
 * page pull from. Reference (seed) rows are tenant-agnostic (tenant_id NULL);
 * the project tenant's own entered determinations (custom) override them and are
 * authoritative for that tenant.
 *
 * NOTHING is fabricated: if no determination is on file for the project's state
 * (and county), the PDF renders an honest empty schedule directing the user to
 * add their official determination / verify on SAM.gov — it never invents rates.
 *
 * NOTE: createServerClient() is the service-role client (bypasses RLS), so this
 * query filters by tenant EXPLICITLY (tenant_id IS NULL OR = the project tenant).
 */

interface WageRow {
  id: string;
  tenant_id: string | null;
  state: string;
  county: string | null;
  determination_number: string | null;
  effective_date: string | null;
  classification: string;
  base_rate: number;
  fringe_rate: number;
}

async function loadRates(
  tenantId: string | null,
  state: string,
  county: string | null,
): Promise<WageRate[]> {
  if (!state) return [];
  const db = createServerClient();
  let q = db
    .from('wage_determinations')
    .select('id, tenant_id, state, county, determination_number, effective_date, classification, base_rate, fringe_rate')
    .eq('state', state);
  // Reference seed rows (tenant_id NULL) plus this project's tenant's own rows.
  q = tenantId ? q.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`) : q.is('tenant_id', null);

  const { data, error } = await q;
  if (error) throw error;
  let rows = (data || []) as WageRow[];
  if (rows.length === 0) return [];

  // County filter: exact county OR statewide (county NULL). If a specific county
  // was requested but matches nothing, fall back to all state rows rather than
  // hiding real data behind a wrong/defaulted county.
  if (county) {
    const scoped = rows.filter((r) => (r.county || '') === county || r.county == null);
    if (scoped.length > 0) rows = scoped;
  }

  // Tenant custom rows win over a seed row for the same
  // state/county/determination/classification key.
  const byKey = new Map<string, WageRow>();
  for (const r of rows) {
    const key = [r.state, r.county || '', r.determination_number || '', r.classification].join('|');
    const existing = byKey.get(key);
    if (!existing || (r.tenant_id && !existing.tenant_id)) byKey.set(key, r);
  }

  return Array.from(byKey.values())
    .map((r) => ({
      trade: r.classification,
      baseRate: r.base_rate || 0,
      fringe: r.fringe_rate || 0,
      total: (r.base_rate || 0) + (r.fringe_rate || 0),
      custom: !!r.tenant_id,
      determination: r.determination_number,
      effectiveDate: r.effective_date,
    }))
    .sort((a, b) => a.trade.localeCompare(b.trade));
}

export async function generatePrevailingWage(input: PrevailingWageInput): Promise<{
  pdfBytes: Uint8Array;
  pdfUrl: string;
}> {
  const ctx = await getProjectContext(input.projectId);
  const { project } = ctx;
  const p = project as any;

  const tenantId: string | null = p?.tenant_id ?? null;
  const state = String(p?.state || '').trim().toUpperCase();
  const county = (input.county || p?.county || '').trim() || null;

  const rates = await loadRates(tenantId, state, county);
  const hasCustom = rates.some((r) => r.custom);
  const allCustom = rates.length > 0 && rates.every((r) => r.custom);

  const pdf = await PDFDocument.create();
  const kit = await brandDoc(pdf, { tenantId, projectId: input.projectId });
  const page = pdf.addPage(PageSizes.Letter);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  // Corporate letterhead — tenant logo + accent color (report-theme).
  // Subtitle stays honest about what this schedule is.
  drawBrandHeader(page, kit, {
    title: 'PREVAILING WAGE RATE SCHEDULE',
    subtitle: allCustom
      ? 'Davis-Bacon / State Prevailing Wage — Your entered determination'
      : 'Davis-Bacon / State Prevailing Wage — Reference schedule (verify on SAM.gov)',
  });

  // Project info
  let y = height - 78;
  drawField(page, font, bold, 'PROJECT:', p?.name || '', 10, y, 200);
  drawField(page, font, bold, 'PROJECT NO:', p?.project_number || '', 215, y, 130);
  drawField(page, font, bold, 'DATE:', new Date().toLocaleDateString(), 350, y, 130);

  y -= 30;
  drawField(page, font, bold, 'PROJECT ADDRESS:', p?.address || '', 10, y, 270);
  drawField(page, font, bold, 'COUNTY:', county || 'Statewide', 285, y, 130);
  drawField(page, font, bold, 'STATE:', state || '—', 420, y, 130);

  // Separator
  y -= 20;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 1,
    color: DOC.accent,
  });

  if (rates.length === 0) {
    // Honest empty state — no fabricated rates.
    y -= 28;
    page.drawText('No wage determination on file', {
      x: 10, y, size: 11, font: bold, color: DOC.ink,
    });
    y -= 18;
    const lines = state
      ? [
          `There is no prevailing-wage determination on file for ${state}${county ? ' — ' + county : ''}.`,
          'Add your official wage determination under Compliance → Prevailing Wage, or look it up',
          'on SAM.gov (System for Award Management / WDOL) for the exact project, county, and',
          'decision number, before certifying payroll. This platform does not invent rates.',
        ]
      : [
          'This project has no state set, so no prevailing-wage schedule can be resolved.',
          'Set the project State (and County), then add or look up the official Davis-Bacon',
          'determination on SAM.gov (WDOL) before certifying payroll.',
        ];
    for (const ln of lines) {
      page.drawText(ln, { x: 10, y, size: 8.5, font, color: DOC.muted });
      y -= 13;
    }
  } else {
    // Table header
    y -= 18;
    page.drawRectangle({
      x: 10,
      y: y - 4,
      width: width - 20,
      height: 16,
      color: DOC.ink,
    });
    page.drawText('TRADE CLASSIFICATION', { x: 15, y: y + 1, size: 7.5, font: bold, color: DOC.paper });
    page.drawText('BASE RATE', { x: 250, y: y + 1, size: 7.5, font: bold, color: DOC.paper });
    page.drawText('FRINGE BENEFITS', { x: 340, y: y + 1, size: 7.5, font: bold, color: DOC.paper });
    page.drawText('TOTAL RATE', { x: 440, y: y + 1, size: 7.5, font: bold, color: DOC.paper });
    page.drawText('SOURCE', { x: 520, y: y + 1, size: 7.5, font: bold, color: DOC.paper });

    // Wage rows — real data only.
    for (let i = 0; i < rates.length; i++) {
      const rate = rates[i];
      y -= 18;
      if (y < 90) break; // keep footer room; overflow trades are omitted honestly
      page.drawRectangle({
        x: 10,
        y: y - 4,
        width: width - 20,
        height: 18,
        color: i % 2 === 0 ? DOC.zebra : DOC.paper,
      });
      page.drawText(String(rate.trade).slice(0, 40), { x: 15, y: y + 2, size: 9, font, color: DOC.ink });
      page.drawText(fmtCurrency(rate.baseRate), { x: 250, y: y + 2, size: 9, font, color: DOC.text });
      page.drawText(fmtCurrency(rate.fringe), { x: 340, y: y + 2, size: 9, font, color: DOC.text });
      page.drawText(fmtCurrency(rate.total), { x: 440, y: y + 2, size: 9, font: bold, color: DOC.ink });
      page.drawText(rate.custom ? 'CUSTOM' : 'REFERENCE', {
        x: 520, y: y + 2, size: 7.5, font: bold,
        color: rate.custom ? DOC.success : DOC.muted,
      });
    }
  }

  // Footer note — honest disclaimer mirroring /api/prevailing-wage.
  y -= 30;
  page.drawLine({
    start: { x: 10, y },
    end: { x: width - 10, y },
    thickness: 0.5,
    color: DOC.accent,
  });
  y -= 15;
  page.drawText('NOTICE:', { x: 10, y, size: 9, font: bold, color: DOC.ink });
  y -= 14;
  const notice = allCustom
    ? [
        'Rows marked CUSTOM are your own entered wage determination and are authoritative for your tenant.',
        'Confirm the decision number and effective date match the official determination before certifying payroll.',
      ]
    : [
        'Rows marked REFERENCE are SAMPLE/REFERENCE rates for estimating and planning only — they are NOT',
        'an official wage determination. Verify against the official determination on SAM.gov (System for Award',
        'Management / WDOL) for the exact project, county, and decision number before certifying payroll.',
        'Rows marked CUSTOM are your own entered determination and override the reference schedule.',
      ];
  for (const ln of notice) {
    page.drawText(ln, { x: 10, y, size: 8.5, font, color: DOC.muted });
    y -= 12;
  }

  // Corporate footer: Page X of Y • company • generated date
  stampFooters(pdf, kit, 'Prevailing Wage Schedule');

  const pdfBytes = await pdf.save();
  const pdfUrl = await saveDocument(
    input.projectId,
    'prevailing_wage',
    pdfBytes,
    { state, county, rateCount: rates.length, hasCustom },
    tenantId ?? undefined,
  );

  return { pdfBytes, pdfUrl };
}
