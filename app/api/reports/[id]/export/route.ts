import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { runReport, ReportRunError } from '@/lib/reports/run';
import { generateReportData, isRunnableReportType, normalizeReportType } from '@/lib/reports/generate';
import { ENTITY_MAP, type ColType } from '@/lib/report-entities';
import {
  buildCsv,
  buildXlsx,
  buildDocx,
  safeFilename,
  todayStamp,
  EXPORT_CONTENT_TYPE,
  type ReportColumn,
  type ColumnType,
} from '@/lib/report-export';
import {
  generateExecReportPdf,
  computeCurrencyTotals,
  resolveBrandingValues,
} from '@/lib/document-templates/exec-report-generator';
import { apiError } from '@/lib/api-error';
import { requestDay } from '@/lib/time-zone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/[id]/export?format=pdf|csv|xlsx
 *
 * Exports a SAVED report template (report_templates) as a real, downloadable file.
 *
 * The persisted template carries only a DEFINITION (entity/module + selected
 * columns + filters), never row data. This route resolves that definition to the
 * SAME live, tenant-scoped report engines the interactive routes use:
 *   • an entity definition (template_data.entity / .config.entity / an entity-keyed
 *     report_type) → lib/reports/run.runReport  (POST /api/reports/run)
 *   • a canned reportType (report_type / template_data.reportType / .preset)
 *     → lib/reports/generate.generateReportData  (POST /api/reports/generate)
 * then streams the ACTUAL rows through the shared CSV/XLSX builders in
 * lib/report-export.ts; the PDF renders through the corporate exec builder in
 * lib/document-templates/exec-report-generator.ts (tenant letterhead, KPI band,
 * Page X of Y footers).
 *
 * If the definition maps to no runnable engine, we return an honest error — we
 * never fabricate placeholder rows and present them as data.
 *
 * SECURITY: service-role bypasses RLS, so the template read is tenant-scoped
 * (eq tenant_id) and both engines re-apply eq('tenant_id', user.tenantId) on
 * every underlying query.
 */

type ColumnDef = { key: string; label: string; enabled?: boolean; type?: string };

/** report-entities ColType → report-export ColumnType (only 'bool' has no export peer). */
function toExportType(t: ColType): ColumnType {
  return t === 'bool' ? 'text' : t;
}

interface ResolvedReport {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
}

/**
 * Resolve a report_templates row to real, tenant-scoped rows using the live engines.
 * Returns null when the definition maps to no runnable engine (honest — no fabricated rows).
 */
async function resolveReport(
  db: ReturnType<typeof createServerClient>,
  tenantId: string,
  row: Record<string, unknown>,
  td: Record<string, unknown>,
  title: string,
  timeZone: string,
): Promise<ResolvedReport | null> {
  const reportTypeScalar = typeof row.report_type === 'string' ? row.report_type : '';
  const cfg = (td.config && typeof td.config === 'object') ? (td.config as Record<string, unknown>) : td;

  // ── 1) Entity definition → lib/reports/run.runReport ──
  const entityCandidates = [
    typeof td.entity === 'string' ? td.entity : null,
    typeof cfg.entity === 'string' ? (cfg.entity as string) : null,
    ENTITY_MAP[reportTypeScalar] ? reportTypeScalar : null,
    typeof td.type === 'string' && ENTITY_MAP[td.type as string] ? (td.type as string) : null,
  ];
  const entity = entityCandidates.find((e): e is string => !!e && !!ENTITY_MAP[e]) || null;

  if (entity) {
    // Prefer the template's selected columns (builder ColumnDef[] → keys, or a config
    // string[] of keys). runReport intersects these with the entity whitelist and
    // falls back to all columns when none are valid.
    let columnKeys: string[] | undefined;
    const rawCols = (td.columns ?? cfg.columns) as unknown;
    if (Array.isArray(rawCols)) {
      if (rawCols.every((c) => typeof c === 'string')) {
        columnKeys = rawCols as string[];
      } else {
        columnKeys = (rawCols as ColumnDef[])
          .filter((c) => c && typeof c === 'object' && c.key && c.enabled !== false)
          .map((c) => c.key);
      }
      if (columnKeys.length === 0) columnKeys = undefined;
    }

    const filters = Array.isArray(td.filters) ? td.filters : (Array.isArray(cfg.filters) ? cfg.filters : undefined);
    const groupBy = typeof cfg.groupBy === 'string' ? cfg.groupBy : (typeof td.groupBy === 'string' ? td.groupBy : undefined);
    const sort = (cfg.sort && typeof cfg.sort === 'object') ? cfg.sort : ((td.sort && typeof td.sort === 'object') ? td.sort : undefined);
    const limitRaw = cfg.limit ?? td.limit;

    const result = await runReport(db as never, tenantId, {
      entity,
      columns: columnKeys,
      filters,
      groupBy,
      sort,
      limit: limitRaw,
    });

    const columns: ReportColumn[] = result.columns.map((c) => ({
      key: c.key,
      label: c.label,
      type: toExportType(c.type),
    }));
    return { title, columns, rows: result.rows };
  }

  // ── 2) Canned reportType → lib/reports/generate.generateReportData ──
  const reportType = normalizeReportType(String(td.reportType || td.preset || reportTypeScalar || '').trim());
  if (reportType && isRunnableReportType(reportType)) {
    const projectId = typeof td.projectId === 'string'
      ? td.projectId
      : (typeof cfg.projectId === 'string' ? (cfg.projectId as string) : null);
    const gen = await generateReportData(db as never, tenantId, reportType, projectId, { timeZone });
    // generateReportData returns positional, ALREADY-FORMATTED string cells (its
    // documented contract). Re-key into synthetic keys so the shared builders can
    // address each cell, and keep every column as 'text' — re-typing pre-formatted
    // strings would re-coerce them (e.g. a "CO #" heuristic would turn "CO-7" into 0).
    const columns: ReportColumn[] = gen.columns.map((label, i) => ({
      key: `c${i}`,
      label,
      type: 'text',
    }));
    const rows: Record<string, unknown>[] = gen.rows.map((r) => {
      const obj: Record<string, unknown> = {};
      r.forEach((cell, i) => { obj[`c${i}`] = cell; });
      return obj;
    });
    return { title, columns, rows };
  }

  // No runnable engine for this definition.
  return null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const rawFormat = (searchParams.get('format') || 'csv').toLowerCase();
    const format: 'csv' | 'xlsx' | 'pdf' | 'docx' =
      rawFormat === 'pdf' || rawFormat === 'xlsx' || rawFormat === 'docx' ? rawFormat : 'csv';

    const supabase = createServerClient();
    const { data: row, error } = await supabase
      .from('report_templates')
      .select('*')
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const td = (row.template_data && typeof row.template_data === 'object')
      ? (row.template_data as Record<string, unknown>)
      : {};

    const title = String(row.name ?? td.name ?? 'Report');

    // Resolve the saved definition to REAL, tenant-scoped rows.
    let resolved: ResolvedReport | null;
    try {
      const { zone } = await requestDay(req.headers, supabase, user.tenantId, 'reports/export');
      resolved = await resolveReport(supabase, user.tenantId, row as Record<string, unknown>, td, title, zone);
    } catch (e) {
      if (e instanceof ReportRunError) {
        return apiError('reports/id/export', e);
      }
      throw e;
    }

    if (!resolved) {
      // Honest: this template's definition maps to no runnable data source. We do
      // not emit fabricated rows dressed up as data.
      return NextResponse.json(
        {
          error:
            'This report template has no runnable data source. Rebuild it in the Report Builder (pick an entity + columns) or save it as a supported report type, then export again.',
        },
        { status: 422 },
      );
    }

    const { columns, rows } = resolved;
    const safeTitle = safeFilename(title);
    const dateStamp = todayStamp();

    // Sum every currency column so all three formats carry a real totals row
    // (money is NUMERIC-as-TEXT — computeCurrencyTotals Number()s every cell).
    const totals = computeCurrencyTotals(columns, rows);
    const branding = await resolveBrandingValues({ tenantId: user.tenantId });

    if (format === 'csv') {
      const csv = buildCsv(columns, rows, title, totals, branding.companyName);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': EXPORT_CONTENT_TYPE.csv,
          'Content-Disposition': `attachment; filename="${safeTitle}-${dateStamp}.csv"`,
        },
      });
    }

    if (format === 'xlsx') {
      const xlsxBuffer = await buildXlsx(columns, rows, title, totals, branding.companyName);
      return new NextResponse(xlsxBuffer as unknown as BodyInit, {
        headers: {
          'Content-Type': EXPORT_CONTENT_TYPE.xlsx,
          'Content-Disposition': `attachment; filename="${safeTitle}-${dateStamp}.xlsx"`,
        },
      });
    }
    if (format === 'docx') {
      const docxBuffer = await buildDocx(columns, rows, title, totals, branding.companyName);
      return new NextResponse(docxBuffer as unknown as BodyInit, {
        headers: {
          'Content-Type': EXPORT_CONTENT_TYPE.docx,
          'Content-Disposition': `attachment; filename="${safeTitle}-${dateStamp}.docx"`,
        },
      });
    }

    // pdf — corporate exec-style rendering: tenant letterhead (logo + accent),
    // KPI band, line-item table, Page X of Y footers.
    const pdfBytes = await generateExecReportPdf({
      title,
      columns,
      rows,
      totals,
      tenantId: user.tenantId,
      docLabel: 'Saved Report',
    });
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': EXPORT_CONTENT_TYPE.pdf,
        'Content-Disposition': `attachment; filename="${safeTitle}-${dateStamp}.pdf"`,
      },
    });
  } catch (e) {
    return apiError('reports/[id]/export GET', e, 'Export failed');
  }
}
