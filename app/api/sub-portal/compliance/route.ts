import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { must } from '@/lib/db-write';
import { LOCAL_DAY_HEADER, plausibleToday } from '@/lib/calendar-day';
import { resolveTenantCompany } from '@/lib/tenant-company';
import { gcSenderName } from '@/lib/sub-inbox';
import {
  ASK_COOLDOWN_MS, DOC_LABEL, askMessage, cooldown, isRequiredDoc, subChecklist,
  type ComplianceRow, type RequiredDoc,
} from '@/lib/compliance-ask';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Db = ReturnType<typeof createServerClient>;

/** Each sub with an active portal link, the jobs it's on, and when each document was last asked for. */
async function roster(db: Db, tenantId: string, onlySub?: string) {
  let q = db.from('portal_sub_sessions').select('sub_id, project_id').eq('tenant_id', tenantId).eq('status', 'active').not('sub_id', 'is', null);
  if (onlySub) q = q.eq('sub_id', onlySub);
  const { data: sessions, error } = await q;
  if (error) throw error;
  const jobsBySub = new Map<string, Set<string>>();
  for (const s of (sessions || []) as Array<{ sub_id: string; project_id: string | null }>) {
    if (!jobsBySub.has(s.sub_id)) jobsBySub.set(s.sub_id, new Set());
    if (s.project_id) jobsBySub.get(s.sub_id)!.add(s.project_id);
  }
  const subIds = [...jobsBySub.keys()];
  if (!subIds.length) return { subIds, jobsBySub, subs: [], docs: [], projects: [], asks: [] };
  const since = new Date(Date.now() - 7 * ASK_COOLDOWN_MS).toISOString();
  const [subs, docs, projects, asks] = await Promise.all([
    db.from('subcontractors').select('id, company_name, contact_name').eq('tenant_id', tenantId).in('id', subIds),
    db.from('portal_sub_compliance_docs').select('sub_id, doc_type, expiry_date, status, file_url, created_at').eq('tenant_id', tenantId).in('sub_id', subIds),
    db.from('projects').select('id, name').eq('tenant_id', tenantId).in('id', [...new Set([...jobsBySub.values()].flatMap((s) => [...s]))]),
    db.from('portal_activity').select('metadata, created_at').eq('tenant_id', tenantId).eq('action', 'compliance_requested').gte('created_at', since),
  ]);
  for (const r of [subs, docs, projects, asks]) if (r.error) throw r.error;
  return {
    subIds, jobsBySub,
    subs: (subs.data || []) as Array<{ id: string; company_name: string | null; contact_name: string | null }>,
    docs: (docs.data || []) as Array<ComplianceRow & { sub_id: string }>,
    projects: (projects.data || []) as Array<{ id: string; name: string | null }>,
    asks: (asks.data || []) as Array<{ metadata: Record<string, unknown> | null; created_at: string }>,
  };
}

function lastAskedBySub(asks: Array<{ metadata: Record<string, unknown> | null; created_at: string }>) {
  const out = new Map<string, Partial<Record<RequiredDoc, string>>>();
  for (const a of asks) {
    const sub = typeof a.metadata?.sub_id === 'string' ? a.metadata.sub_id : null;
    const docs = Array.isArray(a.metadata?.docs) ? (a.metadata!.docs as unknown[]).filter(isRequiredDoc) : [];
    if (!sub) continue;
    const m = out.get(sub) || {};
    for (const d of docs) if (!m[d] || a.created_at > m[d]!) m[d] = a.created_at;
    out.set(sub, m);
  }
  return out;
}

/**
 * GET /api/sub-portal/compliance
 * Every sub on an active portal link, with the COI and W-9 checklist
 * (current / expiring / expired / missing) and when each was last asked for.
 * A document never uploaded has no row anywhere — this is where it shows.
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const today = plausibleToday(req.headers.get(LOCAL_DAY_HEADER));
    const r = await roster(db, user.tenantId);
    const subName = new Map(r.subs.map((s) => [s.id, s.company_name || s.contact_name || 'Subcontractor']));
    const projName = new Map(r.projects.map((p) => [p.id, p.name || 'Job']));
    const asked = lastAskedBySub(r.asks);
    const subs = r.subIds.map((id) => {
      const checks = subChecklist(r.docs.filter((d) => d.sub_id === id), today);
      return {
        subId: id,
        company: subName.get(id) || 'Subcontractor',
        jobs: [...(r.jobsBySub.get(id) || [])].map((pid) => ({ id: pid, name: projName.get(pid) || 'Job' })),
        checks,
        lastAsked: asked.get(id) || {},
        needs: checks.filter((c) => c.state !== 'current').length,
      };
    }).sort((a, b) => b.needs - a.needs || a.company.localeCompare(b.company));
    return NextResponse.json({ today, subs, counts: { subs: subs.length, needing: subs.filter((s) => s.needs > 0).length } });
  } catch (e) {
    return apiError('sub-portal/compliance', e, "Couldn't load your subs' compliance.");
  }
}

/**
 * POST /api/sub-portal/compliance  { subId, docs?: ('insurance'|'w9')[] }
 * "Ask for it": a message in the sub's portal, on each job they're on, naming
 * exactly what's missing or expiring and where to upload it. Without `docs`
 * it asks for everything that isn't current. One ask per document per day.
 */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = (await req.json().catch(() => null)) as { subId?: unknown; docs?: unknown } | null;
    const subId = typeof body?.subId === 'string' ? body.subId : '';
    if (!UUID.test(subId)) return NextResponse.json({ error: 'subId is required' }, { status: 400 });
    const wanted = Array.isArray(body?.docs) ? (body!.docs as unknown[]).filter(isRequiredDoc) : null;
    if (Array.isArray(body?.docs) && !wanted!.length) return NextResponse.json({ error: 'Pick which document to ask for.' }, { status: 400 });

    const db = createServerClient();
    const today = plausibleToday(req.headers.get(LOCAL_DAY_HEADER));
    const r = await roster(db, user.tenantId, subId);
    const sub = r.subs.find((s) => s.id === subId);
    if (!sub) return NextResponse.json({ error: 'That sub is not one of this company\'s subs.' }, { status: 404 });
    const jobs = [...(r.jobsBySub.get(subId) || [])];
    if (!jobs.length) return NextResponse.json({ error: 'This sub has no active portal link. Invite them to a job first.' }, { status: 409 });

    const checks = subChecklist(r.docs, today);
    const requested: RequiredDoc[] = wanted ?? checks.filter((c) => c.state !== 'current').map((c) => c.doc);
    if (!requested.length) return NextResponse.json({ error: 'Everything is current — nothing to ask for.' }, { status: 409 });
    const { ask, wait } = cooldown(requested, lastAskedBySub(r.asks).get(subId) || {});
    if (!ask.length) {
      const hrs = Math.max(1, Math.round((Date.now() - Date.parse(wait[0].askedAt)) / 3_600_000));
      return NextResponse.json({ error: `You asked for the ${DOC_LABEL[wait[0].doc]} ${hrs} hour${hrs === 1 ? '' : 's'} ago. Give them a day.`, wait }, { status: 429 });
    }

    const company = await resolveTenantCompany(db, user.tenantId, null).catch(() => ({ name: '' }));
    const content = askMessage(checks.filter((c) => ask.includes(c.doc)), company.name || null);
    const sender = await gcSenderName(db, user);
    for (const projectId of jobs) {
      await must(db.from('portal_sub_messages').insert({
        tenant_id: user.tenantId, project_id: projectId, sub_id: subId, sender_name: sender, sender_type: 'gc', content,
      }), 'portal_sub_messages insert');
      await must(db.from('portal_activity').insert({
        tenant_id: user.tenantId, project_id: projectId, action: 'compliance_requested',
        description: `${sender} asked ${sub.company_name || 'the sub'} for: ${ask.map((d) => DOC_LABEL[d]).join(', ')}`,
        metadata: { sub_id: subId, docs: ask, by: user.id },
      } as never), 'portal_activity insert');
    }
    return NextResponse.json({ asked: ask, jobs: jobs.length, skipped: wait, message: content }, { status: 201 });
  } catch (e) {
    return apiError('sub-portal/compliance', e, "Couldn't send the request. Please try again.");
  }
}

