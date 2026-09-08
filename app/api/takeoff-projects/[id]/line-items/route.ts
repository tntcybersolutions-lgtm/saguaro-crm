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

    /* Mirror the alias map the POST applies, or nothing reads back.
     *
     * The write path translates the generic names the estimate screen uses
     * (`material_cost`, `labor_cost`, `equipment_cost`) into the real columns
     * (`total_material`, `total_labor`, `total_equipment`). This read returned
     * `select('*')` — the REAL names — so the screen looked for
     * `i.material_cost`, found undefined, and every total on it summed to zero.
     * The data was there the whole time; the translation only ran one way.
     *
     * Both names are returned rather than renamed, so anything already reading
     * the real column keeps working. */
    const lineItems = (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      unit_cost: r.unit_material_cost ?? null,
      material_cost: r.total_material ?? null,
      labor_cost: r.total_labor ?? null,
      equipment_cost: r.total_equipment ?? null,
      sub_cost: r.total_sub ?? null,
      /* What the line is worth in total. The screen had no column for this and
         was adding material and labour by hand, which silently dropped
         equipment and subcontract cost out of the sell price. */
      extended_cost:
        Number(r.total_material ?? 0) + Number(r.total_labor ?? 0) +
        Number(r.total_equipment ?? 0) + Number(r.total_sub ?? 0),
    }));

    return NextResponse.json({ lineItems });
  } catch (e) {
    /* A bare `catch {}` returning a flat 500 was hiding the reason entirely --
       the house pattern logs the real error server-side against a correlation
       id and returns a message safe to show. */
    return apiError('takeoff-projects/line-items', e);
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
      /* The writable cost columns. There was no path to labour, equipment or
         subcontract cost at all through this route — only material, via the
         `unit_cost` alias below. */
      'waste_factor_pct',
      'unit_material_cost', 'unit_labor_cost', 'unit_equipment_cost', 'unit_sub_cost',
    ];

    /* The totals are GENERATED columns, and writing them is why this route
     * returned 500 on every single insert it has ever handled.
     *
     *   total_material = quantity * (1 + waste_factor_pct/100) * unit_material_cost
     *
     * Postgres computes all four and refuses a value: "cannot insert a
     * non-DEFAULT value into column total_material". The old alias map pointed
     * material_cost/labor_cost/equipment_cost straight at them, so no line item
     * could ever be created — which is why takeoff_projects carries three rows
     * and not one line between them.
     *
     * Only unit costs are written now, and the database derives the rest. */
    const costAliasMap: Record<string, string> = {
      unit_cost: 'unit_material_cost',
    };

    /* Callers that send a line TOTAL rather than a unit rate — the estimate
     * screen sends material_cost as quantity x unit_cost — are converted back
     * to the unit rate the column actually holds, so an existing client keeps
     * working without being rewritten. Skipped when the caller already gave the
     * unit rate, and when there is no quantity to divide by. */
    const totalToUnit: Record<string, string> = {
      material_cost: 'unit_material_cost',
      labor_cost: 'unit_labor_cost',
      equipment_cost: 'unit_equipment_cost',
      sub_cost: 'unit_sub_cost',
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

    const qty = Number(body.quantity);
    const waste = Number(body.waste_factor_pct);
    const adjusted = Number.isFinite(qty) ? qty * (1 + (Number.isFinite(waste) ? waste : 0) / 100) : 0;
    for (const [alias, col] of Object.entries(totalToUnit)) {
      if (body[alias] === undefined || record[col] !== undefined) continue;
      const total = Number(body[alias]);
      if (!Number.isFinite(total) || adjusted <= 0) continue;
      record[col] = total / adjusted;
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
  } catch (e) {
    /* A bare `catch {}` returning a flat 500 was hiding the reason entirely --
       the house pattern logs the real error server-side against a correlation
       id and returns a message safe to show. */
    return apiError('takeoff-projects/line-items', e);
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
