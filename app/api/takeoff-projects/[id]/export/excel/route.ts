import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { buildXlsx, safeFilename, todayStamp, EXPORT_CONTENT_TYPE, type ReportColumn } from '@/lib/report-export';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/takeoff-projects/[id]/export/excel
 *
 * Exports a takeoff project's line-item estimate as an .xlsx workbook.
 * Reads takeoff_projects (by id) + takeoff_line_items (by takeoff_project_id),
 * tenant-scoped, matching the sibling routes in this folder. Reuses the shared
 * XLSX builder in lib/report-export.ts (same engine as the report export).
 * Property access is defensive across the two line-item column spellings used
 * in the codebase (csi_code/csi_division, unit_cost/unit_material_cost, etc.).
 */

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return isNaN(n) ? 0 : n;
};
const str = (v: unknown): string => (v == null ? '' : String(v));

const COLUMNS: ReportColumn[] = [
  { key: 'csi', label: 'CSI Code', type: 'text' },
  { key: 'division', label: 'Division', type: 'text' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'quantity', label: 'Qty', type: 'number' },
  { key: 'unit', label: 'Unit', type: 'text' },
  { key: 'unit_cost', label: 'Unit Cost', type: 'currency' },
  { key: 'material_cost', label: 'Material Cost', type: 'currency' },
  { key: 'labor_cost', label: 'Labor Cost', type: 'currency' },
  { key: 'equipment_cost', label: 'Equipment Cost', type: 'currency' },
  { key: 'total_cost', label: 'Total Cost', type: 'currency' },
  { key: 'notes', label: 'Notes', type: 'text' },
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
      const csi = str(it.csi_code ?? it.csi_division);
      const materialCost = num(it.material_cost ?? it.total_material);
      const laborCost = num(it.labor_cost ?? it.total_labor);
      const equipmentCost = num(it.equipment_cost ?? it.total_equipment);
      const totalCost = num(it.total_cost ?? it.extended_cost) ||
        materialCost + laborCost + equipmentCost + num(it.total_sub);
      return {
        csi,
        division: str(it.division ?? it.csi_division) || (csi ? csi.slice(0, 2) : ''),
        description: str(it.description ?? it.csi_description),
        quantity: num(it.quantity),
        unit: str(it.unit),
        unit_cost: num(it.unit_cost ?? it.unit_material_cost),
        material_cost: materialCost,
        labor_cost: laborCost,
        equipment_cost: equipmentCost,
        total_cost: totalCost,
        notes: str(it.notes ?? it.scope_notes),
      };
    });

    const totals = {
      material_cost: rows.reduce((s, r) => s + r.material_cost, 0) || num(project.material_cost),
      labor_cost: rows.reduce((s, r) => s + r.labor_cost, 0) || num(project.labor_cost),
      equipment_cost: rows.reduce((s, r) => s + r.equipment_cost, 0) || num(project.equipment_cost),
      total_cost: rows.reduce((s, r) => s + r.total_cost, 0) || num(project.total_cost),
    };

    const title = `Takeoff Estimate — ${str(project.name) || 'Untitled'}`;
    const xlsxBuffer = buildXlsx(COLUMNS, rows, title, totals);

    const fileName = `takeoff-${safeFilename(str(project.name) || id)}-${todayStamp()}.xlsx`;
    return new NextResponse(xlsxBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': EXPORT_CONTENT_TYPE.xlsx,
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (e) {
    return apiError('takeoff-projects/[id]/export/excel GET', e, 'Export failed');
  }
}
