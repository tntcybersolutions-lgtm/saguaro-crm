/**
 * Flat Home loader sanity — tenant scoping, the job filter, permissions, and a
 * failed section that doesn't take the rest of Home with it.
 * Run: bundle with esbuild (--bundle --platform=node --format=cjs) and run with
 * node, with dummy NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 * (lib/permissions imports the server client; nothing here reaches a network).
 */
import { buildFlat } from './flat-build';
import type { BuildCtx, HomeSections } from './build';
import type { PermissionMap } from '@/lib/permissions';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

/* A tiny PostgREST stand-in: filters rows, records every query, fails a table on request. */
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const calls: Array<{ table: string; eqs: Array<[string, unknown]> }> = [];
const failing = new Set<string>();
function from(table: string) {
  const preds: Array<(r: Row) => boolean> = [];
  const call = { table, eqs: [] as Array<[string, unknown]> };
  const run = () => {
    calls.push(call);
    if (failing.has(table)) return { data: null, error: { message: `relation "${table}" timed out` } };
    return { data: (tables[table] || []).filter(r => preds.every(p => p(r))), error: null };
  };
  const q = {
    select: () => q,
    eq: (k: string, v: unknown) => { call.eqs.push([k, v]); preds.push(r => r[k] === v); return q; },
    is: (k: string, v: unknown) => { preds.push(r => (r[k] ?? null) === v); return q; },
    in: (k: string, v: unknown[]) => { preds.push(r => v.includes(r[k])); return q; },
    not: () => q, lte: () => q, gte: () => q, order: () => q, limit: () => q,
    maybeSingle: () => Promise.resolve(run()),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  };
  return q;
}
const db = { from } as unknown as BuildCtx['db'];

const T = 'tenant-1', X = 'tenant-other';
const CR = 'job-cr', PIMA = 'job-pima';
function seed() {
  for (const k of Object.keys(tables)) delete tables[k];
  calls.length = 0;
  failing.clear();
  tables.projects = [
    { id: CR, tenant_id: T, name: 'Copper Ridge Data Center Phase II — Critical Environment Controls', status: 'active', phase: 'building', city: 'Chandler', revised_contract_value: '4750000', start_date: '2026-11-02', end_date: '2027-06-30', deleted_at: null, is_archived: false },
    { id: PIMA, tenant_id: T, name: 'Pima County Adult Detention Center — BAS Modernization', status: 'completed', phase: 'building', city: 'Tucson', revised_contract_value: '2539650', start_date: '2026-04-20', end_date: '2026-09-18', deleted_at: null, is_archived: false },
    { id: 'job-x', tenant_id: X, name: 'Other company job', status: 'active', phase: 'building', revised_contract_value: '9000000', deleted_at: null },
  ];
  tables.bid_packages = [
    { id: 'crac', tenant_id: T, project_id: CR, name: 'CRAC Controls & Sequencing', status: 'open', due_date: '2026-10-20', sub_portal_enabled: false, budget_estimate: '2850000', deleted_at: null },
    { id: 'cont', tenant_id: T, project_id: CR, name: 'Containment Instrumentation', status: 'open', due_date: '2026-10-20', sub_portal_enabled: false, budget_estimate: '1180000', deleted_at: null },
    { id: 'hsgc', tenant_id: T, project_id: PIMA, name: 'Housing Unit C — Low Voltage', status: 'open', due_date: null, sub_portal_enabled: false, deleted_at: null },
    { id: 'pkg-x', tenant_id: X, project_id: 'job-x', name: 'Other company package', status: 'open', due_date: '2026-10-12', deleted_at: null },
  ];
  tables.bid_package_invites = [
    ...Array.from({ length: 5 }, () => ({ tenant_id: T, bid_package_id: 'crac', status: 'invited' })),
    ...Array.from({ length: 4 }, () => ({ tenant_id: T, bid_package_id: 'cont', status: 'invited' })),
    { tenant_id: X, bid_package_id: 'crac', status: 'invited' }, // a foreign row pointing at our package id
  ];
  tables.bid_submissions = [
    ...['a', 'b', 'c'].map(s => ({ id: s, tenant_id: T, bid_package_id: 'crac', sub_id: s, amount: 2788000 })),
    ...['d', 'e'].map(s => ({ id: s, tenant_id: T, bid_package_id: 'cont', sub_id: s, amount: 1164500 })),
  ];
  tables.pay_applications = [1, 2, 3, 4, 5].map(n => ({
    id: `pa${n}`, tenant_id: T, project_id: PIMA, app_number: n, status: 'paid', deleted_at: null,
    total_completed_stored: n === 5 ? 2539650 : n * 400000, current_payment_due: 100000, payment_amount: 100000,
    submitted_at: `2026-0${4 + n}-05T09:00:00Z`, payment_received_at: `2026-0${4 + n}-23T10:00:00Z`,
  }));
  tables.insurance_certificates = [
    ...['Valley Sheet Metal Co.', 'Sonoran Electric LLC', 'Desert Test & Balance', 'Grand Canyon Fire Protection'].map((n, i) => ({ id: `c${i}`, tenant_id: T, project_id: PIMA, sub_name: n, status: 'active', expiry_date: '2027-01-15' })),
    { id: 'cx', tenant_id: X, sub_name: 'Other company sub', status: 'active', expiry_date: '2026-01-01' },
  ];
}

const ALL: PermissionMap = { Projects: 'Full', Budget: 'Full', Schedule: 'Full', Safety: 'Full', Documents: 'Full', RFIs: 'Full', Submittals: 'Full', 'Change Orders': 'Full', 'Pay Apps': 'Full', Reports: 'Full', Sales: 'Full', Admin: 'Full' };
const ctx = (o: Partial<BuildCtx> = {}): BuildCtx => ({ db, tenantId: T, me: { id: 'u1', email: 'owner@zz.test', name: 'Chad' }, perms: ALL, scope: 'team', projectId: null, today: '2026-10-10', window: '7d', timeZone: 'America/Phoenix', ...o });
const sections = (): HomeSections => ({
  metrics: [], queue: { items: [], total: 0, state: 'empty' },
  schedule: { entries: [{ id: 's1', kind: 'Bids due', title: 'Bids due · 2 packages', date: '2026-10-20', time: null, projectId: CR, projectName: null, who: null, href: '#' }], state: 'ok' },
  workTable: { kind: 'jobs', title: 'Active Jobs', columns: [], rows: [], state: 'empty' }, errors: {},
});

(async () => {
  // 1. Owner, everything loads.
  seed();
  let errors: Record<string, string> = {};
  const f = await buildFlat(ctx(), 'owner', sections(), errors);
  check('no errors', Object.keys(errors).length === 0, JSON.stringify(errors));
  check('every query is scoped to the tenant', calls.length > 0 && calls.every(c => c.eqs.some(([k, v]) => k === 'tenant_id' && v === T)), JSON.stringify(calls.filter(c => !c.eqs.some(([k, v]) => k === 'tenant_id' && v === T))));
  check('only this tenant’s packages, foreign invite ignored', f.bidding?.rows.map(r => r.id).join(',') === 'crac,cont,hsgc' && f.bidding?.rows[0].invited === 5, f.bidding?.rows.map(r => `${r.id}:${r.invited}`).join(','));
  check('jobs: Copper Ridge then Pima (complete)', f.jobs?.rows.map(r => r.id).join(',') === `${CR},${PIMA}`, f.jobs?.rows.map(r => r.id).join(','));
  check('strip: $7.29M · Billed 35% · 3 open bids · 4/4', f.strip.map(s => `${s.value}|${s.label}`).join(' ; ') === '$7.29M|Under contract ; $2.54M|Billed · 35% ; 3|Open bids ; 4/4|COIs current', f.strip.map(s => `${s.value}|${s.label}`).join(' ; '));
  check('brief is the bid-link sentence', f.brief.key === `bids:${CR}|2026-10-20` && f.brief.action?.label === 'Turn links on', f.brief.key);
  check('coming up counts the next 7 days only', f.comingUp.count === 0 && f.comingUp.next === null, JSON.stringify(f.comingUp));

  // 2. Bid packages fail: Bidding says so, Jobs / Money / strip still there.
  seed();
  failing.add('bid_packages');
  errors = {};
  const g = await buildFlat(ctx(), 'owner', sections(), errors);
  check('failed bids: named in errors', errors.bidding === 'Could not load this section.', JSON.stringify(errors));
  check('failed bids: section is failed, not empty', g.bidding?.state === 'failed' && g.bidding.rows.length === 0);
  check('failed bids: jobs and money still render', g.jobs?.state === 'ok' && g.money?.state === 'ok');
  check('failed bids: open bids figure is not a zero', g.strip[2].value === null);
  check('failed bids: brief does not claim all clear', g.brief.calm && g.brief.parts.map(p => p.t).join('').startsWith('Nothing is late in what loaded.'), g.brief.parts.map(p => p.t).join(''));

  // 3. Pay apps fail: Money failed, jobs still listed without billing.
  seed();
  failing.add('pay_applications');
  errors = {};
  const h = await buildFlat(ctx(), 'owner', sections(), errors);
  check('failed pay apps: money failed', h.money?.state === 'failed' && !!errors.money);
  check('failed pay apps: jobs listed, no billing bar', h.jobs?.state === 'ok' && h.jobs.rows.every(r => r.billedPct === null));
  check('failed pay apps: billed figure says it could not load', h.strip[1].value === null && h.strip[1].note === 'Could not load pay apps', JSON.stringify(h.strip[1]));

  // 4. The job filter reaches every job-level query.
  seed();
  errors = {};
  const j = await buildFlat(ctx({ projectId: CR }), 'owner', sections(), errors);
  const jobLevel = calls.filter(c => ['bid_packages', 'pay_applications', 'insurance_certificates'].includes(c.table));
  check('job filter: bids, pay apps and COIs filtered by project', jobLevel.length === 3 && jobLevel.every(c => c.eqs.some(([k, v]) => k === 'project_id' && v === CR)), JSON.stringify(jobLevel));
  check('job filter: only that job', j.jobs?.rows.map(r => r.id).join(',') === CR && !!j.bidding?.rows.every(r => r.projectId === CR));

  // 5. Permissions: no Pay Apps → no pay-app read, Money restricted; no Budget → no money in rows.
  seed();
  errors = {};
  const k = await buildFlat(ctx({ perms: { ...ALL, 'Pay Apps': 'None', Budget: 'None' } }), 'owner', sections(), errors);
  check('no Pay Apps: pay_applications never read', !calls.some(c => c.table === 'pay_applications'));
  check('no Pay Apps: money restricted', k.money?.state === 'restricted');
  check('no Budget: no low bids, no contract values', k.bidding!.rows.every(r => r.low === null) && k.jobs!.rows.every(r => r.right === null));
  check('no Budget: under contract hidden with the reason', k.strip[0].value === null && /Budget/.test(k.strip[0].note || ''));

  // 6. Field / sales / service views don't load company sections.
  seed();
  errors = {};
  const fld = await buildFlat(ctx(), 'field', { ...sections(), metrics: [{ key: 'overdue', label: 'My Overdue', value: '2', basis: '', href: null, state: 'ok' }] }, errors);
  check('field: no company reads', calls.length === 0, calls.map(c => c.table).join(','));
  check('field: no Bidding / Jobs / Money sections', fld.bidding === null && fld.jobs === null && fld.money === null);
  check('field: strip from its own metrics', fld.strip[0].value === '2' && fld.strip[0].tone === 'bad');

  if (failed) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
  console.log('\nall flat home loader assertions held');
})().catch(e => { console.error(e); process.exit(1); });
