import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * GET / PUT /api/takeoff/[id]/line-items
 *
 * The estimate grid's read and bulk-save endpoint, keyed on `takeoff_id`.
 *
 * There are two anchors on takeoff_line_items — takeoff_id (FK to `takeoffs`)
 * and takeoff_project_id (FK to `takeoff_projects`). Every line item in the
 * database uses the first, the estimate page loads through /api/takeoffs/latest,
 * and there are 39 takeoffs against 3 takeoff projects. The companion bulk route
 * under /api/takeoff-projects covers the other path; this is the one the grid
 * talks to, because it is where the data actually lives.
 */

const WRITABLE = [
  'csi_division', 'csi_code', 'csi_description', 'description', 'scope_notes',
  'page_reference', 'sheet_number', 'spec_section', 'quantity', 'unit',
  'waste_factor_pct', 'unit_material_cost', 'unit_labor_cost',
  'unit_equipment_cost', 'unit_sub_cost', 'category', 'is_allowance',
  'is_excluded', 'notes', 'sort_order', 'cost_key', 'manually_edited',
] as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('takeoff_line_items')
      .select('*')
      .eq('takeoff_id', id)
      .eq('tenant_id', user.tenantId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ lineItems: data || [] });
  } catch (e) {
    return apiError('takeoff_line_items_read', e);
  }
}

/**
 * Body: { rows: [{ id?, ...columns }], deleteIds?: string[] }
 *
 * Rows without an id are inserted, rows with one are updated, and every id is
 * scoped to this takeoff and the caller's tenant — an id from another takeoff
 * cannot be reached by putting it in the payload. The generated columns
 * (adjusted_quantity and the four totals) are never accepted from a client:
 * letting the grid set its own totals is how a spreadsheet ends up disagreeing
 * with the database it is showing.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const body = await req.json().catch(() => ({}));
    const rows: Record<string, unknown>[] = Array.isArray(body?.rows) ? body.rows : [];
    const deleteIds: string[] = Array.isArray(body?.deleteIds)
      ? body.deleteIds.filter((x: unknown): x is string => typeof x === 'string' && !!x)
      : [];

    if (rows.length === 0 && deleteIds.length === 0) {
      return NextResponse.json({ error: 'Nothing to save: send rows or deleteIds.' }, { status: 400 });
    }
    if (rows.length > 1000) {
      return NextResponse.json({ error: 'Too many rows in one save (limit 1000).' }, { status: 400 });
    }

    const db = createServerClient();

    /* The takeoff has to exist inside this tenant before anything is written
       against its id — otherwise a caller could seed rows onto a takeoff that
       is not theirs by inventing the path segment. */
    const { data: takeoff, error: tErr } = await db
      .from('takeoffs').select('id, project_id')
      .eq('id', id).eq('tenant_id', user.tenantId).maybeSingle();
    if (tErr) throw tErr;
    if (!takeoff) return NextResponse.json({ error: 'Takeoff not found' }, { status: 404 });

    const clean = (r: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const k of WRITABLE) if (r[k] !== undefined) out[k] = r[k];
      return out;
    };

    let inserted = 0, updated = 0, deleted = 0;

    if (deleteIds.length) {
      const { error } = await db.from('takeoff_line_items').delete()
        .in('id', deleteIds).eq('takeoff_id', id).eq('tenant_id', user.tenantId);
      if (error) throw error;
      deleted = deleteIds.length;
    }

    const toInsert = rows.filter((r) => !r.id);
    const toUpdate = rows.filter((r) => typeof r.id === 'string' && r.id);

    if (toInsert.length) {
      const records = toInsert.map((r, i) => ({
        ...clean(r),
        description: String(r.description ?? '').trim() || 'Untitled line',
        takeoff_id: id,
        project_id: (takeoff as { project_id?: string }).project_id ?? null,
        tenant_id: user.tenantId,
        sort_order: r.sort_order === undefined ? i : r.sort_order,
        manually_edited: true,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await db.from('takeoff_line_items').insert(records as any);
      if (error) throw error;
      inserted = records.length;
    }

    for (const r of toUpdate) {
      const patch = clean(r);
      if (Object.keys(patch).length === 0) continue;
      patch.manually_edited = true;
      patch.updated_at = new Date().toISOString();
      const { error } = await db.from('takeoff_line_items')
        .update(patch)
        .eq('id', r.id as string).eq('takeoff_id', id).eq('tenant_id', user.tenantId);
      if (error) throw error;
      updated++;
    }

    /* Hand back server truth, generated totals included, so the grid adopts it
       rather than trusting its own optimistic copy. */
    const { data, error: readErr } = await db.from('takeoff_line_items')
      .select('*')
      .eq('takeoff_id', id).eq('tenant_id', user.tenantId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (readErr) throw readErr;

    return NextResponse.json({ lineItems: data || [], inserted, updated, deleted });
  } catch (e) {
    return apiError('takeoff_line_items_bulk', e);
  }
}
