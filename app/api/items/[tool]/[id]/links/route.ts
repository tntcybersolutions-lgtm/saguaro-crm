/**
 * Related items — link an RFI to a submittal, a punch item to an RFI, and so on.
 *   GET    /api/items/:tool/:id/links            both directions, each with the other item's name
 *   POST   /api/items/:tool/:id/links  { toType, toId, note? }
 *   DELETE /api/items/:tool/:id/links?linkId=…   unlink (the items themselves are untouched)
 */
import { NextRequest, NextResponse } from 'next/server';
import { loadItem } from '@/lib/items/server';
import { itemTool, itemName, statusLabel } from '@/lib/items/registry';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ tool: string; id: string }> };
type Link = { id: string; from_type: string; from_id: string; to_type: string; to_id: string; note: string | null; created_at: string };

export async function GET(req: NextRequest, { params }: P) {
  const { tool: type, id } = await params;
  const l = await loadItem(req, type, id, 'View');
  if (!l.ok) return l.res;
  try {
    const [a, b] = await Promise.all([
      l.db.from('item_links' as never).select('*').eq('tenant_id', l.user.tenantId).eq('from_type', l.tool.table).eq('from_id', id),
      l.db.from('item_links' as never).select('*').eq('tenant_id', l.user.tenantId).eq('to_type', l.tool.table).eq('to_id', id),
    ]);
    if (a.error) throw a.error;
    if (b.error) throw b.error;
    const rows = [...((a.data || []) as Link[]), ...((b.data || []) as Link[])];
    // The other side of each link, grouped by type → one read per type.
    const others = rows.map((r) => (r.from_type === l.tool.table && r.from_id === id ? { link: r, type: r.to_type, oid: r.to_id } : { link: r, type: r.from_type, oid: r.from_id }));
    const byType = new Map<string, string[]>();
    others.forEach((o) => byType.set(o.type, [...(byType.get(o.type) || []), o.oid]));
    const found = new Map<string, Record<string, unknown>>();
    await Promise.all(Array.from(byType.entries()).map(async ([t, ids]) => {
      const tool = itemTool(t);
      if (!tool) return;
      const { data } = await l.db.from(tool.table as never).select('*').eq('tenant_id', l.user.tenantId).in('id', ids);
      ((data || []) as Record<string, unknown>[]).forEach((row) => found.set(`${t}:${row.id}`, row));
    }));
    const links = others
      .map((o) => {
        const tool = itemTool(o.type);
        const row = found.get(`${o.type}:${o.oid}`);
        if (!tool || !row || (tool.hasDeletedAt && row.deleted_at)) return null;
        return {
          linkId: o.link.id, type: o.type, id: o.oid, noun: tool.noun, name: itemName(tool, row),
          status: statusLabel(row[tool.statusKey] as string), projectId: row.project_id, note: o.link.note,
        };
      })
      .filter(Boolean);
    return NextResponse.json({ links });
  } catch (e) {
    return apiError(`items/${type}/links`, e, "Couldn't load related items.");
  }
}

export async function POST(req: NextRequest, { params }: P) {
  const { tool: type, id } = await params;
  const l = await loadItem(req, type, id, 'Edit');
  if (!l.ok) return l.res;
  try {
    const body = (await req.json().catch(() => ({}))) as { toType?: string; toId?: string; note?: string };
    const target = itemTool(body.toType);
    if (!target || !body.toId) return NextResponse.json({ error: 'Pick the item to link.' }, { status: 400 });
    if (target.table === l.tool.table && body.toId === id) return NextResponse.json({ error: "An item can't link to itself." }, { status: 400 });
    let q = l.db.from(target.table as never).select('id, project_id').eq('id', body.toId).eq('tenant_id', l.user.tenantId);
    if (target.hasDeletedAt) q = q.is('deleted_at', null);
    const { data: other } = await q.maybeSingle();
    if (!other) return NextResponse.json({ error: `${target.noun} not found` }, { status: 404 });
    const { data, error } = await l.db.from('item_links' as never).insert({
      tenant_id: l.user.tenantId,
      project_id: (l.item.project_id as string) || null,
      from_type: l.tool.table, from_id: id,
      to_type: target.table, to_id: body.toId,
      note: body.note ? String(body.note).slice(0, 500) : null,
      created_by: l.user.id,
    } as never).select('*').single();
    if (error) {
      if ((error as { code?: string }).code === '23505') return NextResponse.json({ error: 'Those two are already linked.' }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ link: data }, { status: 201 });
  } catch (e) {
    return apiError(`items/${type}/links`, e, "Couldn't link those items.");
  }
}

export async function DELETE(req: NextRequest, { params }: P) {
  const { tool: type, id } = await params;
  const l = await loadItem(req, type, id, 'Edit');
  if (!l.ok) return l.res;
  const linkId = req.nextUrl.searchParams.get('linkId');
  if (!linkId) return NextResponse.json({ error: 'linkId is required' }, { status: 400 });
  try {
    const { data, error } = await l.db.from('item_links' as never).delete()
      .eq('id', linkId).eq('tenant_id', l.user.tenantId)
      .or(`and(from_type.eq.${l.tool.table},from_id.eq.${id}),and(to_type.eq.${l.tool.table},to_id.eq.${id})`)
      .select('id');
    if (error) throw error;
    if (!data || (data as unknown[]).length === 0) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(`items/${type}/links`, e, "Couldn't unlink those items.");
  }
}
