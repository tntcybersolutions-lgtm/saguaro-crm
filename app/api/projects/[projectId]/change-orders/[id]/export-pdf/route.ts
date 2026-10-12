import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { PDFDocument, StandardFonts, PageSizes } from 'pdf-lib';
import { DOC } from '@/lib/document-templates/report-theme';
import { must } from '@/lib/db-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/projects/[projectId]/change-orders/[id]/export-pdf
 *
 * Generates a single Change Order PDF (one-page COR sheet) with pdf-lib,
 * mirroring lib/pdf-engine.ts. Uploads to the (private) `documents` bucket
 * via a best-effort signed URL and always returns a base64 data-URL fallback
 * so the client has a usable link even when storage is unavailable.
 *
 * Caller: app/field/change-orders/page.tsx → handleExportPdf('co')
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

async function buildCoPdf(co: Row, project: Row): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(PageSizes.Letter);
  const { width, height } = page.getSize();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const coNum = (co.co_number as number) ?? '';
  const pname = (project.name as string) || '';

  // Header
  page.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: DARK });
  draw(page, 'CHANGE ORDER', 36, height - 24, 16, bold, GOLD);
  draw(page, 'SAGUARO CONSTRUCTION INTELLIGENCE', 36, height - 42, 8, reg, DOC.rule);
  draw(page, coNum ? `CO #${coNum}` : '', width - 130, height - 24, 12, bold, GOLD);

  let y = height - 82;

  fieldBox(page, 'PROJECT:', pname, 36, y, 300, reg, bold);
  fieldBox(page, 'DATE:', fmtDate(co.created_at) || fmtDate(new Date()), 350, y, 110, reg, bold);
  fieldBox(page, 'STATUS:', String(co.status || 'pending').toUpperCase(), 464, y, 112, reg, bold);
  y -= 30;
  fieldBox(page, 'OWNER:', (project.owner_name as string) || (project.owner_entity as string) || '', 36, y, 250, reg, bold);
  fieldBox(page, 'CONTRACTOR:', (project.gc_name as string) || (project.gc_entity as string) || '', 300, y, 276, reg, bold);
  y -= 30;
  fieldBox(page, 'CONTRACT REFERENCE:', (co.contract_reference as string) || (project.project_number as string) || '', 36, y, 280, reg, bold);
  fieldBox(page, 'TYPE:', String(co.change_type || 'additive'), 330, y, 130, reg, bold);

  // Title
  y -= 40;
  draw(page, 'TITLE', 36, y, 9, bold, DARK);
  y -= 14;
  y = wrap(page, String(co.title || 'Untitled Change Order'), 36, y, bold, 11, 88, DARK);

  // Description
  y -= 8;
  if (co.description) {
    draw(page, 'DESCRIPTION OF CHANGE', 36, y, 9, bold, DARK);
    y -= 14;
    y = wrap(page, String(co.description), 36, y, reg, 9, 95);
  }

  // Reason / scope
  if (co.reason || co.scope_of_change) {
    y -= 6;
    draw(page, 'REASON / SCOPE', 36, y, 9, bold, DARK);
    y -= 14;
    y = wrap(page, String(co.reason || co.scope_of_change), 36, y, reg, 9, 95);
  }

  // Cost breakdown
  y -= 14;
  const rows: Array<[string, unknown]> = [
    ['Labor', co.labor_amount],
    ['Materials', co.materials_amount],
    ['Equipment', co.equipment_amount],
    ['Subtrade', co.subtrade_amount],
    ['Overhead', co.overhead_amount],
    ['Profit', co.profit_amount],
  ];
  const hasBreakdown = rows.some(([, v]) => Number(v) > 0);
  if (hasBreakdown) {
    draw(page, 'COST BREAKDOWN', 36, y, 9, bold, DARK);
    y -= 16;
    rows.forEach(([label, val]) => {
      if (Number(val) > 0) {
        draw(page, label, 44, y, 9, reg, DARK);
        draw(page, fmtCurrency(val), width - 160, y, 9, reg, DARK);
        y -= 14;
      }
    });
    y -= 4;
  }

  // Schedule impact
  const schedDays = (co.schedule_impact_days as number) ?? (co.schedule_impact as number) ?? 0;
  if (schedDays) {
    draw(page, `Schedule Impact: ${schedDays} day(s)`, 44, y, 9, reg, GRAY);
    y -= 16;
  }

  // Total highlight
  y -= 6;
  page.drawRectangle({ x: 36, y: y - 26, width: width - 72, height: 28, color: DARK });
  draw(page, 'CHANGE ORDER AMOUNT:', 48, y - 12, 11, bold, GOLD);
  draw(page, fmtCurrency(co.amount), width - 200, y - 12, 13, bold, GOLD);
  y -= 50;

  // Signature blocks
  if (y < 130) y = 130;
  draw(page, 'APPROVALS', 36, y, 9, bold, DARK);
  y -= 30;
  [['CONTRACTOR', (project.gc_name as string) || (project.gc_entity as string) || ''],
   ['OWNER', (project.owner_name as string) || (project.owner_entity as string) || ''],
   ['ARCHITECT', (project.architect as string) || (project.architect_name as string) || '']]
    .forEach(([role, name], i) => {
      const bx = 36 + i * 180;
      page.drawLine({ start: { x: bx, y }, end: { x: bx + 160, y }, color: DARK, thickness: 0.5 });
      draw(page, name, bx, y - 11, 8, bold, DARK);
      draw(page, role, bx, y - 21, 7, reg, GRAY);
      draw(page, 'Date: _______________', bx, y - 34, 7, reg, GRAY);
    });

  // Footer
  page.drawLine({ start: { x: 36, y: 36 }, end: { x: width - 36, y: 36 }, color: LGRAY, thickness: 0.5 });
  draw(page, `Generated by Saguaro Control Systems — ${new Date().toLocaleDateString()}  •  Change Order`, 36, 22, 7, reg, GRAY);

  return await doc.save();
}

/** Best-effort upload to the (private) documents bucket; returns a signed URL or ''. */
async function uploadAndSign(projectId: string, coNum: unknown, bytes: Uint8Array): Promise<string> {
  try {
    const db = createServerClient();
    const path = `${projectId}/change-order-${coNum || 'co'}-${Date.now()}.pdf`;
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

async function loadCo(projectId: string, tenantId: string, id: string) {
  const db = createServerClient();
  const [{ data: co }, { data: project }] = await Promise.all([
    db.from('change_orders').select('*').eq('id', id).eq('tenant_id', tenantId).eq('project_id', projectId).single(),
    db.from('projects').select('*').eq('id', projectId).eq('tenant_id', tenantId).single(),
  ]);
  return { co: (co as Row) || null, project: (project as Row) || {} };
}

async function handle(req: NextRequest, projectId: string, id: string, wantsFile: boolean) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { co, project } = await loadCo(projectId, user.tenantId, id);
    if (!co) return NextResponse.json({ error: 'Change order not found' }, { status: 404 });

    const bytes = await buildCoPdf(co, project);

    if (wantsFile) {
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="change-order-${co.co_number || id}.pdf"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const signedUrl = await uploadAndSign(projectId, co.co_number, bytes);
    const dataUrl = `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`;
    const url = signedUrl || dataUrl;

    // Best-effort: record that a PDF was generated.
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
  // GET defaults to streaming the raw PDF unless ?json=1 is passed.
  const wantsJson = req.nextUrl.searchParams.get('json') === '1';
  return handle(req, projectId, id, !wantsJson);
}
