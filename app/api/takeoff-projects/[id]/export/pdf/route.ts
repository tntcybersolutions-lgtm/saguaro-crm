import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { safeFilename, todayStamp, EXPORT_CONTENT_TYPE, type ReportColumn } from '@/lib/report-export';
import { generateExecReportPdf } from '@/lib/document-templates/exec-report-generator';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/takeoff-projects/[id]/export/pdf
 *
 * Exports a takeoff project's line-item estimate as a branded PDF.
 * Reads takeoff_projects (by id) + takeoff_line_items (by takeoff_project_id),
 * tenant-scoped, matching the sibling routes in this folder. Reuses the shared
 * PDF builder in lib/report-export.ts. Property access is defensive so it
 * tolerates both line-item column spellings present in the codebase
 * (csi_code/csi_division, unit_cost/unit_material_cost, extended_cost/total_cost).
 */

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return isNaN(n) ? 0 : n;
};
const str = (v: unknown): string => (v == null ? '' : String(v));

const COLUMNS: ReportColumn[] = [
  { key: 'csi', label: 'CSI Code', type: 'text' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'quantity', label: 'Qty', type: 'number' },
  { key: 'unit', label: 'Unit', type: 'text' },
  { key: 'unit_cost', label: 'Unit Cost', type: 'currency' },
  { key: 'material_cost', label: 'Material', type: 'currency' },
  { key: 'labor_cost', label: 'Labor', type: 'currency' },
  { key: 'total_cost', label: 'Total', type: 'currency' },
];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();

    const [projectRes, itemsRes] = await Promise.all([
      db
        .from('takeoff_projects')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', user.tenantId)
        .single(),
      db
        .from('takeoff_line_items')
        .select('*')
        .eq('takeoff_project_id', id)
        .eq('tenant_id', user.tenantId)
        .order('sort_order', { ascending: true }),
    ]);

    if (projectRes.error || !projectRes.data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const project = projectRes.data as Record<string, unknown>;
    const items = (itemsRes.data || []) as Record<string, unknown>[];

    const rows = items.map(it => {
      const unitCost = num(it.unit_cost ?? it.unit_material_cost);
      const materialCost = num(it.material_cost ?? it.total_material);
      const laborCost = num(it.labor_cost ?? it.total_labor);
      const totalCost = num(it.total_cost ?? it.extended_cost) ||
        materialCost + laborCost + num(it.equipment_cost ?? it.total_equipment) + num(it.total_sub);
      return {
        csi: str(it.csi_code ?? it.csi_division),
        description: str(it.description ?? it.csi_description),
        quantity: num(it.quantity),
        unit: str(it.unit),
        unit_cost: unitCost,
        material_cost: materialCost,
        labor_cost: laborCost,
        total_cost: totalCost,
      };
    });

    const totals = {
      material_cost: rows.reduce((s, r) => s + r.material_cost, 0) || num(project.material_cost),
      labor_cost: rows.reduce((s, r) => s + r.labor_cost, 0) || num(project.labor_cost),
      total_cost: rows.reduce((s, r) => s + r.total_cost, 0) || num(project.total_cost),
    };

    const title = `Takeoff Estimate — ${str(project.name) || 'Untitled'}`;
    // Corporate exec-style PDF: tenant letterhead + KPI band (money totals in
    // gold) + Page X of Y footers.
    const pdfBytes = await generateExecReportPdf({
      title,
      columns: COLUMNS,
      rows,
      totals,
      tenantId: user.tenantId,
      docLabel: 'Takeoff Estimate',
    });

    const fileName = `takeoff-${safeFilename(str(project.name) || id)}-${todayStamp()}.pdf`;
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': EXPORT_CONTENT_TYPE.pdf,
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (e) {
    return apiError('takeoff-projects/[id]/export/pdf GET', e, 'Export failed');
  }
}
