import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import {
  buildCsv,
  buildXlsx,
  buildDocx,
  safeFilename,
  todayStamp,
  EXPORT_CONTENT_TYPE,
  type ReportColumn,
} from '@/lib/report-export';
import {
  generateExecReportPdf,
  computeCurrencyTotals,
  resolveBrandingValues,
} from '@/lib/document-templates/exec-report-generator';

export const runtime = 'nodejs';

interface ExportBody {
  format: 'csv' | 'xlsx' | 'pdf' | 'docx';
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totals?: Record<string, number>;
  logoUrl?: string;
  companyName?: string;
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Reports', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body: ExportBody = await req.json().catch(() => ({} as ExportBody));
    const {
      format = 'csv',
      title = 'Report',
      columns = [],
      rows = [],
      logoUrl,
      companyName,
    } = body;

    // Totals: trust the caller's when present, otherwise sum every currency
    // column server-side (money is NUMERIC-as-TEXT — Number() everything).
    const totals = (body.totals && Object.keys(body.totals).length > 0)
      ? body.totals
      : computeCurrencyTotals(columns, rows);

    // Server-resolved tenant branding is authoritative; the client-passed
    // values only fill gaps (e.g. tenant record has no company_name yet).
    const branding = await resolveBrandingValues({ tenantId: user.tenantId });
    const brandName = (branding.companyName !== 'Saguaro Control Systems — Construction Management & Project Controls' && branding.companyName)
      ? branding.companyName
      : (companyName || branding.companyName);

    const safeTitle = safeFilename(title);
    const dateStamp = todayStamp();

    if (format === 'csv') {
      const csv = buildCsv(columns, rows, title, totals, brandName);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': EXPORT_CONTENT_TYPE.csv,
          'Content-Disposition': `attachment; filename="${safeTitle}-${dateStamp}.csv"`,
        },
      });
    }

    if (format === 'xlsx') {
      const xlsxBuffer = await buildXlsx(columns, rows, title, totals, brandName);
      return new NextResponse(xlsxBuffer as unknown as BodyInit, {
        headers: {
          'Content-Type': EXPORT_CONTENT_TYPE.xlsx,
          'Content-Disposition': `attachment; filename="${safeTitle}-${dateStamp}.xlsx"`,
        },
      });
    }
    if (format === 'docx') {
      const docxBuffer = await buildDocx(columns, rows, title, totals, brandName);
      return new NextResponse(docxBuffer as unknown as BodyInit, {
        headers: {
          'Content-Type': EXPORT_CONTENT_TYPE.docx,
          'Content-Disposition': `attachment; filename="${safeTitle}-${dateStamp}.docx"`,
        },
      });
    }

    if (format === 'pdf') {
      // Corporate exec-style PDF: tenant letterhead + KPI band + line-item
      // table + Page X of Y footers (lib/document-templates).
      const pdfBytes = await generateExecReportPdf({
        title,
        columns,
        rows,
        totals,
        tenantId: user.tenantId,
        brandingOverride: { companyName: companyName || '', logoUrl: logoUrl || '' },
      });
      return new NextResponse(Buffer.from(pdfBytes), {
        headers: {
          'Content-Type': EXPORT_CONTENT_TYPE.pdf,
          'Content-Disposition': `attachment; filename="${safeTitle}-${dateStamp}.pdf"`,
        },
      });
    }

    return NextResponse.json({ error: `Unknown format: ${format}` }, { status: 400 });
  } catch {
    console.error('[reports/export] export failed');
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
