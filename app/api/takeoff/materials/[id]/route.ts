import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { ok, badRequest, notFound, serverError, unauthorized } from '@/lib/api-response';
import { must } from '@/lib/db-write';

/**
 * /api/takeoff/materials/[id] — inline line-item editing for the AI takeoff page.
 *
 *   POST   [id] = TAKEOFF id   → add one takeoff_materials row to that takeoff
 *   PATCH  [id] = MATERIAL id  → edit qty / unit / unit cost / description / notes
 *   DELETE [id] = MATERIAL id  → remove the row
 *
 * Every verb is tenant-scoped through the parent takeoffs row (service-role client
 * bypasses RLS, so the explicit tenant_id check is the IDOR guard), and every verb
 * recomputes the takeoff's stored totals SERVER-SIDE from the surviving rows:
 *
 *   material_cost = Σ total_cost          (each total_cost = quantity × unit_cost)
 *   labor_cost    = Σ labor_hours × $65   (same deterministic rate the analyze
 *                                          route and the page's loader fall back to)
 *   total_cost    = round((material + labor) × (1 + contingency_pct / 100))
 *
 * The recomputed totals ride back on every response so the client can confirm its
 * optimistic preview against the numbers actually persisted.
 */

const LABOR_RATE = 65; // $/hr — mirrors analyze route's computedLc fallback

type Supa = ReturnType<typeof createServerClient>;

/** Verify the takeoff belongs to this tenant. Returns the takeoff row or null. */
async function getScopedTakeoff(supabase: Supa, tenantId: string, takeoffId: string) {
  const { data } = await supabase
    .from('takeoffs')
    .select('id, tenant_id, contingency_pct')
    .eq('id', takeoffId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data || null;
}

/** Load a material row AND verify its parent takeoff belongs to this tenant. */
async function getScopedMaterial(supabase: Supa, tenantId: string, materialId: string) {
  const { data: material } = await supabase
    .from('takeoff_materials')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', materialId)
    .maybeSingle();
  if (!material) return null;
  const takeoff = await getScopedTakeoff(supabase, tenantId, material.takeoff_id);
  if (!takeoff) return null; // cross-tenant probe → indistinguishable from missing
  return { material, takeoff };
}

/** Recompute + persist the takeoff's totals from its current rows. */
/** Next sort_order at the end of the sheet. */
async function appendPosition(supabase: Supa, tenantId: string, takeoffId: string): Promise<number> {
  const { data: last } = await supabase
    .from('takeoff_materials')
    .select('sort_order')
    .eq('tenant_id', tenantId)
    .eq('takeoff_id', takeoffId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (Number(last?.sort_order) || 0) + 1;
}

async function recomputeTotals(supabase: Supa, tenantId: string, takeoffId: string, contingencyPctRaw: unknown) {
  const { data: rows, error } = await supabase
    .from('takeoff_materials')
    .select('total_cost, labor_hours')
    .eq('tenant_id', tenantId)
    .eq('takeoff_id', takeoffId);
  if (error) throw error;

  const materialCost = (rows || []).reduce((s, r) => s + (Number(r.total_cost) || 0), 0);
  const laborCost = (rows || []).reduce((s, r) => s + (Number(r.labor_hours) || 0) * LABOR_RATE, 0);
  const contingencyPct = Math.max(0, Math.min(50, Number(contingencyPctRaw) || 10));
  const totalCost = Math.round((materialCost + laborCost) * (1 + contingencyPct / 100));

  const { error: updErr } = await supabase
    .from('takeoffs')
    .update({ material_cost: materialCost, labor_cost: laborCost, total_cost: totalCost })
    .eq('tenant_id', tenantId)
    .eq('id', takeoffId);
  if (updErr) throw updErr;

  return { materialCost, laborCost, totalCost, contingencyPct, itemCount: (rows || []).length };
}

// ── POST — add a line ([id] = takeoff id) ─────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
    if (!user) return unauthorized();
    const supabase = createServerClient();
    const { id: takeoffId } = await params;

    const takeoff = await getScopedTakeoff(supabase, user.tenantId, takeoffId);
    if (!takeoff) return notFound('Takeoff not found');

    const body = await req.json().catch(() => ({}));
    const description = String(body.description || '').trim();
    const quantity = Number(body.quantity);
    const unitCost = Number(body.unitCost ?? body.unit_cost);
    const unit = String(body.unit || 'EA').trim().slice(0, 12) || 'EA';
    const csiCode = String(body.csiCode ?? body.csi_code ?? '00 00 00').trim().slice(0, 16);
    const csiName = String(body.csiName ?? body.csi_name ?? '').trim().slice(0, 120);
    const notes = String(body.notes || '').trim();
    const laborHours = Math.max(0, Number(body.laborHours ?? body.labor_hours) || 0);

    if (!description) return badRequest('Description is required');
    if (!Number.isFinite(quantity) || quantity <= 0) return badRequest('Quantity must be a number greater than 0');
    if (!Number.isFinite(unitCost) || unitCost <= 0) return badRequest('Unit cost must be a number greater than 0');

    /* sort_order — append, unless the caller named a row to land after.
       An estimator adding a missed line wants it beside its neighbours, not at
       the bottom of the sheet. sort_order is an integer, so there is no midpoint
       to slot into: everything at or after the target shifts up by one first.
       Two statements rather than one, but the alternative is a schema change to
       numeric on a live table. */
    const afterId = body.afterId ? String(body.afterId) : '';
    let sortOrder: number;
    // The anchor row was deleted between the client reading it and posting.
    // Appending is the right fallback — losing the line would be worse than
    // putting it at the bottom — but the client is told so it can say so.
    let afterMissing = false;

    if (afterId) {
      const { data: anchor } = await supabase
        .from('takeoff_materials')
        .select('sort_order')
        .eq('id', afterId)
        .eq('takeoff_id', takeoffId)
        .eq('tenant_id', user.tenantId)
        .maybeSingle();

      if (anchor) {
        const at = Number(anchor.sort_order) || 0;
        const { data: below } = await supabase
          .from('takeoff_materials')
          .select('id, sort_order')
          .eq('takeoff_id', takeoffId)
          .eq('tenant_id', user.tenantId)
          .gt('sort_order', at)
          .order('sort_order', { ascending: false });

        // Descending, so no two rows ever collide on the unique-ish ordering
        // while the shift is in flight.
        for (const r of below ?? []) {
          await must(supabase
            .from('takeoff_materials')
            .update({ sort_order: (Number(r.sort_order) || 0) + 1 })
            .eq('id', r.id)
            .eq('tenant_id', user.tenantId), 'takeoff_materials write');
        }
        sortOrder = at + 1;
      } else {
        afterMissing = true;
        sortOrder = await appendPosition(supabase, user.tenantId, takeoffId);
      }
    } else {
      sortOrder = await appendPosition(supabase, user.tenantId, takeoffId);
    }

    const row = {
      takeoff_id: takeoffId,
      tenant_id: user.tenantId,
      csi_code: csiCode,
      csi_name: csiName,
      description,
      quantity,
      unit,
      unit_cost: unitCost,
      total_cost: quantity * unitCost, // money math server-side, always Number
      labor_hours: laborHours,
      notes,
      sort_order: sortOrder,
    };

    const { data: inserted, error: insErr } = await supabase
      .from('takeoff_materials')
      .insert(row)
      .select('*')
      .single();
    if (insErr) throw insErr;

    const totals = await recomputeTotals(supabase, user.tenantId, takeoffId, takeoff.contingency_pct);
    return ok({ material: inserted, totals, afterMissing }, 201);
  } catch (err) {
    return serverError(err);
  }
}

// ── PATCH — edit a line ([id] = material id) ──────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
    if (!user) return unauthorized();
    const supabase = createServerClient();
    const { id } = await params;

    const scoped = await getScopedMaterial(supabase, user.tenantId, id);
    if (!scoped) return notFound('Line item not found');
    const { material, takeoff } = scoped;

    const body = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};

    if (body.description !== undefined) {
      const d = String(body.description || '').trim();
      if (!d) return badRequest('Description cannot be empty');
      patch.description = d;
    }
    if (body.unit !== undefined) {
      const u = String(body.unit || '').trim().slice(0, 12);
      if (!u) return badRequest('Unit cannot be empty');
      patch.unit = u;
    }
    if (body.notes !== undefined) {
      patch.notes = String(body.notes ?? '').trim();
    }
    if (body.quantity !== undefined) {
      const q = Number(body.quantity);
      if (!Number.isFinite(q) || q <= 0) return badRequest('Quantity must be a number greater than 0');
      patch.quantity = q;
    }
    const rawUnitCost = body.unitCost ?? body.unit_cost;
    if (rawUnitCost !== undefined) {
      const c = Number(rawUnitCost);
      if (!Number.isFinite(c) || c <= 0) return badRequest('Unit cost must be a number greater than 0');
      patch.unit_cost = c;
    }
    if (Object.keys(patch).length === 0) return badRequest('No editable fields in request');

    // Line total is NEVER client-supplied — recompute whenever qty or $/unit moves.
    if (patch.quantity !== undefined || patch.unit_cost !== undefined) {
      const q = patch.quantity !== undefined ? Number(patch.quantity) : Number(material.quantity) || 0;
      const c = patch.unit_cost !== undefined ? Number(patch.unit_cost) : Number(material.unit_cost) || 0;
      patch.total_cost = q * c;
    }

    const { data: updated, error: updErr } = await supabase
      .from('takeoff_materials')
      .update(patch)
      .eq('tenant_id', user.tenantId)
      .eq('id', id)
      .select('*')
      .single();
    if (updErr) throw updErr;

    const totals = await recomputeTotals(supabase, user.tenantId, material.takeoff_id, takeoff.contingency_pct);
    return ok({ material: updated, totals });
  } catch (err) {
    return serverError(err);
  }
}

// ── DELETE — remove a line ([id] = material id) ───────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
    if (!user) return unauthorized();
    const supabase = createServerClient();
    const { id } = await params;

    const scoped = await getScopedMaterial(supabase, user.tenantId, id);
    if (!scoped) return notFound('Line item not found');
    const { material, takeoff } = scoped;

    const { error: delErr } = await supabase
      .from('takeoff_materials')
      .delete()
      .eq('tenant_id', user.tenantId)
      .eq('id', id);
    if (delErr) throw delErr;

    const totals = await recomputeTotals(supabase, user.tenantId, material.takeoff_id, takeoff.contingency_pct);
    return ok({ deleted: id, totals });
  } catch (err) {
    return serverError(err);
  }
}
