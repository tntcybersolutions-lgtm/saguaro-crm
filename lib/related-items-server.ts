/**
 * Server side of Related Items: load a record inside the caller's company,
 * decide which record types the caller may see on a job, and turn link rows
 * into the names, numbers, statuses and links a screen shows.
 *
 * Tables come from the RELATED_TYPES whitelist, never from the request.
 */
import { getEffectivePermissions, type PermissionMap } from '@/lib/permissions';
import { meetsLevel, type PermLevel } from '@/lib/permission-categories';
import type { createServerClient } from '@/lib/supabase-server';
import {
  RELATED_TYPES, RELATED_TYPE_KEYS, orderPair, relatedNumber, relatedTitle,
  type RelatedType, type RelatedRow, type RecordRef,
} from '@/lib/related-items';

type Db = ReturnType<typeof createServerClient>;
type Row = Record<string, unknown>;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One record of this company, or null (missing, soft-deleted, or another company's). */
export async function loadRelatedRecord(db: Db, tenantId: string, ref: RecordRef): Promise<Row | null> {
  const def = RELATED_TYPES[ref.type];
  let q = db.from(def.table as never).select('*').eq('id', ref.id).eq('tenant_id', tenantId);
  if (def.hasDeletedAt) q = q.is('deleted_at', null);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return (data as Row | null) ?? null;
}

export async function permsFor(db: Db, user: { id: string; tenantId: string }, projectId: string | null): Promise<PermissionMap> {
  return getEffectivePermissions(db, user.id, user.tenantId, projectId);
}

export function canSee(perms: PermissionMap, type: RelatedType, level: PermLevel = 'View'): boolean {
  return meetsLevel(perms[RELATED_TYPES[type].perm], level);
}

/** The record types this person may see on a job. */
export function viewableTypes(perms: PermissionMap): RelatedType[] {
  return RELATED_TYPE_KEYS.filter((t) => canSee(perms, t));
}

export type LinkRow = {
  id: string; tenant_id: string; project_id: string | null;
  a_type: RelatedType; a_id: string; b_type: RelatedType; b_id: string;
  link_context: Record<string, unknown> | null; created_at: string;
};

/** Every link touching one record, both directions. */
export async function linksOf(db: Db, tenantId: string, ref: RecordRef): Promise<LinkRow[]> {
  const [a, b] = await Promise.all([
    db.from('related_items' as never).select('*').eq('tenant_id', tenantId).eq('a_type', ref.type).eq('a_id', ref.id),
    db.from('related_items' as never).select('*').eq('tenant_id', tenantId).eq('b_type', ref.type).eq('b_id', ref.id),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  const seen = new Set<string>();
  return [...((a.data || []) as LinkRow[]), ...((b.data || []) as LinkRow[])].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

/**
 * A pin on a drawing that points at a record is a link with a location: write
 * (or re-point) the related_items row so the record shows "Pinned on A-101"
 * and the sheet lists the record. One pair, one row — a second pin of the same
 * record on the same sheet moves the link's location to the newest pin.
 */
export async function linkPin(
  db: Db,
  user: { id: string; tenantId: string },
  pin: { id: string; drawingId: string; projectId: string | null; type: RelatedType; recordId: string; x: number; y: number; page: number },
): Promise<void> {
  const [a, b] = orderPair({ type: 'drawing', id: pin.drawingId }, { type: pin.type, id: pin.recordId });
  const link_context = { kind: 'pin', pin_id: pin.id, sheet_id: pin.drawingId, x: pin.x, y: pin.y, page: pin.page };
  const { error } = await db.from('related_items' as never).insert({
    tenant_id: user.tenantId, project_id: pin.projectId,
    a_type: a.type, a_id: a.id, b_type: b.type, b_id: b.id,
    link_context, created_by: user.id,
  } as never);
  if (!error) return;
  if ((error as { code?: string }).code !== '23505') throw error;
  const { error: upErr } = await db.from('related_items' as never).update({ link_context } as never)
    .eq('tenant_id', user.tenantId).eq('a_type', a.type).eq('a_id', a.id).eq('b_type', b.type).eq('b_id', b.id);
  if (upErr) throw upErr;
}

/** Taking a pin off a sheet takes its link with it. */
export async function unlinkPin(db: Db, tenantId: string, pinId: string): Promise<void> {
  const { error } = await db.from('related_items' as never).delete().eq('tenant_id', tenantId).eq('link_context->>pin_id', pinId);
  if (error) throw error;
}

/**
 * The other side of each link, resolved to what a screen shows. Records the
 * person may not see, or that were deleted, are left out — a link never
 * leaks the name of something the viewer could not open.
 */
export async function resolveLinks(
  db: Db, tenantId: string, self: RecordRef, rows: LinkRow[], allowed: Set<RelatedType>, fallbackProjectId: string | null,
): Promise<RelatedRow[]> {
  const others = rows.map((r) => {
    const isA = r.a_type === self.type && r.a_id === self.id;
    return { link: r, type: (isA ? r.b_type : r.a_type) as RelatedType, id: isA ? r.b_id : r.a_id };
  }).filter((o) => allowed.has(o.type) && RELATED_TYPES[o.type]);

  const byType = new Map<RelatedType, string[]>();
  others.forEach((o) => byType.set(o.type, [...(byType.get(o.type) || []), o.id]));
  const found = new Map<string, Row>();
  await Promise.all(Array.from(byType.entries()).map(async ([t, ids]) => {
    const def = RELATED_TYPES[t];
    let q = db.from(def.table as never).select('*').eq('tenant_id', tenantId).in('id', ids);
    if (def.hasDeletedAt) q = q.is('deleted_at', null);
    const { data, error } = await q;
    if (error) throw error;
    ((data || []) as Row[]).forEach((row) => found.set(`${t}:${row.id}`, row));
  }));

  // Pinned links name the sheet they sit on: the drawing is either this record or the other one.
  const sheetIds = new Set<string>();
  others.forEach((o) => {
    const ctx = o.link.link_context;
    if (ctx && ctx.kind === 'pin' && typeof ctx.sheet_id === 'string') sheetIds.add(ctx.sheet_id);
  });
  const sheets = new Map<string, string>();
  if (sheetIds.size) {
    const { data, error } = await db.from('drawings').select('id, sheet_number, name').eq('tenant_id', tenantId).in('id', Array.from(sheetIds));
    if (error) throw error;
    ((data || []) as Row[]).forEach((d) => sheets.set(String(d.id), String(d.sheet_number || d.name || 'Drawing')));
  }

  return others.flatMap((o) => {
    const def = RELATED_TYPES[o.type];
    const row = found.get(`${o.type}:${o.id}`);
    if (!row) return [];
    const projectId = (row.project_id as string | null) ?? o.link.project_id ?? fallbackProjectId;
    const ctx = o.link.link_context;
    const pin = ctx && ctx.kind === 'pin' && typeof ctx.sheet_id === 'string'
      ? {
          drawingId: ctx.sheet_id,
          sheet: sheets.get(ctx.sheet_id) || 'Drawing',
          x: Number(ctx.x) || 0, y: Number(ctx.y) || 0, page: Number(ctx.page) || 1,
          pinId: typeof ctx.pin_id === 'string' ? ctx.pin_id : null,
        }
      : null;
    const base = def.href(projectId || '', o.id);
    const href = o.type === 'drawing' && pin?.pinId ? `${base}?pin=${pin.pinId}` : base;
    const out: RelatedRow = {
      linkId: o.link.id,
      type: o.type,
      id: o.id,
      noun: def.noun,
      number: relatedNumber(def, row),
      title: relatedTitle(def, row),
      status: def.statusKey ? ((row[def.statusKey] as string | null) ?? null) : null,
      statusModule: def.table,
      href,
      projectId,
      pin,
      createdAt: o.link.created_at,
    };
    return [out];
  });
}
