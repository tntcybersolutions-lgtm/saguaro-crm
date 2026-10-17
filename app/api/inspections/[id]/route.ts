import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

// Real columns on `inspections`. Only these get updated.
const REAL_COLUMNS = new Set([
  'project_id', 'inspection_type', 'inspector', 'result', 'notes', 'deficiencies',
  'inspected_at', 'agency', 'scheduled_date', 'checklist', 'checklist_total',
  'checklist_passed', 'deficiency_count', 'status', 'template_id', 'ahj_name',
  'permit_number', 'inspector_name', 'inspector_agency', 'items', 'deficiency_notes',
  're_inspection_date', 'signed_off_by', 'signed_off_at', 'weather', 'photos',
]);

// GET /api/inspections/[id] -> one inspection (tenant-scoped)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Role check, not just sign-in: Safety: View, the rule this tool's pages,
  // its writes and (where the table is gated) the database apply.
  const g = await requirePermission(req, 'Safety', 'View');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('inspections')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ inspection: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('inspections/id', e);
  }
}

// PATCH /api/inspections/[id] -> update one inspection (tenant-scoped)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const db = createServerClient();

    // Pull a value accepting BOTH camelCase and snake_case (and a few aliases).
    const pick = (...keys: string[]): unknown => {
      for (const k of keys) {
        if (body[k] !== undefined) return body[k];
      }
      return undefined;
    };

    const mapped: Record<string, unknown> = {
      result: pick('result'),
      status: pick('status'),
      notes: pick('notes'),
      signed_off_by: pick('signed_off_by', 'signedOffBy'),
      signed_off_at: pick('signed_off_at', 'signedOffAt'),
      re_inspection_date: pick('re_inspection_date', 'reInspectionDate'),
      inspection_type: pick('inspection_type', 'inspectionType', 'type'),
      inspector: pick('inspector'),
      inspector_name: pick('inspector_name', 'inspectorName'),
      inspector_agency: pick('inspector_agency', 'inspectorAgency'),
      agency: pick('agency', 'agencyName'),
      ahj_name: pick('ahj_name', 'ahjName'),
      permit_number: pick('permit_number', 'permitNumber'),
      scheduled_date: pick('scheduled_date', 'scheduledDate'),
      inspected_at: pick('inspected_at', 'inspectedAt'),
      deficiencies: pick('deficiencies'),
      deficiency_notes: pick('deficiency_notes', 'deficiencyNotes'),
      deficiency_count: pick('deficiency_count', 'deficiencyCount'),
      checklist: pick('checklist'),
      checklist_total: pick('checklist_total', 'checklistTotal'),
      checklist_passed: pick('checklist_passed', 'checklistPassed'),
      items: pick('items', 'results'),
      template_id: pick('template_id', 'templateId'),
      weather: pick('weather'),
      photos: pick('photos'),
    };

    const updateRow: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(mapped)) {
      if (!REAL_COLUMNS.has(k)) continue;
      if (v === undefined) continue;
      updateRow[k] = v;
    }

    const { data, error } = await db
      .from('inspections')
      // Row is built dynamically from an allow-list of real columns; cast to
      // satisfy the generated typed-update signature.
      .update(updateRow as never)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, inspection: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('inspections/id', e);
  }
}

// DELETE /api/inspections/[id] -> delete one inspection (tenant-scoped)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Safety', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { error } = await db
      .from('inspections')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('inspections/id', e);
  }
}
