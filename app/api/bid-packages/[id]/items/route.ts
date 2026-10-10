import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { apiError, apiFail } from '@/lib/api-error';
import { toCents, toDollars, extend } from '@/lib/calc';

/**
 * The bid form's lines — what every bidder prices.
 *
 *   POST   { code?, description, quantity?, unit? }            add a line at the end
 *   PATCH  { itemId, code?, description?, quantity?, unit? }   edit a line
 *   PATCH  { itemId, move: 'up' | 'down' }                     reorder
 *   DELETE ?itemId=…                                           remove a line
 *
 * Every call answers with the whole list in bid-form order, so the screen
 * shows exactly what the jacket will.
 *
 * Until this existed a package's lines were fixed the moment it was created:
 * one made without any could never get a bid form, and the jacket's "add items
 * to the package" pointed at nothing. sort_order is the order — all 180 live
 * rows had it at 0, so the bid form came out in whatever order the database
 * returned. Writes here keep it a clean 0..n.
 */

export const dynamic = 'force-dynamic';

type Db = ReturnType<typeof createServerClient>;
type Row = Record<string, any>;

const ORDERED = (db: Db, packageId: string, tenantId: string) =>
  db.from('bid_package_items').select('*')
    .eq('bid_package_id', packageId).eq('tenant_id', tenantId)
    .order('sort_order').order('created_at').order('id');

async function ownedPackage(db: Db, id: string, tenantId: string) {
  const { data, error } = await db.from('bid_packages').select('id').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
  if (error) throw error;
  return data;
}

async function list(db: Db, packageId: string, tenantId: string): Promise<Row[]> {
  const { data, error } = await ORDERED(db, packageId, tenantId);
  if (error) throw error;
  return (data || []) as Row[];
}

/** A GC has worked on this package; Sage's rebuild must leave it alone. */
async function stampEdited(db: Db, packageId: string, tenantId: string, userId: string) {
  await must(
    db.from('bid_packages')
      .update({ jacket_edits: { edited_at: new Date().toISOString(), edited_by: userId } } as never)
      .eq('id', packageId).eq('tenant_id', tenantId),
    'bid_packages edited stamp',
  );
}

/** Body → item columns. `partial` for an edit, where every field is optional. */
function itemFields(body: Row, partial: boolean): { fields: Row } | { bad: string } {
  const fields: Row = {};
  const has = (k: string) => body[k] !== undefined;
  if (has('description') || !partial) {
    const d = typeof body.description === 'string' ? body.description.trim() : '';
    if (!d) return { bad: 'description is required' };
    if (d.length > 2000) return { bad: 'description is too long' };
    fields.description = d;
  }
  if (has('code')) {
    if (body.code !== null && typeof body.code !== 'string') return { bad: 'code must be text' };
    fields.csi_code = (body.code || '').trim().slice(0, 40) || null;
  }
  if (has('unit')) {
    if (body.unit !== null && typeof body.unit !== 'string') return { bad: 'unit must be text' };
    fields.unit = (body.unit || '').trim().slice(0, 20) || null;
  }
  if (has('quantity')) {
    const q = body.quantity;
    if (q === null || q === '') fields.quantity = null;
    else {
      const n = typeof q === 'number' ? q : typeof q === 'string' ? Number(q.replace(/,/g, '')) : NaN;
      if (!Number.isFinite(n) || n < 0) return { bad: 'quantity must be a number' };
      fields.quantity = n;
    }
  }
  return { fields };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  const { id } = await params;
  try {
    const db = createServerClient();
    const body = await req.json().catch(() => ({}));
    if (!(await ownedPackage(db, id, user.tenantId))) return apiFail('Bid package not found', 404);
    const parsed = itemFields(body || {}, false);
    if ('bad' in parsed) return apiFail(parsed.bad, 400);

    const items = await list(db, id, user.tenantId);
    const next = items.reduce((m, i) => Math.max(m, Number(i.sort_order) || 0), -1) + 1;
    await must(
      db.from('bid_package_items').insert({
        tenant_id: user.tenantId,
        bid_package_id: id,
        sort_order: Math.max(next, items.length),
        ...parsed.fields,
      } as never),
      'bid_package_items insert',
    );
    await stampEdited(db, id, user.tenantId, user.id);
    return NextResponse.json({ success: true, items: await list(db, id, user.tenantId) });
  } catch (e) {
    return apiError('bid_package_items/add', e, "Couldn't add the line. Please try again.");
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  const { id } = await params;
  try {
    const db = createServerClient();
    const body = (await req.json().catch(() => ({}))) || {};
    const itemId = String(body.itemId || '').trim();
    if (!itemId) return apiFail('itemId is required', 400);
    if (!(await ownedPackage(db, id, user.tenantId))) return apiFail('Bid package not found', 404);

    const items = await list(db, id, user.tenantId);
    const at = items.findIndex((i) => String(i.id) === itemId);
    if (at < 0) return apiFail('Line not found', 404);

    if (body.move !== undefined) {
      if (body.move !== 'up' && body.move !== 'down') return apiFail("move must be 'up' or 'down'", 400);
      const to = body.move === 'up' ? at - 1 : at + 1;
      if (to >= 0 && to < items.length) {
        const order = items.slice();
        [order[at], order[to]] = [order[to], order[at]];
        /* Renumber 0..n — legacy rows all share 0, and a swap of two zeros
           would change nothing. Only rows whose number moves are written. */
        for (let i = 0; i < order.length; i++) {
          if (Number(order[i].sort_order) === i) continue;
          await must(
            db.from('bid_package_items').update({ sort_order: i } as never)
              .eq('id', order[i].id).eq('bid_package_id', id).eq('tenant_id', user.tenantId),
            'bid_package_items reorder',
          );
        }
        await stampEdited(db, id, user.tenantId, user.id);
      }
      return NextResponse.json({ success: true, items: await list(db, id, user.tenantId) });
    }

    const parsed = itemFields(body, true);
    if ('bad' in parsed) return apiFail(parsed.bad, 400);
    const fields = parsed.fields;
    if (Object.keys(fields).length === 0) return apiFail('Nothing to change.', 400);

    /* A line priced in the takeoff carries its estimate. If the quantity
       changes, the estimate follows, so Scope Value on the package stays true. */
    const row = items[at];
    if ('quantity' in fields && row.unit_price != null && fields.quantity != null) {
      fields.total_amount = toDollars(extend(Number(fields.quantity), toCents(Number(row.unit_price))));
    }

    await must(
      db.from('bid_package_items').update(fields as never)
        .eq('id', itemId).eq('bid_package_id', id).eq('tenant_id', user.tenantId),
      'bid_package_items update',
    );
    await stampEdited(db, id, user.tenantId, user.id);
    return NextResponse.json({ success: true, items: await list(db, id, user.tenantId) });
  } catch (e) {
    return apiError('bid_package_items/edit', e, "Couldn't save the line. Please try again.");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  const { id } = await params;
  try {
    const db = createServerClient();
    const itemId = new URL(req.url).searchParams.get('itemId');
    if (!itemId) return apiFail('itemId is required', 400);
    if (!(await ownedPackage(db, id, user.tenantId))) return apiFail('Bid package not found', 404);
    const items = await list(db, id, user.tenantId);
    if (!items.some((i) => String(i.id) === itemId)) return apiFail('Line not found', 404);
    await must(
      db.from('bid_package_items').delete()
        .eq('id', itemId).eq('bid_package_id', id).eq('tenant_id', user.tenantId),
      'bid_package_items delete',
    );
    await stampEdited(db, id, user.tenantId, user.id);
    return NextResponse.json({ success: true, items: await list(db, id, user.tenantId) });
  } catch (e) {
    return apiError('bid_package_items/delete', e, "Couldn't remove the line. Please try again.");
  }
}
