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
  { key: 'incident_date', label: 'Date', type: 'date' },
  { key: 'type', label: 'Type', type: 'text' },
  { key: 'severity', label: 'Severity', type: 'badge' },
  { key: 'location', label: 'Location', type: 'text' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'injury_type', label: 'Injury Type', type: 'text' },
  { key: 'reported_by', label: 'Reported By', type: 'text' },
  { key: 'corrective_actions', label: 'Corrective Actions', type: 'text' },
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
      .from('safety_incidents')
      .select('id, incident_date, type, severity, location, description, injury_type, reported_by, corrective_actions, status')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('incident_date', { ascending: false });
    if (ids.length > 0) query = query.in('id', ids);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as Record<string, unknown>[];
    const title = `Safety Incidents - ${(project as { name?: string }).name || 'Project'}`;
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
      docLabel: 'Safety Incident Report',
    });
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': EXPORT_CONTENT_TYPE.pdf,
        'Content-Disposition': `attachment; filename="${safeTitle}-${dateStamp}.pdf"`,
      },
    });
  } catch (e) {
    return apiError('projects/[projectId]/safety/export', e, 'Export failed');
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const { projectId } = params;
  const body = await req.json().catch(() => ({} as { incident_ids?: string[]; ids?: string[]; format?: string }));
  const ids = Array.isArray(body.incident_ids) ? body.incident_ids : Array.isArray(body.ids) ? body.ids : [];
  return build(req, projectId, ids, normalizeFormat(body.format));
}

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get('ids');
  const ids = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return build(req, projectId, ids, normalizeFormat(searchParams.get('format')));
}
