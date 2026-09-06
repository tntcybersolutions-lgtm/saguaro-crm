import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sheetId = searchParams.get('sheet_id');

  try {
    const db = createServerClient();
    let query = db
      .from('takeoff_line_items')
      // Links to the takeoff project via `takeoff_project_id` (added by migration
      // 2026-07-28_takeoff_line_items_project_link) — matches the POST insert.
      .select('*')
      .eq('takeoff_project_id', id)
      .eq('tenant_id', user.tenantId)
      .order('sort_order', { ascending: true });

    // sheet_id has no dedicated column — it is stored inside the metadata jsonb (see POST).
    if (sheetId) query = query.eq('metadata->>sheet_id', sheetId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ lineItems: data || [] });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const body = await req.json();
    const { description } = body;

    if (!description) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 });
    }

    // Fields that map directly to real columns on takeoff_line_items
    const directFields = [
      'csi_code', 'csi_division', 'csi_description', 'category',
      'quantity', 'unit', 'notes', 'sort_order',
    ];
    // Generic cost aliases -> real column names (per codebase export-route convention:
    // unit_cost==unit_material_cost, material_cost==total_material, etc.)
    const costAliasMap: Record<string, string> = {
      unit_cost: 'unit_material_cost',
      material_cost: 'total_material',
      labor_cost: 'total_labor',
      equipment_cost: 'total_equipment',
    };
    const record: Record<string, any> = {
      description,
      // This is the takeoff_projects id — it must go in takeoff_project_id, NOT takeoff_id
      // (takeoff_id is a FK to the `takeoffs` table and would FK-violate). Requires the
      // takeoff_project_id column added by migration 2026-07-28_takeoff_line_items_project_link.
      takeoff_project_id: id,
      tenant_id: user.tenantId,
    };
    for (const k of directFields) {
      if (body[k] !== undefined) record[k] = body[k];
    }
    for (const [alias, col] of Object.entries(costAliasMap)) {
      if (body[alias] !== undefined) record[col] = body[alias];
    }

    // Fields with no dedicated column are folded into the metadata jsonb.
    const metaFields = [
      'sheet_id', 'assembly_id', 'cost_code_id', 'measurement_type', 'markup_pct',
    ];
    const metadata: Record<string, any> = {};
    for (const k of metaFields) {
      if (body[k] !== undefined) metadata[k] = body[k];
    }
    if (Object.keys(metadata).length > 0) record.metadata = metadata;

    const db = createServerClient();
    const { data, error } = await db
      .from('takeoff_line_items')
      .insert(record as Database['public']['Tables']['takeoff_line_items']['Insert'])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ lineItem: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/takeoff-projects/[id]/line-items
 *
 * Bulk save for the estimate grid: inserts, updates and deletes in one request.
 *
 * The per-row POST and PATCH above are right for a form. They are wrong for a
 * spreadsheet — pasting fifty rows from Excel would be fifty round trips, each
 * able to fail independently and leave the grid disagreeing with the database.
 * This takes the whole edit at once.
 *
 * Body: { rows: [{ id?, ...columns }], deleteIds?: string[] }
 *   rows without an id are inserted, rows with one are updated, and everything
 *   is scoped to this takeoff project and the caller's tenant, so an id from
 *   another project cannot be reached by putting it in the payload.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const body = await req.json().catch(() => ({}));
    const rows: Record<string, unknown>[] = Array.isArray(body?.rows) ? body.rows : [];
    const deleteIds: string[] = Array.isArray(body?.deleteIds)
      ? body.deleteIds.filter((x: unknown) => typeof x === 'string' && x)
      : [];

    if (rows.length === 0 && deleteIds.length === 0) {
      return NextResponse.json({ error: 'Nothing to save: send rows or deleteIds.' }, { status: 400 });
    }
    /* A runaway paste should be rejected, not half-applied. */
    if (rows.length > 1000) {
      return NextResponse.json({ error: 'Too many rows in one save (limit 1000).' }, { status: 400 });
    }

    /* Only real, writable columns. adjusted_quantity and the four totals are
       GENERATED — sending them is an error, and letting a client set them would
       let the grid disagree with its own arithmetic. */
    const WRITABLE = [
      'csi_division', 'csi_code', 'csi_description', 'description', 'scope_notes',
      'page_reference', 'sheet_number', 'spec_section', 'quantity', 'unit',
      'waste_factor_pct', 'unit_material_cost', 'unit_labor_cost',
      'unit_equipment_cost', 'unit_sub_cost', 'category', 'is_allowance',
      'is_excluded', 'notes', 'sort_order', 'cost_key', 'manually_edited',
    ];

    const clean = (r: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const k of WRITABLE) if (r[k] !== undefined) out[k] = r[k];
      return out;
    };

    const db = createServerClient();
    let inserted = 0, updated = 0, deleted = 0;

    if (deleteIds.length) {
      const { error } = await db.from('takeoff_line_items').delete()
        .in('id', deleteIds)
        .eq('takeoff_project_id', id)
        .eq('tenant_id', user.tenantId);
      if (error) throw error;
      deleted = deleteIds.length;
    }

    const toInsert = rows.filter((r) => !r.id);
    const toUpdate = rows.filter((r) => typeof r.id === 'string' && r.id);

    if (toInsert.length) {
      const records = toInsert.map((r, i) => ({
        ...clean(r),
        description: String(r.description ?? '').trim() || 'Untitled line',
        takeoff_project_id: id,
        tenant_id: user.tenantId,
        sort_order: r.sort_order === undefined ? i : r.sort_order,
      }));
      const { error } = await db.from('takeoff_line_items')
        .insert(records as Database['public']['Tables']['takeoff_line_items']['Insert'][]);
      if (error) throw error;
      inserted = records.length;
    }

    for (const r of toUpdate) {
      const patch = clean(r);
      if (Object.keys(patch).length === 0) continue;
      patch.updated_at = new Date().toISOString();
      const { error } = await db.from('takeoff_line_items')
        .update(patch)
        .eq('id', r.id as string)
        .eq('takeoff_project_id', id)
        .eq('tenant_id', user.tenantId);
      if (error) throw error;
      updated++;
    }

    /* Return the refreshed set so the grid adopts server truth — including the
       generated totals — instead of trusting its own optimistic copy. */
    const { data, error: readErr } = await db.from('takeoff_line_items')
      .select('*')
      .eq('takeoff_project_id', id)
      .eq('tenant_id', user.tenantId)
      .order('sort_order', { ascending: true });
    if (readErr) throw readErr;

    return NextResponse.json({ lineItems: data || [], inserted, updated, deleted });
  } catch (e) {
    return apiError('takeoff_line_items_bulk', e);
  }
}
