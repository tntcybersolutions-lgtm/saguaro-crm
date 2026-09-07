import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { priceOptions, optionCost, type SelectionOption, type SelectionRow } from '@/lib/selections';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

/**
 * GET / POST / DELETE  /api/selections/[id]/options
 *
 * The priced choices presented for one selection — three tiles of tile, each
 * with a photo, a spec sheet and a price.
 *
 * `selection_options` existed with a full set of columns for exactly this and
 * was read by no code anywhere, because it could only hang off
 * `selection_categories`, a table with no rows and no readers either. The
 * migration alongside this lets an option hang off a live `selections` row, so
 * the dormant model and the working one are the same model.
 *
 * Options carry no tenant_id — they are scoped through the parent selection, so
 * every request here loads that first and checks the tenant on it.
 */
async function parent(db: SupabaseClient<Database>, id: string, tenantId: string) {
  return db.from('selections').select('*').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const { db, user } = g;

  const { data: sel, error: sErr } = await parent(db, id, user.tenantId);
  if (sErr) return apiError('selections/options', sErr, 'Failed to load the selection');
  if (!sel) return NextResponse.json({ error: 'Selection not found' }, { status: 404 });

  const { data, error } = await db
    .from('selection_options').select('*')
    .eq('selection_id', id)
    .order('sort_order', { ascending: true });
  if (error) return apiError('selections/options', error, 'Failed to load the options');

  return NextResponse.json({
    options: priceOptions(sel as SelectionRow, (data ?? []) as SelectionOption[]),
    allowance: Number(sel.allowance) || 0,
  });
}

/** POST — add one option to this selection. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const { db, user } = g;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const { data: sel, error: sErr } = await parent(db, id, user.tenantId);
  if (sErr) return apiError('selections/options', sErr, 'Failed to load the selection');
  if (!sel) return NextResponse.json({ error: 'Selection not found' }, { status: 404 });

  const n = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };

  const draft: SelectionOption = {
    name,
    description: body.description ? String(body.description) : null,
    manufacturer: body.manufacturer ? String(body.manufacturer) : null,
    model_number: body.model_number ? String(body.model_number) : null,
    color: body.color ? String(body.color) : null,
    finish: body.finish ? String(body.finish) : null,
    unit_cost: n(body.unit_cost),
    quantity: n(body.quantity) ?? 1,
    image_url: body.image_url ? String(body.image_url) : null,
    spec_url: body.spec_url ? String(body.spec_url) : null,
    is_recommended: body.is_recommended === true,
    sort_order: n(body.sort_order) ?? 0,
  };

  /* SelectionOption is deliberately loose so the engine tolerates the strings
     Postgres returns for NUMERIC. The insert is not: every value is narrowed to
     the column's real type here. */
  const { data, error } = await db
    .from('selection_options')
    .insert({
      selection_id: id,
      name: draft.name as string,
      description: draft.description ?? null,
      manufacturer: draft.manufacturer ?? null,
      model_number: draft.model_number ?? null,
      color: draft.color ?? null,
      finish: draft.finish ?? null,
      unit_cost: draft.unit_cost as number | null,
      quantity: draft.quantity as number,
      image_url: draft.image_url ?? null,
      spec_url: draft.spec_url ?? null,
      is_recommended: draft.is_recommended === true,
      sort_order: draft.sort_order as number,
      /* total_cost is a plain column, not generated, so it is written from the
         same function that reads it. Letting the client send its own total is
         how a stored total ends up disagreeing with the price beside it. */
      total_cost: optionCost(draft),
    })
    .select().single();
  if (error) return apiError('selections/options', error, 'Failed to add the option');

  return NextResponse.json({ success: true, option: data });
}

/** DELETE ?optionId=… — remove one option from this selection. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const { db, user } = g;

  const optionId = new URL(req.url).searchParams.get('optionId');
  if (!optionId) return NextResponse.json({ error: 'optionId is required' }, { status: 400 });

  const { data: sel, error: sErr } = await parent(db, id, user.tenantId);
  if (sErr) return apiError('selections/options', sErr, 'Failed to load the selection');
  if (!sel) return NextResponse.json({ error: 'Selection not found' }, { status: 404 });

  /* Scoped to this selection as well as to the id: an option id belonging to
     another tenant's selection cannot be deleted by naming it here. */
  const { error } = await db
    .from('selection_options').delete()
    .eq('id', optionId).eq('selection_id', id);
  if (error) return apiError('selections/options', error, 'Failed to remove the option');

  return NextResponse.json({ success: true });
}
