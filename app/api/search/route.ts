import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { getEffectivePermissions } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import {
  allowedSearchTypes, asksNumberOf, isSearchType, orderGroups, padNum, parseQuery, rankHit, sortHits,
  trailingNumber, TYPE_LABEL, type ParsedQuery, type SearchGroup, type SearchHit, type SearchResponse, type SearchType,
} from '@/lib/search/core';

/**
 * GET /api/search?q=…[&types=rfi,drawing][&limit=5]
 *
 * Search everything a GC looks for — jobs, leads, customers, contacts, subs,
 * RFIs, submittals, change orders, punch items, daily logs, drawings, files,
 * photos, invoices, pay apps and people — in one call.
 *
 *  - Tenant: every query is `.eq('tenant_id', user.tenantId)`; tenant comes
 *    from getUser(), never the request.
 *  - Permission: a type is searched only when the caller has View on the
 *    category its own screens check (lib/search/core TYPE_PERMISSION). A
 *    Foreman (Budget: None, Pay Apps: None) gets no invoice or pay-app hits —
 *    the tables are not even queried.
 *  - Input: lib/search/core cleanQuery keeps letters, digits and & @ + . - / # :
 *    only, so nothing in `q` can rewrite the PostgREST filter or act as an ilike
 *    wildcard; filter values are also double-quoted.
 *  - Ranking: exact number ("RFI-005", "CO 3", "A-101") → name → prefix →
 *    contains (rankHit). Groups carry the full match count, not just the rows.
 *  - Speed: one round trip — every type runs in parallel, project names come
 *    from an embedded FK join. Server-Timing reports the database time.
 *
 * Documents in the legacy `documents` table carry no tenant_id, so they stay
 * out; job files live in project_files, which is tenant-scoped and searched.
 */
export const dynamic = 'force-dynamic';

type Row = Record<string, any>;
type Built = { number?: string | number | null; label: string; sub?: string; href: string; extra?: Array<string | null | undefined>; dedupe?: string };

interface Spec {
  type: SearchType;
  table: string;
  select: string;
  /** text columns matched with ilike */
  text: string[];
  /** integer record number (co_number, item_number, app_number) */
  intNumber?: string;
  /** text record number (rfi_number, invoice_number) — also listed in `text` */
  textNumber?: string;
  dateCol?: string;
  softDelete?: boolean;
  /** jsonb array column holding lowercase tags, matched exactly on one word */
  tagsJson?: string;
  scope?: (q: any) => any;
  build: (r: Row) => Built;
}

const PROJ = 'project:projects(id,name)';
const fmtDate = (d?: string | null) => {
  if (!d) return '';
  const dt = new Date(`${String(d).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};
const human = (s?: string | null) => (s ? String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '');
const join = (...xs: Array<string | null | undefined | false>) => xs.filter(Boolean).join(' · ');
const snippet = (s?: string | null, n = 80) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const SPECS: Spec[] = [
  {
    type: 'job', table: 'projects',
    select: 'id, name, project_number, status, city, state, address, created_at',
    text: ['name', 'project_number', 'address', 'city', 'owner_name'], textNumber: 'project_number', softDelete: true,
    scope: (q) => q.not('is_deleted', 'is', true),
    build: (r) => ({
      number: r.project_number, label: r.name || 'Job',
      sub: join(r.project_number && `Job ${r.project_number}`, human(r.status), [r.city, r.state].filter(Boolean).join(', ')),
      href: `/app/projects/${r.id}/overview`, extra: [r.address],
    }),
  },
  {
    type: 'lead', table: 'lead_pipeline',
    select: 'id, company_name, contact_name, email, stage, location, created_at',
    text: ['company_name', 'contact_name', 'email', 'location'],
    build: (r) => ({
      label: r.company_name || r.contact_name || 'Lead',
      sub: join(r.contact_name !== r.company_name && r.contact_name, human(r.stage), r.location),
      href: `/app/leads/${r.id}`, extra: [r.contact_name, r.email],
    }),
  },
  {
    type: 'customer', table: 'customer_profiles',
    select: 'id, name, email, phone, city, state, created_at',
    text: ['name', 'email', 'phone', 'city'],
    build: (r) => ({
      label: r.name || r.email || 'Customer',
      sub: join(r.email, [r.city, r.state].filter(Boolean).join(', ')),
      href: `/app/customers?customer=${r.id}`, extra: [r.email],
    }),
  },
  {
    type: 'contact', table: 'contacts',
    select: `id, name, role, company, email, phone, project_id, customer_id, created_at, ${PROJ}`,
    text: ['name', 'company', 'email', 'role'],
    build: (r) => ({
      label: r.name || r.email || 'Contact',
      sub: join(r.role, r.company),
      href: r.project_id ? `/app/projects/${r.project_id}/directory` : r.customer_id ? `/app/customers?customer=${r.customer_id}` : '/app/customers',
      extra: [r.company, r.email],
    }),
  },
  {
    type: 'sub', table: 'subcontractors',
    select: 'id, company_name, dba_name, contact_name, trade, status, city, state, created_at',
    text: ['company_name', 'dba_name', 'contact_name', 'trade', 'email', 'contact_email', 'city'],
    build: (r) => ({
      label: r.company_name || r.dba_name || 'Subcontractor',
      sub: join(r.trade, r.contact_name, String(r.status || '').toLowerCase() === 'inactive' && 'Inactive'),
      href: `/app/subs?open=${r.id}`, extra: [r.dba_name, r.contact_name, r.trade],
    }),
  },
  {
    type: 'rfi', table: 'rfis',
    select: `id, rfi_number, subject, status, due_date, project_id, created_at, ${PROJ}`,
    text: ['rfi_number', 'subject', 'question'], textNumber: 'rfi_number', softDelete: true,
    build: (r) => ({
      number: r.rfi_number, label: r.subject || 'RFI',
      sub: join(human(r.status), r.due_date && `Due ${fmtDate(r.due_date)}`),
      href: `/app/projects/${r.project_id}/rfis?open=${r.id}`,
    }),
  },
  {
    type: 'submittal', table: 'submittals',
    select: `id, submittal_number, title, status, spec_section, subcontractor, project_id, created_at, ${PROJ}`,
    text: ['submittal_number', 'title', 'spec_section', 'subcontractor', 'description'], textNumber: 'submittal_number', softDelete: true,
    build: (r) => ({
      number: r.submittal_number, label: r.title || 'Submittal',
      sub: join(human(r.status), r.spec_section, r.subcontractor),
      href: `/app/projects/${r.project_id}/submittals?open=${r.id}`, extra: [r.spec_section],
    }),
  },
  {
    type: 'change_order', table: 'change_orders',
    select: `id, co_number, pco_number, title, status, project_id, created_at, ${PROJ}`,
    text: ['title', 'description', 'pco_number'], intNumber: 'co_number', softDelete: true,
    build: (r) => ({
      number: r.co_number != null ? `CO-${padNum(r.co_number)}` : r.pco_number, label: r.title || 'Change order',
      sub: join(human(r.status), r.pco_number && `PCO ${r.pco_number}`),
      href: `/app/projects/${r.project_id}/change-orders?open=${r.id}`, extra: [r.pco_number],
    }),
  },
  {
    type: 'punch', table: 'punch_list',
    select: `id, item_number, title, status, location, trade, project_id, created_at, ${PROJ}`,
    text: ['title', 'location', 'trade', 'description', 'assigned_sub_company'], intNumber: 'item_number', softDelete: true,
    build: (r) => ({
      number: r.item_number != null ? `#${r.item_number}` : null, label: r.title || 'Punch item',
      sub: join(human(r.status), r.location, r.trade),
      href: `/app/projects/${r.project_id}/punch-list?open=${r.id}`,
    }),
  },
  {
    type: 'daily_log', table: 'daily_logs',
    select: `id, log_date, status, work_performed, superintendent, project_id, created_at, ${PROJ}`,
    text: ['work_performed', 'notes', 'superintendent', 'delays', 'phase_of_work'], dateCol: 'log_date', softDelete: true,
    build: (r) => ({
      label: `Daily log — ${fmtDate(r.log_date) || 'undated'}`,
      sub: join(snippet(r.work_performed) || human(r.status), r.superintendent),
      href: `/app/daily-logs/${r.id}`, extra: [r.work_performed],
    }),
  },
  {
    type: 'drawing', table: 'drawings',
    select: `id, sheet_number, name, discipline, version, project_id, created_at, ${PROJ}`,
    text: ['sheet_number', 'name', 'discipline'], textNumber: 'sheet_number', softDelete: true,
    build: (r) => ({
      number: r.sheet_number, label: r.name || r.sheet_number || 'Drawing',
      sub: join(r.discipline, r.version && `Rev ${r.version}`),
      href: `/app/projects/${r.project_id}/drawings/${r.id}`,
    }),
  },
  {
    type: 'file', table: 'project_files',
    select: `id, file_name, category, kind, folder, project_id, created_at, ${PROJ}`,
    text: ['file_name', 'category', 'folder'], softDelete: true,
    build: (r) => ({
      label: r.file_name || 'File',
      sub: join(human(r.category || r.kind), r.folder),
      href: r.project_id ? `/app/projects/${r.project_id}/files` : '/app/documents',
    }),
  },
  {
    type: 'photo', table: 'photos',
    select: `id, caption, title, filename, description, tags, project_id, created_at, ${PROJ}`,
    text: ['caption', 'title', 'filename', 'description', 'ai_description'], tagsJson: 'tags', softDelete: true,
    build: (r) => ({
      label: r.caption || r.title || r.description || r.filename || 'Photo',
      sub: join(Array.isArray(r.tags) && r.tags.length ? r.tags.map(String).join(', ') : '', fmtDate(r.created_at)),
      href: `/app/projects/${r.project_id}/photos`, extra: [r.filename, ...(Array.isArray(r.tags) ? r.tags.map(String) : [])],
    }),
  },
  {
    type: 'invoice', table: 'invoices',
    select: `id, invoice_number, vendor_name, description, status, due_date, project_id, created_at, ${PROJ}`,
    text: ['invoice_number', 'vendor_name', 'description', 'vendor_email'], textNumber: 'invoice_number',
    build: (r) => ({
      number: r.invoice_number, label: r.vendor_name || r.description || 'Invoice',
      sub: join(human(r.status), r.due_date && `Due ${fmtDate(r.due_date)}`),
      href: `/app/invoicing/${r.id}`, extra: [r.description],
    }),
  },
  {
    type: 'pay_app', table: 'pay_applications',
    select: `id, app_number, contract_name, status, period_to, project_id, created_at, ${PROJ}`,
    text: ['contract_name', 'contract_number'], intNumber: 'app_number', softDelete: true,
    build: (r) => ({
      number: r.app_number != null ? `#${r.app_number}` : null,
      label: `Pay app #${r.app_number ?? '—'}${r.contract_name ? ` — ${r.contract_name}` : ''}`,
      sub: join(human(r.status), r.period_to && `Period to ${fmtDate(r.period_to)}`),
      href: `/app/projects/${r.project_id}/pay-apps/${r.id}`,
    }),
  },
  {
    type: 'person', table: 'employees',
    select: 'id, full_name, first_name, last_name, title, trade, email, is_active, created_at',
    text: ['full_name', 'first_name', 'last_name', 'title', 'trade', 'email', 'employee_number'],
    build: (r) => {
      const name = (r.full_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || 'Crew member').trim();
      return {
        label: name, sub: join(r.title, r.trade, r.is_active === false && 'Inactive'),
        href: '/app/people?tab=directory', extra: [r.email], dedupe: (r.email || name).toLowerCase(),
      };
    },
  },
  {
    type: 'person', table: 'profiles',
    select: 'id, full_name, email, title, role, created_at',
    text: ['full_name', 'email', 'title'],
    build: (r) => {
      const name = (r.full_name || r.email || 'Team member').trim();
      return {
        label: name, sub: join(r.title, human(r.role), 'App user'),
        href: '/app/people?tab=access', extra: [r.email], dedupe: (r.email || name).toLowerCase(),
      };
    },
  },
];

type Outcome = { spec: Spec; ok: boolean; count: number; rows: Row[] };

/** Run one spec: the text match (with the exact count), plus — when the query
 *  names a record number — a targeted number lookup so "5" or "RFI 5" always
 *  returns RFI-005 even when many rows merely contain a 5. */
async function runSpec(db: SupabaseClient, tenantId: string, spec: Spec, p: ParsedQuery, fetchN: number): Promise<Outcome> {
  const base = (withCount: boolean) => {
    let q: any = db.from(spec.table).select(spec.select, withCount ? { count: 'exact' } : undefined).eq('tenant_id', tenantId);
    if (spec.softDelete) q = q.is('deleted_at', null);
    if (spec.scope) q = spec.scope(q);
    return q;
  };

  const ors = p.like ? spec.text.map((c) => `${c}.ilike."${p.like}"`) : [];
  const wantsNumber = asksNumberOf(p, spec.type) && (spec.intNumber || spec.textNumber);
  if (spec.intNumber && wantsNumber) ors.push(`${spec.intNumber}.eq.${p.number}`);
  if (spec.dateCol && p.date) ors.push(`${spec.dateCol}.eq.${p.date}`);

  const jobs: Array<PromiseLike<{ data: Row[] | null; error: unknown; count?: number | null }>> = [
    base(true).or(ors.join(',')).order('created_at', { ascending: false }).limit(fetchN),
  ];
  if (wantsNumber) {
    jobs.push(
      (spec.intNumber ? base(false).eq(spec.intNumber, p.number) : base(false).ilike(spec.textNumber!, `%${p.number}`))
        .order('created_at', { ascending: false }).limit(25),
    );
  }
  if (spec.tagsJson && p.word) {
    jobs.push(base(false).contains(spec.tagsJson, JSON.stringify([p.word])).order('created_at', { ascending: false }).limit(fetchN));
  }

  const res = await Promise.all(jobs);
  const failed = res.find((r) => r.error);
  if (failed) {
    console.error(`[search] ${spec.table} query failed`, failed.error);
    return { spec, ok: false, count: 0, rows: [] };
  }

  const seen = new Set<string>();
  const rows: Row[] = [];
  const add = (r: Row) => { const k = String(r.id); if (!seen.has(k)) { seen.add(k); rows.push(r); } };
  // Exact number hits first so they survive the per-type cap.
  if (wantsNumber) {
    for (const r of res[1].data ?? []) {
      const n = trailingNumber(spec.intNumber ? r[spec.intNumber] : r[spec.textNumber!]);
      if (n === p.number) add(r);
    }
  }
  for (const r of res[0].data ?? []) add(r);
  let extraTagHits = 0;
  if (spec.tagsJson && p.word) {
    for (const r of res[res.length - 1].data ?? []) { if (!seen.has(String(r.id))) extraTagHits++; add(r); }
  }
  return { spec, ok: true, count: (res[0].count ?? 0) + extraTagHits, rows };
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const p = parseQuery(url.searchParams.get('q') || '');
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '5', 10) || 5, 1), 50);
  const askedTypes = (url.searchParams.get('types') || '').split(',').map((s) => s.trim()).filter(isSearchType);

  const empty: SearchResponse = { q: p.text, groups: [], results: [], total: 0 };
  if (p.text.length < 2 && p.number == null) return NextResponse.json(empty);

  try {
    const db = createServerClient();
    const started = Date.now();
    const perms = await getEffectivePermissions(db, user.id, user.tenantId);
    const allowed = new Set(allowedSearchTypes(perms));
    const wanted = SPECS.filter((s) => allowed.has(s.type) && (askedTypes.length === 0 || askedTypes.includes(s.type)));
    const permsMs = Date.now() - started;

    const fetchN = Math.min(Math.max(limit * 3, 15), 60);
    const outcomes = await Promise.all(
      wanted.map((s) => runSpec(db as unknown as SupabaseClient, user.tenantId, s, p, fetchN)),
    );
    const dbMs = Date.now() - started;

    if (wanted.length > 0 && outcomes.every((o) => !o.ok)) {
      return apiError('search', new Error('every search query failed'), 'Search is not available right now. Please try again.');
    }

    const byType = new Map<SearchType, { count: number; hits: SearchHit[]; keys: Set<string> }>();
    const partial: SearchType[] = [];
    for (const o of outcomes) {
      if (!o.ok) { partial.push(o.spec.type); continue; }
      const slot = byType.get(o.spec.type) ?? { count: 0, hits: [], keys: new Set<string>() };
      slot.count += o.count;
      for (const r of o.rows) {
        const b = o.spec.build(r);
        if (b.dedupe) {
          if (slot.keys.has(b.dedupe)) { slot.count = Math.max(slot.count - 1, slot.hits.length); continue; }
          slot.keys.add(b.dedupe);
        }
        const project = r.project && r.project.id ? { id: String(r.project.id), name: String(r.project.name || 'Job') } : null;
        slot.hits.push({
          type: o.spec.type,
          id: String(r.id),
          number: b.number == null || b.number === '' ? undefined : String(b.number),
          label: b.label,
          sub: b.sub || undefined,
          project,
          href: b.href,
          rank: rankHit(p, o.spec.type, { number: b.number ?? null, label: b.label, extra: b.extra }),
        });
      }
      byType.set(o.spec.type, slot);
    }

    const groups: SearchGroup[] = [];
    for (const [type, slot] of byType) {
      if (!slot.hits.length) continue;
      const hits = sortHits(slot.hits).slice(0, limit);
      groups.push({ type, label: TYPE_LABEL[type].many, count: Math.max(slot.count, slot.hits.length), hits });
    }
    const ordered = orderGroups(groups);
    const results = sortHits(ordered.flatMap((g) => g.hits));
    const body: SearchResponse & { partial?: SearchType[] } = {
      q: p.text,
      groups: ordered,
      results,
      total: ordered.reduce((n, g) => n + g.count, 0),
      ...(partial.length ? { partial: Array.from(new Set(partial)) } : {}),
    };
    return NextResponse.json(body, {
      headers: { 'Server-Timing': `perms;dur=${permsMs}, db;dur=${dbMs - permsMs}, total;dur=${Date.now() - started}` },
    });
  } catch (e) {
    return apiError('search', e, 'Search failed. Please try again.');
  }
}
