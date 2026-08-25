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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNS: ReportColumn[] = [
  { key: 'meeting_date', label: 'Date', type: 'date' },
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'meeting_type', label: 'Type', type: 'text' },
  { key: 'location', label: 'Location', type: 'text' },
  { key: 'start_time', label: 'Start', type: 'text' },
  { key: 'end_time', label: 'End', type: 'text' },
  { key: 'facilitator_name', label: 'Facilitator', type: 'text' },
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

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, logo_url')
      .eq('id', projectId)
      .eq('tenant_id', user.tenantId)
      .single();
    if (projectError || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let query = supabase
      .from('meetings')
      .select('id, meeting_date, title, meeting_type, location, start_time, end_time, facilitator_name, status')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('meeting_date', { ascending: false });
    if (ids.length > 0) query = query.in('id', ids);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as Record<string, unknown>[];
    const title = `Meetings - ${(project as { name?: string }).name || 'Project'}`;
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
    const pdfBytes = await generateExecReportPdf({
      title,
      columns: COLUMNS,
      rows,
      tenantId: user.tenantId,
      brandingOverride: { companyName, logoUrl },
      docLabel: 'Meeting Log',
    });
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': EXPORT_CONTENT_TYPE.pdf,
        'Content-Disposition': `attachment; filename="${safeTitle}-${dateStamp}.pdf"`,
      },
    });
  } catch {
    console.error('[meetings/export] export failed');
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const { projectId } = params;
  const body = await req.json().catch(() => ({} as { meeting_ids?: string[]; ids?: string[]; format?: string }));
  const ids = Array.isArray(body.meeting_ids) ? body.meeting_ids : Array.isArray(body.ids) ? body.ids : [];
  return build(req, projectId, ids, normalizeFormat(body.format));
}

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get('ids');
  const ids = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return build(req, projectId, ids, normalizeFormat(searchParams.get('format')));
}
