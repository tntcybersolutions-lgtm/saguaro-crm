import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { PDFDocument, StandardFonts, PageSizes } from 'pdf-lib';
import { DOC } from '@/lib/document-templates/report-theme';
import { must } from '@/lib/db-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/projects/[projectId]/potential-change-orders/[id]/export-pdf
 *
 * Generates a single Potential Change Order (PCO) PDF with pdf-lib. PCOs are
 * change_orders rows with change_type='pco'; PCO-specific fields live in the
 * line_items.pco jsonb blob (see ../route.ts rowToPco). Uploads to the private
 * `documents` bucket via a best-effort signed URL and always returns a base64
 * data-URL fallback.
 *
 * Caller: app/field/change-orders/page.tsx → handleExportPdf('pco')
 *   POST → reads res.json() → uses data.url || data.download_url
 *
 * GET also streams the raw PDF (application/pdf) for direct browser viewing.
 */

type Row = Record<string, unknown>;

const GOLD = DOC.accent;
const DARK = DOC.ink;
const GRAY = DOC.muted;
const LGRAY = DOC.zebra;
const WHITE = DOC.paper;
const BLACK = DOC.ink;

function fmtCurrency(n: unknown): string {
  return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d?: unknown): string {
  if (!d) return '';
  const dt = new Date(String(d));
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function draw(page: any, text: string, x: number, y: number, size: number, font: any, color = BLACK) {
  page.drawText(String(text ?? '').slice(0, 200), { x, y, size, font, color });
}
function wrap(page: any, text: string, x: number, startY: number, font: any, size: number, maxChars: number, color = DARK): number {
  let y = startY;
  const words = String(text ?? '').replace(/\s+/g, ' ').trim().split(' ');
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars) {
      draw(page, line.trim(), x, y, size, font, color);
      y -= size + 3;
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line.trim()) { draw(page, line.trim(), x, y, size, font, color); y -= size + 3; }
  return y;
}
function fieldBox(page: any, label: string, value: string, x: number, y: number, w: number, reg: any, bold: any) {
  page.drawRectangle({ x, y: y - 20, width: w, height: 20, color: LGRAY, borderColor: GRAY, borderWidth: 0.5 });
  draw(page, label, x + 3, y - 8, 7, reg, GRAY);
  draw(page, value, x + 3, y - 18, 9, bold, DARK);
}

/** Maps a change_orders row (change_type='pco') to PCO display fields. Mirrors ../route.ts rowToPco. */
function rowToPco(r: Row) {
  const meta = ((r.line_items as Row) || {}) as Row;
  const pco = (meta.pco as Row) || {};
  const amount = Number(r.amount) || 0;
  return {
    pco_number: (pco.pco_number as number) ?? (r.co_number as number) ?? undefined,
    title: (r.title as string) ?? '',
    description: (r.description as string) ?? '',
    reason: (r.reason as string) ?? '',
    estimated_min: (pco.estimated_min as number) ?? amount,
    estimated_max: (pco.estimated_max as number) ?? amount,
    status: (r.status as string) ?? 'identified',
    impacted_scope: (pco.impacted_scope as string) ?? (r.scope_of_change as string) ?? '',
    created_at: r.created_at,
  };
}

async function buildPcoPdf(r: Row, project: Row): Promise<Uint8Array> {
  const pco = rowToPco(r);
  const doc = await PDFDocument.create();
  const page = doc.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pname = (project.name as string) || '';
  const avg = ((Number(pco.estimated_min) || 0) + (Number(pco.estimated_max) || 0)) / 2;

  // Header
  page.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: DARK });
  draw(page, 'POTENTIAL CHANGE ORDER', 36, height - 24, 15, bold, GOLD);
  draw(page, 'SAGUARO CONSTRUCTION INTELLIGENCE', 36, height - 42, 8, reg, DOC.rule);
  draw(page, pco.pco_number != null ? `PCO #${pco.pco_number}` : '', width - 130, height - 24, 12, bold, GOLD);

  let y = height - 82;

  fieldBox(page, 'PROJECT:', pname, 36, y, 300, reg, bold);
  fieldBox(page, 'DATE:', fmtDate(pco.created_at) || fmtDate(new Date()), 350, y, 110, reg, bold);
  fieldBox(page, 'STATUS:', String(pco.status || 'identified').toUpperCase(), 464, y, 112, reg, bold);
  y -= 30;
  fieldBox(page, 'OWNER:', (project.owner_name as string) || (project.owner_entity as string) || '', 36, y, 250, reg, bold);
  fieldBox(page, 'CONTRACTOR:', (project.gc_name as string) || (project.gc_entity as string) || '', 300, y, 276, reg, bold);

  // Title
  y -= 42;
  draw(page, 'TITLE', 36, y, 9, bold, DARK);
  y -= 14;
  y = wrap(page, String(pco.title || 'Untitled Potential Change Order'), 36, y, bold, 11, 88, DARK);

  // Description
  y -= 8;
  if (pco.description) {
    draw(page, 'DESCRIPTION', 36, y, 9, bold, DARK);
    y -= 14;
    y = wrap(page, String(pco.description), 36, y, reg, 9, 95);
  }

  // Reason
  if (pco.reason) {
    y -= 6;
    draw(page, 'REASON', 36, y, 9, bold, DARK);
    y -= 14;
    y = wrap(page, String(pco.reason), 36, y, reg, 9, 95);
  }

  // Impacted scope
  if (pco.impacted_scope) {
    y -= 6;
    draw(page, 'IMPACTED SCOPE', 36, y, 9, bold, DARK);
    y -= 14;
    y = wrap(page, String(pco.impacted_scope), 36, y, reg, 9, 95);
  }

  // Estimate range
  y -= 16;
  page.drawRectangle({ x: 36, y: y - 44, width: width - 72, height: 46, color: LGRAY, borderColor: GOLD, borderWidth: 1 });
  draw(page, 'ROUGH ORDER-OF-MAGNITUDE ESTIMATE', 48, y - 12, 9, bold, DARK);
  draw(page, `Low:  ${fmtCurrency(pco.estimated_min)}`, 48, y - 30, 10, reg, DARK);
  draw(page, `High: ${fmtCurrency(pco.estimated_max)}`, 220, y - 30, 10, reg, DARK);
  draw(page, `Midpoint: ${fmtCurrency(avg)}`, 400, y - 30, 10, bold, DOC.accent);
  y -= 64;

  // Disclaimer
  draw(page, 'This is a non-binding Potential Change Order for budgeting and notification purposes only.', 36, y, 8, reg, GRAY);
  y -= 11;
  draw(page, 'Pricing is preliminary and subject to change upon conversion to a formal Change Order.', 36, y, 8, reg, GRAY);

  // Signature line
  y -= 50;
  if (y < 90) y = 90;
  draw(page, 'ACKNOWLEDGED', 36, y, 9, bold, DARK);
  y -= 30;
  [['CONTRACTOR', (project.gc_name as string) || (project.gc_entity as string) || ''],
   ['OWNER', (project.owner_name as string) || (project.owner_entity as string) || '']]
    .forEach(([role, name], i) => {
      const bx = 36 + i * 270;
      page.drawLine({ start: { x: bx, y }, end: { x: bx + 240, y }, color: DARK, thickness: 0.5 });
      draw(page, name, bx, y - 11, 8, bold, DARK);
      draw(page, role, bx, y - 21, 7, reg, GRAY);
      draw(page, 'Date: _______________', bx, y - 34, 7, reg, GRAY);
    });

  // Footer
  page.drawLine({ start: { x: 36, y: 36 }, end: { x: width - 36, y: 36 }, color: LGRAY, thickness: 0.5 });
  draw(page, `Generated by Saguaro Control Systems — ${new Date().toLocaleDateString()}  •  Potential Change Order`, 36, 22, 7, reg, GRAY);

  return await doc.save();
}

/** Best-effort upload to the (private) documents bucket; returns a signed URL or ''. */
async function uploadAndSign(projectId: string, pcoNum: unknown, bytes: Uint8Array): Promise<string> {
  try {
    const db = createServerClient();
    const path = `${projectId}/pco-${pcoNum || 'pco'}-${Date.now()}.pdf`;
    const { error: upErr } = await db.storage
      .from('documents')
      .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
    if (upErr) return '';
    const { data } = await db.storage.from('documents').createSignedUrl(path, 60 * 60 * 24 * 7);
    return data?.signedUrl || '';
  } catch {
    return '';
  }
}

async function loadPco(projectId: string, tenantId: string, id: string) {
  const db = createServerClient();
  const [{ data: row }, { data: project }] = await Promise.all([
    db.from('change_orders').select('*').eq('id', id).eq('tenant_id', tenantId).eq('project_id', projectId).single(),
    db.from('projects').select('*').eq('id', projectId).eq('tenant_id', tenantId).single(),
  ]);
  return { row: (row as Row) || null, project: (project as Row) || {} };
}

async function handle(req: NextRequest, projectId: string, id: string, wantsFile: boolean) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { row, project } = await loadPco(projectId, user.tenantId, id);
    if (!row) return NextResponse.json({ error: 'Potential change order not found' }, { status: 404 });

    const bytes = await buildPcoPdf(row, project);
    const pcoNum = ((row.line_items as Row)?.pco as Row)?.pco_number ?? row.co_number;

    if (wantsFile) {
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="pco-${pcoNum || id}.pdf"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const signedUrl = await uploadAndSign(projectId, pcoNum, bytes);
    const dataUrl = `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`;
    const url = signedUrl || dataUrl;

    try {
      await must(createServerClient()
        .from('change_orders')
        .update({ pdf_url: signedUrl || null, pdf_generated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', user.tenantId)
        .eq('project_id', projectId), 'change_orders write');
    } catch { /* non-fatal */ }

    return NextResponse.json({ success: true, url, download_url: url, data_url: dataUrl });
  } catch {
    return NextResponse.json({ error: 'PDF export failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await params;
  const g = await requirePermission(req, 'Change Orders', 'Edit', { projectId });
  if (!g.ok) return g.res;
  return handle(req, projectId, id, false);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await params;
  const wantsJson = req.nextUrl.searchParams.get('json') === '1';
  return handle(req, projectId, id, !wantsJson);
}
