import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
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
import { generateExecReportPdf } from '@/lib/document-templates/exec-report-generator';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNS: ReportColumn[] = [
  { key: 'log_date', label: 'Date', type: 'date' },
  { key: 'superintendent', label: 'Superintendent', type: 'text' },
  { key: 'weather', label: 'Weather', type: 'text' },
  { key: 'crew_count', label: 'Crew', type: 'number' },
  { key: 'work_performed', label: 'Work Performed', type: 'text' },
  { key: 'delays', label: 'Delays', type: 'text' },
  { key: 'materials_delivered', label: 'Materials Delivered', type: 'text' },
  { key: 'safety_notes', label: 'Safety Notes', type: 'text' },
  { key: 'visitors', label: 'Visitors', type: 'text' },
  { key: 'status', label: 'Status', type: 'badge' },
];

type Fmt = 'csv' | 'xlsx' | 'pdf' | 'docx';
function normalizeFormat(v: string | null | undefined): Fmt {
  const f = (v || '').toLowerCase();
  return f === 'csv' || f === 'xlsx' || f === 'pdf' || f === 'docx' ? (f as Fmt) : 'pdf';
}

async function build(req: NextRequest, projectId: string, ids: string[], format: Fmt) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = createServerClient();

    // Verify project belongs to this tenant
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, logo_url')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (projectError || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let query = supabase
      .from('daily_logs')
      .select('id, log_date, superintendent, weather, crew_count, work_performed, delays, materials_delivered, safety_notes, visitors, status')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('log_date', { ascending: false });
    if (ids.length > 0) query = query.in('id', ids);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as Record<string, unknown>[];
    const title = `Daily Logs - ${(project as { name?: string }).name || 'Project'}`;
    const companyName = (project as { name?: string }).name || undefined;
    const logoUrl = (project as { logo_url?: string }).logo_url || undefined;
    const safeTitle = safeFilename(title);
    const dateStamp = todayStamp();

    if (format === 'csv') {
      const csv = buildCsv(COLUMNS, rows, title, undefined, companyName);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': EXPORT_CONTENT_TYPE.csv,
          'Content-Disposition': `attachment; filename="${safeTitle}-${dateStamp}.csv"`,
        },
      });
    }
    if (format === 'xlsx') {
      const xlsx = await buildXlsx(COLUMNS, rows, title, undefined, companyName);
      return new NextResponse(xlsx as unknown as BodyInit, {
        headers: {
          'Content-Type': EXPORT_CONTENT_TYPE.xlsx,
          'Content-Disposition': `attachment; filename="${safeTitle}-${dateStamp}.xlsx"`,
        },
      });
    }
    if (format === 'docx') {
      const docx = await buildDocx(COLUMNS, rows, title, undefined, companyName);
      return new NextResponse(docx as unknown as BodyInit, {
        headers: {
          'Content-Type': EXPORT_CONTENT_TYPE.docx,
          'Content-Disposition': `attachment; filename="${safeTitle}-${dateStamp}.docx"`,
        },
      });
    }
    // Corporate exec-style PDF: tenant letterhead + KPI band + Page X of Y footers.
    // Tenant branding is resolved server-side; the project logo only fills gaps.
    const pdfBytes = await generateExecReportPdf({
      title,
      columns: COLUMNS,
      rows,
      tenantId: user.tenantId,
      brandingOverride: { companyName, logoUrl },
      docLabel: 'Daily Log Report',
    });
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': EXPORT_CONTENT_TYPE.pdf,
        'Content-Disposition': `attachment; filename="${safeTitle}-${dateStamp}.pdf"`,
      },
    });
  } catch (e) {
    return apiError('projects/[projectId]/daily-logs/export', e, 'Export failed');
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const { projectId } = params;
  const body = await req.json().catch(() => ({} as { log_ids?: string[]; ids?: string[]; format?: string }));
  const ids = Array.isArray(body.log_ids) ? body.log_ids : Array.isArray(body.ids) ? body.ids : [];
  return build(req, projectId, ids, normalizeFormat(body.format));
}

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get('ids');
  const ids = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return build(req, projectId, ids, normalizeFormat(searchParams.get('format')));
}
