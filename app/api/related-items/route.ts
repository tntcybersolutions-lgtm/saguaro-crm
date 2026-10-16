/**
 * Related Items — link any record on a job to any other (procore-parity-spec §1.5).
 *
 *   GET    /api/related-items?type=rfi&id=…           every link on that record, both directions,
 *                                                     each with the other record's number, title,
 *                                                     status and where it opens
 *   POST   /api/related-items  { from:{type,id}, to:{type,id} }
 *   DELETE /api/related-items?linkId=…                unlink (the records themselves are untouched)
 *
 * Both records must be this company's and on the same job; the person must be
 * able to see both kinds of record and edit at least one of them. The table's
 * guard trigger refuses a cross-company or cross-job pair even if a route
 * forgets to check.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { RELATED_TYPES, isRelatedType, orderPair, type RecordRef, type RelatedType } from '@/lib/related-items';
import { UUID_RE, canSee, linksOf, loadRelatedRecord, permsFor, resolveLinks, viewableTypes, type LinkRow } from '@/lib/related-items-server';

export const dynamic = 'force-dynamic';

function readRef(v: unknown): RecordRef | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as { type?: unknown; id?: unknown };
  if (!isRelatedType(o.type) || typeof o.id !== 'string' || !UUID_RE.test(o.id)) return null;
  return { type: o.type, id: o.id.toLowerCase() };
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const type = req.nextUrl.searchParams.get('type');
  const id = (req.nextUrl.searchParams.get('id') || '').toLowerCase();
  if (!isRelatedType(type)) return NextResponse.json({ error: 'type is required (rfi, submittal, drawing, …)' }, { status: 400 });
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const self: RecordRef = { type, id };
  const def = RELATED_TYPES[type];

  try {
    const db = createServerClient();
    const rec = await loadRelatedRecord(db, user.tenantId, self);
    if (!rec) return NextResponse.json({ error: `${def.noun} not found` }, { status: 404 });
    const projectId = (rec.project_id as string | null) ?? null;
    const perms = await permsFor(db, user, projectId);
    if (!canSee(perms, type)) return NextResponse.json({ error: `You don't have access to this ${def.noun.toLowerCase()}.` }, { status: 403 });

    const rows = await linksOf(db, user.tenantId, self);
    const items = await resolveLinks(db, user.tenantId, self, rows, new Set(viewableTypes(perms)), projectId);
    items.sort((x, y) => x.noun.localeCompare(y.noun) || x.number.localeCompare(y.number, undefined, { numeric: true }) || x.title.localeCompare(y.title));
    const canEdit = viewableTypes(perms).some((t) => canSee(perms, t, 'Edit'));
    return NextResponse.json({ items, canEdit, projectId });
  } catch (e) {
    return apiError('related-items GET', e, "Couldn't load the related items.");
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { from?: unknown; to?: unknown } | null;
  const from = readRef(body?.from);
  const to = readRef(body?.to);
  if (!from) return NextResponse.json({ error: 'from is required: { type, id } of the record you are on' }, { status: 400 });
  if (!to) return NextResponse.json({ error: 'to is required: { type, id } of the record to link' }, { status: 400 });
  if (from.type === to.type && from.id === to.id) return NextResponse.json({ error: "A record can't link to itself." }, { status: 400 });

  try {
    const db = createServerClient();
    const [recA, recB] = await Promise.all([loadRelatedRecord(db, user.tenantId, from), loadRelatedRecord(db, user.tenantId, to)]);
    // Another company's record is indistinguishable from one that does not exist.
    if (!recA) return NextResponse.json({ error: `${RELATED_TYPES[from.type].noun} not found` }, { status: 404 });
    if (!recB) return NextResponse.json({ error: `${RELATED_TYPES[to.type].noun} not found` }, { status: 404 });
    const pA = (recA.project_id as string | null) ?? null;
    const pB = (recB.project_id as string | null) ?? null;
    if (pA && pB && pA !== pB) return NextResponse.json({ error: 'Both records must be on the same job.' }, { status: 400 });
    const projectId = pA || pB;

    const perms = await permsFor(db, user, projectId);
    if (!canSee(perms, from.type) || !canSee(perms, to.type)) {
      return NextResponse.json({ error: 'You need access to both records to link them.' }, { status: 403 });
    }
    if (!canSee(perms, from.type, 'Edit') && !canSee(perms, to.type, 'Edit')) {
      return NextResponse.json({ error: 'You can view these records but not change them.' }, { status: 403 });
    }

    const [a, b] = orderPair(from, to);
    const { data, error } = await db.from('related_items' as never).insert({
      tenant_id: user.tenantId,
      project_id: projectId,
      a_type: a.type, a_id: a.id, b_type: b.type, b_id: b.id,
      link_context: null,
      created_by: user.id,
    } as never).select('*').single();
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === '23505') {
        const { data: existing } = await db.from('related_items' as never).select('*')
          .eq('tenant_id', user.tenantId).eq('a_type', a.type).eq('a_id', a.id).eq('b_type', b.type).eq('b_id', b.id).maybeSingle();
        return NextResponse.json({ error: 'Those two are already linked.', link: existing }, { status: 409 });
      }
      if (code === '23503') return NextResponse.json({ error: 'Record not found' }, { status: 404 });
      throw error;
    }
    return NextResponse.json({ link: data }, { status: 201 });
  } catch (e) {
    return apiError('related-items POST', e, "Couldn't link those records.");
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const linkId = (req.nextUrl.searchParams.get('linkId') || '').toLowerCase();
  if (!UUID_RE.test(linkId)) return NextResponse.json({ error: 'linkId is required' }, { status: 400 });

  try {
    const db = createServerClient();
    const { data: found, error: readErr } = await db.from('related_items' as never).select('*').eq('id', linkId).eq('tenant_id', user.tenantId).maybeSingle();
    if (readErr) throw readErr;
    const link = found as LinkRow | null;
    if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

    const perms = await permsFor(db, user, link.project_id);
    const [ta, tb] = [link.a_type as RelatedType, link.b_type as RelatedType];
    if (!canSee(perms, ta) || !canSee(perms, tb) || (!canSee(perms, ta, 'Edit') && !canSee(perms, tb, 'Edit'))) {
      return NextResponse.json({ error: "You can't change the links on these records." }, { status: 403 });
    }
    // A pin IS the link on the drawing: unlinking takes the pin off the sheet too.
    const ctx = link.link_context;
    const pinId = ctx && ctx.kind === 'pin' && typeof ctx.pin_id === 'string' ? ctx.pin_id : null;
    if (pinId) {
      if (!canSee(perms, 'drawing', 'Edit')) return NextResponse.json({ error: 'This link is a pin on a drawing. Ask someone who can edit drawings to remove it.' }, { status: 403 });
      const { error: pinErr } = await db.from('drawing_pins').delete().eq('id', pinId).eq('tenant_id', user.tenantId);
      if (pinErr) throw pinErr;
    }
    const { data, error } = await db.from('related_items' as never).delete().eq('id', linkId).eq('tenant_id', user.tenantId).select('id');
    if (error) throw error;
    if (!data || (data as unknown[]).length === 0) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    return NextResponse.json({ ok: true, removedPin: !!pinId });
  } catch (e) {
    return apiError('related-items DELETE', e, "Couldn't unlink those records.");
  }
}
