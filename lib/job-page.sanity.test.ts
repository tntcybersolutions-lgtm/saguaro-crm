/**
 * The job page's data — lib/job-tools (the counts) and lib/job-page (the
 * words, the tool list, the brief).
 * Run: npx -y tsx lib/job-page.sanity.test.ts   (exit 0 = every assertion held)
 */
import fs from 'node:fs';
import path from 'node:path';
import { countJobTools, type JobTools } from './job-tools';
import {
  TOOLS, toolHref, toolList, toolValue, jobBrief, fmtMoneyShort, fmtDay, shortAddress, dateLine, stageLabel, jobStage, type JobFacts,
} from './job-page';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const text = (b: ReturnType<typeof jobBrief>) => (b ? b.parts.map((p) => (typeof p === 'string' ? p : p.b)).join('') : '');

/* ── Formatting ── */
check('money: $4.75M', fmtMoneyShort(4750000) === '$4.75M', fmtMoneyShort(4750000));
check('money: $2.54M', fmtMoneyShort(2539650) === '$2.54M', fmtMoneyShort(2539650));
check('money: $3.95M', fmtMoneyShort(2788000 + 1164500) === '$3.95M', fmtMoneyShort(3952500));
check('money: $4M (no trailing zeros)', fmtMoneyShort(4000000) === '$4M', fmtMoneyShort(4000000));
check('money: $96K', fmtMoneyShort(96000) === '$96K');
check('money: $0', fmtMoneyShort(0) === '$0');
check('day: Oct 20', fmtDay('2026-10-20', '2026-10-10') === 'Oct 20');
check('day: Jun 30 next year, no year inside ~10 months', fmtDay('2027-06-30', '2026-10-10') === 'Jun 30', fmtDay('2027-06-30', '2026-10-10'));
check('day: far off carries the year', fmtDay('2028-01-05', '2026-10-10') === 'Jan 5, 2028', fmtDay('2028-01-05', '2026-10-10'));
check('day: relative today / tomorrow', fmtDay('2026-10-10', '2026-10-10', true) === 'today' && fmtDay('2026-10-11', '2026-10-10', true) === 'tomorrow');
check('address: street + city', shortAddress({ address: '4400 W Chandler Blvd', city: 'Chandler' }) === '4400 W Chandler Blvd, Chandler');
check('address: city not repeated', shortAddress({ address: '1 Main St, Mesa, AZ', city: 'Mesa' }) === '1 Main St, Mesa, AZ');
check('date line: starts', dateLine('building', '2026-11-02', '2027-06-30', '2026-10-10')?.text === 'starts Nov 2');
check('date line: finishes', dateLine('building', '2026-01-02', '2027-06-30', '2026-10-10')?.text === 'finishes Jun 30');
check('date line: finished', dateLine('closed', '2026-04-20', '2026-09-18', '2026-10-10')?.text === 'finished Sep 18');
check('date line: late finish flagged', dateLine('building', '2026-01-02', '2026-09-01', '2026-10-10')?.late === true);
check('stage: complete', stageLabel({ status: 'completed', phase: 'building' }) === 'Complete' && jobStage({ status: 'completed' }) === 'closed');
check('stage: cancelled is closed, not complete', stageLabel({ status: 'cancelled' }) === 'Cancelled');
check('stage: building / bidding', stageLabel({ status: 'active', phase: 'building' }) === 'Building' && stageLabel({ status: 'active', phase: 'preconstruction' }) === 'Bidding');

/* ── Copper Ridge (live data, 2026-10-10): 3 bid packages, two closing Oct 20 ── */
const base: JobTools = {
  bidPackages: null, takeoffs: 0, drawings: 0, specs: 0, rfis: { open: 0, overdue: 0 }, submittals: { total: 0, open: 0 },
  dailyLogs: { total: 0, last: null }, photos: 0, schedule: { total: 0, late: 0 }, budget: 0,
  payApps: { total: 0, paid: 0, draft: 0, billed: 0 }, changeOrders: { total: 0, pending: 0 }, punch: { total: 0, open: 0 },
  inspections: { total: 0, upcoming: [] }, permits: 0, safety: 0, team: 0, directory: 0, files: 0,
  compliance: { subs: 0, expired: 0, missing: 0 }, lienWaivers: { total: 0, pending: 0 }, proposals: 0, contracts: 0,
  purchaseOrders: 0, invoices: 0, bills: 0, todos: 0, tmTickets: 0, crews: 0, selections: 0, alerts: 0,
};
const copper: JobTools = {
  ...base,
  takeoffs: 1,
  photos: 1,
  bidPackages: { total: 3, open: 3, nextDue: '2026-10-20', dueNext: { count: 2, invited: 9, responded: 5, lowTotal: 2788000 + 1164500, lowCount: 2 }, pastDue: 0, noDue: 1, notInvited: 1 },
};
const cf: JobFacts = { stage: 'building', today: '2026-10-10', start: '2026-11-02', end: '2027-06-30', contract: 4750000 };
const cb = jobBrief(copper, cf);
check('brief (Copper Ridge) reads like the mock', text(cb) === 'Bids close Oct 20. 5 of 9 in so far; low bids total $3.95M. No drawings or specs are on the job yet, so bidders only see the takeoff.', text(cb));
check('brief (Copper Ridge) offers Add plans → drawings', cb?.action.label === 'Add plans' && cb.action.href === '/drawings', JSON.stringify(cb?.action));
const v = (id: string, t: JobTools | 'loading' | 'failed' = copper, f = cf) => toolValue(id, t, f);
check('bid packages: "3 · 2 close Oct 20" in amber', v('bid-packages').text === '3 · 2 close Oct 20' && v('bid-packages').warn === true, JSON.stringify(v('bid-packages')));
check('takeoff: 1', v('takeoff').text === '1' && !v('takeoff').warn);
check('drawings: amber None yet while building', v('drawings').text === 'None yet' && v('drawings').warn === true);
check('specs: amber None yet while building', v('specs').text === 'None yet' && v('specs').warn === true);
check('rfis: 0 open', v('rfis').text === '0 open');
check('submittals: 0', v('submittals').text === '0');
check('daily logs before the start: Starts Nov 2', v('daily-logs').text === 'Starts Nov 2' && !v('daily-logs').warn);
check('pay apps: None yet', v('pay-apps').text === 'None yet');
check('change orders: 0', v('change-orders').text === '0');
check('schedule: amber None yet on a won job', v('schedule').text === 'None yet' && v('schedule').warn === true);
check('compliance: No subs yet', v('compliance').text === 'No subs yet');
check('closeout says nothing on a live job', v('closeout').text === null);
check('a failed count reads —', v('drawings', { ...copper, drawings: null }).text === '—' && v('drawings', { ...copper, drawings: null }).failed === true);
check('the whole request failing reads — everywhere it counts', v('rfis', 'failed').text === '—' && v('takeoff', 'failed').text === '—');
check('loading shows a placeholder, not a zero', v('rfis', 'loading').loading === true && v('rfis', 'loading').text === null);
check('bid packages due today say "close today"', toolValue('bid-packages', copper, { ...cf, today: '2026-10-20' }).text === '3 · 2 close today');
check('bid packages due in 3 weeks are not amber', toolValue('bid-packages', { ...copper, bidPackages: { ...copper.bidPackages!, nextDue: '2026-11-20' } }, cf).warn === false);

/* Started building jobs: today's log. */
const running: JobFacts = { stage: 'building', today: '2026-10-10', start: '2026-09-01', end: '2027-06-30', contract: 1e6 };
check('daily logs: Today ✓', toolValue('daily-logs', { ...base, dailyLogs: { total: 4, last: '2026-10-10' } }, running).text === 'Today ✓');
check('daily logs: amber Not filed today', (() => { const x = toolValue('daily-logs', { ...base, dailyLogs: { total: 4, last: '2026-10-08' } }, running); return x.text === 'Not filed today' && x.warn === true; })());
check('brief: running job without today\'s log', text(jobBrief({ ...base, drawings: 4, specs: 2, dailyLogs: { total: 4, last: '2026-10-08' } }, running)) === 'No daily log for today yet. The last one was Oct 8.');
check('brief: overdue RFIs outrank the daily log', jobBrief({ ...base, rfis: { open: 3, overdue: 2 }, dailyLogs: { total: 1, last: '2026-10-01' } }, running)?.action.href === '/rfis');
check('rfis: overdue is amber', (() => { const x = toolValue('rfis', { ...base, rfis: { open: 3, overdue: 1 } }, running); return x.text === '3 open · 1 overdue' && x.warn === true; })());

/* ── Pima County ADC (live data): complete, 5 of 5 pay apps paid ── */
const pima: JobTools = { ...base, takeoffs: 1, drawings: 0, specs: 0, rfis: { open: 0, overdue: 0 }, dailyLogs: { total: 8, last: '2026-09-18' }, schedule: { total: 15, late: 0 }, budget: 10, payApps: { total: 5, paid: 5, draft: 0, billed: 2539650 }, changeOrders: { total: 2, pending: 0 }, punch: { total: 8, open: 0 }, directory: 8, compliance: { subs: 4, expired: 0, missing: 0 }, lienWaivers: { total: 8, pending: 0 }, contracts: 4,
  bidPackages: { total: 5, open: 1, nextDue: null, dueNext: null, pastDue: 0, noDue: 1, notInvited: 1 } };
const pf: JobFacts = { stage: 'closed', today: '2026-10-10', start: '2026-04-20', end: '2026-09-18', contract: 2539650 };
check('brief (Pima) closed and clean', text(jobBrief(pima, pf)) === 'Finished Sep 18. All 5 pay apps are paid and nothing is open.', text(jobBrief(pima, pf)));
check('brief (Pima) action is Closeout', jobBrief(pima, pf)?.action.href === '/closeout');
check('pay apps: 5 · 100% billed', toolValue('pay-apps', pima, pf).text === '5 · 100% billed', String(toolValue('pay-apps', pima, pf).text));
check('closed job: no amber for missing drawings', toolValue('drawings', pima, pf).warn === false);
check('punch: 8 · all closed', toolValue('punch-list', pima, pf).text === '8 · all closed');
check('compliance: 4 subs · all current', toolValue('compliance', pima, pf).text === '4 subs · all current');
check('closeout: Done', toolValue('closeout', pima, pf).text === 'Done');
check('brief (Pima) open punch comes first', text(jobBrief({ ...pima, punch: { total: 8, open: 2 } }, pf)) === 'Finished Sep 18. 2 punch items are still open.');
check('compliance expired is amber', (() => { const x = toolValue('compliance', { ...pima, compliance: { subs: 4, expired: 1, missing: 0 } }, pf); return x.text === '4 subs · 1 expired' && x.warn === true; })());

/* ── Bidding briefs ── */
const bid: JobFacts = { stage: 'bidding', today: '2026-10-10', start: null, end: null, contract: 0 };
check('brief: bidding, nothing yet → Start takeoff', jobBrief({ ...base, bidPackages: { total: 0, open: 0, nextDue: null, dueNext: null, pastDue: 0, noDue: 0, notInvited: 0 } }, bid)?.action.href === '/takeoff');
check('brief: no one invited', text(jobBrief({ ...copper, bidPackages: { ...copper.bidPackages!, dueNext: { count: 1, invited: 0, responded: 0, lowTotal: 0, lowCount: 0 } } }, bid)) === 'Bids close Oct 20, but no one is invited yet.');
check('brief: no bids back yet', text(jobBrief({ ...copper, drawings: 3, specs: 1, bidPackages: { ...copper.bidPackages!, dueNext: { count: 2, invited: 9, responded: 0, lowTotal: 0, lowCount: 0 } } }, bid)) === 'Bids close Oct 20. None of 9 invited have bid yet.');
check('bid packages: amber None yet while bidding', toolValue('bid-packages', { ...base, bidPackages: { total: 0, open: 0, nextDue: null, dueNext: null, pastDue: 0, noDue: 0, notInvited: 0 } }, bid).warn === true);
check('no brief before the counts arrive', jobBrief(null, cf) === null);

/* ── The tool list ── */
const tl = toolList(copper, cf);
const listed = tl.groups.flatMap((g) => g.rows.map((r) => r.tool.id));
check('core tools always listed', ['bid-packages', 'takeoff', 'drawings', 'specs', 'rfis', 'submittals', 'daily-logs', 'photos', 'schedule', 'budget', 'pay-apps', 'change-orders', 'punch-list', 'inspections', 'permits', 'safety', 'team', 'files', 'compliance', 'lien-waivers', 'closeout'].every((id) => listed.includes(id)), listed.join(','));
check('Estimate waits under More on a won job', !listed.includes('estimate') && tl.more.some((m) => m.tool.id === 'estimate'));
check('Estimate joins Preconstruction while bidding with a takeoff', toolList(copper, { ...cf, stage: 'bidding' }).groups[0].rows.some((r) => r.tool.id === 'estimate'));
check('empty non-core tools wait under More tools', tl.more.some((m) => m.tool.id === 'contracts') && !listed.includes('contracts'));
check('every tool is reachable (listed or under More)', listed.length + tl.more.length === TOOLS.length, `${listed.length}+${tl.more.length} vs ${TOOLS.length}`);
check('group order', tl.groups.map((g) => g.label).join(',') === 'Preconstruction,Documents,Field,Money,Team,Closeout');
check('first rows match the mock order', listed.slice(0, 7).join(',') === 'bid-packages,takeoff,drawings,specs,rfis,submittals,files', listed.slice(0, 8).join(','));
const loadingList = toolList('loading', cf);
check('while loading only core tools are listed', loadingList.groups.flatMap((g) => g.rows).every((r) => r.tool.core));

/* Every href lands on a page that exists. */
const root = path.resolve(__dirname, '..');
const missing = TOOLS.filter((t) => {
  const file = t.href.startsWith('/app/')
    ? path.join(root, 'app', t.href.slice(1), 'page.tsx')
    : path.join(root, 'app/app/projects/[projectId]', t.href.slice(1), 'page.tsx');
  return !fs.existsSync(file);
});
check('every tool href resolves to a page.tsx', missing.length === 0, missing.map((t) => t.href).join(', '));
check('tool hrefs: job-relative and app-level', toolHref(TOOLS[0], 'P1') === '/app/projects/P1/bid-packages' && toolHref(TOOLS.find((t) => t.id === 'signal-studio')!, 'P1') === '/app/signal-studio?projectId=P1');
const pages = fs.readdirSync(path.join(root, 'app/app/projects/[projectId]'), { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(root, 'app/app/projects/[projectId]', d.name, 'page.tsx'))).map((d) => d.name).filter((d) => d !== 'overview');
const hrefs = new Set(TOOLS.map((t) => t.href.split('/')[1]));
const unlisted = pages.filter((d) => !hrefs.has(d));
check('every tool page under the job has a row', unlisted.length === 0, unlisted.join(', '));

/* ── countJobTools against a fake database ── */
type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>, failTable?: string) {
  const seen: { table: string; filters: string[] }[] = [];
  const from = (table: string) => {
    const preds: ((r: Row) => boolean)[] = [];
    const filters: string[] = [];
    seen.push({ table, filters });
    let headOnly = false;
    let order: [string, boolean] | null = null;
    let lim: number | null = null;
    const run = () => {
      if (table === failTable) return { data: null, count: null, error: { message: 'relation does not exist' } };
      let rows = (tables[table] || []).filter((r) => preds.every((p) => p(r)));
      if (order) { const [k, asc] = order; rows = [...rows].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : 1) * (asc ? 1 : -1)); }
      if (lim != null) rows = rows.slice(0, lim);
      return { data: headOnly ? null : rows, count: rows.length, error: null };
    };
    const q: any = {
      select(_c: string, o?: { head?: boolean }) { headOnly = !!o?.head; return q; },
      eq(k: string, v: unknown) { filters.push(`${k}=${v}`); preds.push((r) => r[k] === v); return q; },
      in(k: string, v: unknown[]) { preds.push((r) => v.includes(r[k])); return q; },
      is(k: string, v: unknown) { preds.push((r) => (r[k] ?? null) === v); return q; },
      not(k: string, _op: string, list: string) { const vs = list.replace(/[()]/g, '').split(','); preds.push((r) => r[k] != null && !vs.includes(String(r[k]))); return q; },
      lt(k: string, v: string) { preds.push((r) => r[k] != null && String(r[k]) < v); return q; },
      lte(k: string, v: string) { preds.push((r) => r[k] != null && String(r[k]) <= v); return q; },
      gte(k: string, v: string) { preds.push((r) => r[k] != null && String(r[k]) >= v); return q; },
      order(k: string, o?: { ascending?: boolean }) { order = [k, o?.ascending !== false]; return q; },
      limit(n: number) { lim = n; return q; },
      then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) { return Promise.resolve(run()).then(res, rej); },
    };
    return q;
  };
  return { db: { from }, seen };
}

(async () => {
  const T = 'T1', P = 'P1', today = '2026-10-10';
  const mine = (r: Row) => ({ tenant_id: T, project_id: P, deleted_at: null, ...r });
  const theirs = (r: Row) => ({ tenant_id: 'T2', project_id: P, deleted_at: null, ...r });
  const tables: Record<string, Row[]> = {
    bid_packages: [
      mine({ id: 'b1', status: 'open', due_date: '2026-10-20' }),
      mine({ id: 'b2', status: 'open', due_date: '2026-10-20' }),
      mine({ id: 'b3', status: 'open', due_date: null }),
      mine({ id: 'b4', status: 'awarded', due_date: '2026-03-20' }),
      theirs({ id: 'x1', status: 'open', due_date: '2026-10-12' }),
    ],
    bid_package_invites: [
      ...['b1', 'b1', 'b1', 'b1', 'b1', 'b2', 'b2', 'b2', 'b2'].map((id, i) => ({ tenant_id: T, bid_package_id: id, status: 'invited', response_status: i === 0 ? 'viewed' : null })),
      { tenant_id: T, bid_package_id: 'b2', status: 'revoked', response_status: null },
    ],
    bid_submissions: [
      { tenant_id: T, bid_package_id: 'b1', status: 'submitted', base_amount: 2788000, amount: 0 },
      { tenant_id: T, bid_package_id: 'b1', status: 'submitted', base_amount: 2950000, amount: 0 },
      { tenant_id: T, bid_package_id: 'b1', status: 'submitted', base_amount: null, amount: 3100000 },
      { tenant_id: T, bid_package_id: 'b2', status: 'submitted', base_amount: 1164500 },
      { tenant_id: T, bid_package_id: 'b2', status: 'submitted', base_amount: 1200000 },
      { tenant_id: T, bid_package_id: 'b2', status: 'withdrawn', base_amount: 900000 },
    ],
    takeoffs: [mine({ id: 't1' }), theirs({ id: 't2' })],
    drawings: [mine({ id: 'd1', deleted_at: '2026-10-01' })],
    rfis: [mine({ id: 'r1', status: 'open', due_date: '2026-10-01' }), mine({ id: 'r2', status: 'open', due_date: '2026-10-30' }), mine({ id: 'r3', status: 'closed', due_date: '2026-09-01' }), theirs({ id: 'r4', status: 'open', due_date: '2026-09-01' })],
    daily_logs: [mine({ log_date: '2026-10-08' }), mine({ log_date: '2026-10-11' })],
    photos: [mine({ id: 'p1' })],
    project_files: [mine({ id: 'f1', kind: 'image' }), mine({ id: 'f2', kind: 'pdf' })],
    schedule_tasks: [mine({ id: 's1', end_date: '2026-10-01', status: 'in_progress' }), mine({ id: 's2', end_date: '2026-10-01', status: 'completed' })],
    pay_applications: [mine({ app_number: 1, status: 'paid', total_completed_stored: 100 }), mine({ app_number: 2, status: 'draft', total_completed_stored: 250 })],
    inspections: [mine({ id: 'i1', status: 'scheduled', scheduled_date: '2026-10-14', inspection_type: 'Rough-in', inspector_name: 'City of Chandler' }), mine({ id: 'i2', status: 'passed', scheduled_date: '2026-10-02' })],
    project_subcontractors: [mine({ subcontractor_id: 's-a' }), mine({ subcontractor_id: 's-b' }), mine({ subcontractor_id: 's-c' })],
    insurance_certificates: [{ tenant_id: T, sub_id: 's-a', expiry_date: '2027-01-01' }, { tenant_id: T, sub_id: 's-b', expiry_date: '2026-09-30' }],
    project_todos: [mine({ status: 'pending' }), mine({ status: 'Complete' })],
    autopilot_alerts: [mine({ status: 'active' }), mine({ status: 'dismissed' })],
  };
  const { db, seen } = fakeDb(tables);
  const t = await countJobTools(db, T, P, today, () => { /* expected none */ });
  const bp = t.bidPackages!;
  check('counts: bid packages 4 (other company excluded)', bp.total === 4 && bp.open === 3, JSON.stringify(bp));
  check('counts: next due Oct 20, 2 packages', bp.nextDue === '2026-10-20' && bp.dueNext?.count === 2, JSON.stringify(bp));
  check('counts: 9 invited (revoked not counted), 5 bids (withdrawn not counted)', bp.dueNext?.invited === 9 && bp.dueNext?.responded === 5, JSON.stringify(bp.dueNext));
  check('counts: low bids total $3.95M (portal bids read from base_amount)', bp.dueNext?.lowTotal === 2788000 + 1164500 && bp.dueNext?.lowCount === 2, JSON.stringify(bp.dueNext));
  check('counts: one open package undated, one uninvited', bp.noDue === 1 && bp.notInvited === 1);
  check('counts: takeoffs 1', t.takeoffs === 1);
  check('counts: deleted drawing not counted', t.drawings === 0);
  check('counts: rfis 2 open, 1 overdue', t.rfis?.open === 2 && t.rfis?.overdue === 1, JSON.stringify(t.rfis));
  check('counts: last daily log on or before today', t.dailyLogs?.last === '2026-10-08' && t.dailyLogs?.total === 2, JSON.stringify(t.dailyLogs));
  check('counts: photos include image files, not PDFs', t.photos === 2);
  check('counts: files 2', t.files === 2);
  check('counts: schedule 1 late (completed not late)', t.schedule?.late === 1 && t.schedule?.total === 2);
  check('counts: pay apps billed = latest app', t.payApps?.billed === 250 && t.payApps?.paid === 1 && t.payApps?.draft === 1, JSON.stringify(t.payApps));
  check('counts: next inspection', t.inspections?.upcoming[0]?.date === '2026-10-14' && t.inspections.upcoming[0].inspector === 'City of Chandler' && t.inspections.total === 2);
  check('counts: compliance 3 subs, 1 expired, 1 missing', t.compliance?.subs === 3 && t.compliance.expired === 1 && t.compliance.missing === 1, JSON.stringify(t.compliance));
  check('counts: open to-dos ignore Complete', t.todos === 1);
  check('counts: active alerts only', t.alerts === 1);
  const scoped = seen.filter((s) => !['bid_package_invites', 'bid_submissions', 'insurance_certificates'].includes(s.table));
  check('every job-table query carries tenant AND project', scoped.every((s) => s.filters.includes(`tenant_id=${T}`) && s.filters.includes(`project_id=${P}`)), scoped.filter((s) => !(s.filters.includes(`tenant_id=${T}`) && s.filters.includes(`project_id=${P}`))).map((s) => s.table).join(','));
  check('child-table queries carry the tenant', seen.filter((s) => ['bid_package_invites', 'bid_submissions', 'insurance_certificates'].includes(s.table)).every((s) => s.filters.includes(`tenant_id=${T}`)));

  /* One table down: only its tool goes to null, and it is logged. */
  const logs: string[] = [];
  const broken = fakeDb(tables, 'specifications');
  const t2 = await countJobTools(broken.db, T, P, today, (m) => logs.push(m));
  check('a failing count is null for that tool only', t2.specs === null && t2.drawings === 0 && t2.rfis?.open === 2);
  check('a failing count is logged with its tool', logs.length === 1 && logs[0].includes('specs'), logs.join(' | '));

  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
