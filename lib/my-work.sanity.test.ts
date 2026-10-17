/**
 * My Work — the item builders, day buckets in a zone, ranking, snoozes, and
 * the collector's scoping and failure handling (against an in-memory DB).
 * Run: npx -y tsx lib/my-work.sanity.test.ts   (also with TZ=America/Phoenix and TZ=Pacific/Kiritimati)
 */
import {
  applySnoozes, bidItems, bucketOf, buildView, coiItems, dayLabel, dayOfValue, dueText, fmtDay, groupByDay,
  inspectionItems, isItemKey, money, rankItems, rfiItems, rfiLabel, scheduleItems, shortJob, todayCount,
  type BuildCtx, type MyWorkItem,
} from './my-work';
import { collectMyWork } from './my-work-server';
import { dayIn } from './time-zone';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const item = (o: Partial<MyWorkItem> & { key: string }): MyWorkItem => ({
  source: 'todos', title: o.key, meta: '', day: null, now: false, tone: 'grey', amount: null, href: '/x', action: null, done: null, projectId: null, ...o,
});

/* ── Days in a zone: an Iowa company at 7:30 PM Central ───────────────── */

// 7:30 PM CDT on Sat Oct 10 is 00:30 UTC on Sun Oct 11.
const evening = new Date('2026-10-11T00:30:00Z');
const chicagoToday = dayIn('America/Chicago', evening);
const utcToday = dayIn('UTC', evening);
check('7:30 PM in Iowa is still Oct 10 there', chicagoToday === '2026-10-10', chicagoToday);
check('…while UTC has moved on to Oct 11', utcToday === '2026-10-11');

const dueTomorrow = item({ key: 'todo:a', day: '2026-10-11' });
const dueTonight = item({ key: 'todo:b', day: '2026-10-10' });
check('due Oct 11 is This week for the Iowa GC at 7:30 PM, not Today', bucketOf(dueTomorrow, chicagoToday) === 'week');
check('…the UTC day would have called it Today (the bug this guards)', bucketOf(dueTomorrow, utcToday) === 'today');
check('due Oct 10 is still Today in Iowa at 7:30 PM', bucketOf(dueTonight, chicagoToday) === 'today');
check('…and the UTC day would have called it overdue', dueText('2026-10-10', utcToday) === '1 day late' && dueText('2026-10-10', chicagoToday) === 'due today');

const T = '2026-10-10';
check('overdue → Today', bucketOf(item({ key: 'todo:c', day: '2026-10-02' }), T) === 'today');
check('needs action now (no day) → Today', bucketOf(item({ key: 'todo:d', now: true }), T) === 'today');
check('needs action now, due in 10 days → Today', bucketOf(item({ key: 'todo:e', now: true, day: '2026-10-20' }), T) === 'today');
check('today + 7 → This week', bucketOf(item({ key: 'todo:f', day: '2026-10-17' }), T) === 'week');
check('today + 8 → Later', bucketOf(item({ key: 'todo:g', day: '2026-10-18' }), T) === 'later');
check('no day, nothing urgent → Later', bucketOf(item({ key: 'todo:h' }), T) === 'later');

check('day labels read as days, never shifted by a zone', dayLabel('2026-10-20') === 'TUE OCT 20' && dayLabel('2026-11-02') === 'MON NOV 2' && fmtDay('2026-10-20') === 'Oct 20');
check('due words', dueText('2026-10-11', T) === 'due tomorrow' && dueText('2026-10-20', T) === 'due Oct 20' && dueText('2026-10-07', T) === '3 days late' && dueText(null, T) === 'no due date');
check('a date-picker timestamp (midnight UTC) is that day in any zone', dayOfValue('2026-10-12T00:00:00+00:00', 'America/Chicago') === '2026-10-12' && dayOfValue('2026-10-12', 'America/Chicago') === '2026-10-12');
check('a real evening timestamp is the day it was where the person is', dayOfValue('2026-10-11T00:30:00Z', 'America/Chicago') === '2026-10-10' && dayOfValue('2026-10-11T00:30:00Z', 'UTC') === '2026-10-11');

/* ── Ranking ──────────────────────────────────────────────────────────── */

const ranked = rankItems([
  item({ key: 'g:1', tone: 'gold', day: '2026-10-11' }),
  item({ key: 'grey:1', tone: 'grey', now: true }),
  item({ key: 'amber:late', tone: 'amber', day: '2026-10-20', amount: 5_000_000 }),
  item({ key: 'amber:soon', tone: 'amber', day: '2026-10-12' }),
  item({ key: 'red:nodate', tone: 'red', now: true }),
  item({ key: 'red:old', tone: 'red', day: '2026-09-30' }),
  item({ key: 'red:same-small', tone: 'red', day: '2026-10-20', amount: 1_160_000 }),
  item({ key: 'red:same-big', tone: 'red', day: '2026-10-20', amount: 2_790_000 }),
]).map((i) => i.key);
check('red before amber before grey before gold', ranked.indexOf('red:nodate') < ranked.indexOf('amber:soon') && ranked.indexOf('amber:late') < ranked.indexOf('grey:1') && ranked.indexOf('grey:1') < ranked.indexOf('g:1'), ranked.join(' '));
check('within a tone, the oldest deadline first and undated last', ranked.indexOf('red:old') === 0 && ranked.indexOf('red:nodate') === 3, ranked.join(' '));
check('same day: the most money at stake first', ranked.indexOf('red:same-big') < ranked.indexOf('red:same-small'));
check('amber due sooner beats amber with more money due later', ranked.indexOf('amber:soon') < ranked.indexOf('amber:late'));
check('ranking is stable (same input, same order)', JSON.stringify(rankItems([...ranked.map((k) => item({ key: k }))].reverse()).map((i) => i.key)) === JSON.stringify(rankItems(ranked.map((k) => item({ key: k }))).map((i) => i.key)));

/* ── Bid packages: the live Copper Ridge picture (Oct 10) ─────────────── */

const CR = 'proj-copper', PIMA = 'proj-pima';
const ctx: BuildCtx = { today: T, zone: 'America/Phoenix', job: (p) => (p === CR ? 'Copper Ridge Data Center Phase II' : p === PIMA ? 'Pima County Adult Detention Center' : null) };
const pkgs = [
  { id: 'crac', project_id: CR, name: 'CRAC Controls & Sequencing', status: 'open', due_date: '2026-10-20', bid_due_date: null, sub_portal_enabled: false, low_bid_amount: 2_790_000 },
  { id: 'cont', project_id: CR, name: 'Containment Instrumentation', status: 'open', due_date: '2026-10-20', bid_due_date: null, sub_portal_enabled: false, low_bid_amount: 1_160_000 },
  { id: 'hsgc', project_id: PIMA, name: 'Housing Unit C — Low Voltage', status: 'open', due_date: null, bid_due_date: null, sub_portal_enabled: false },
  { id: 'old', project_id: PIMA, name: 'Fire Alarm Interface', status: 'awarded', due_date: '2026-03-20', sub_portal_enabled: false },
];
const inv = (id: string, pkg: string, status: string, company: string) => ({ id, bid_package_id: pkg, status, response_status: status, company_name: company });
const invites = [
  inv('i1', 'crac', 'submitted', 'Thermal Dynamics Controls'), inv('i2', 'crac', 'submitted', 'Summit Critical Systems'), inv('i3', 'crac', 'submitted', 'Redline Mechanical Controls'),
  inv('i4', 'crac', 'viewed', 'Apex Building Systems'), inv('i5', 'crac', 'invited', 'Vertex Controls Group'),
  inv('j1', 'cont', 'submitted', 'Meridian Instrumentation'), inv('j2', 'cont', 'submitted', 'Saguaro Metering Solutions'),
  inv('j3', 'cont', 'viewed', 'Basin Process Controls'), inv('j4', 'cont', 'invited', 'Cactus Sensor Technologies'),
];
const bids = bidItems(pkgs, invites, ctx);
const keys = bids.map((b) => b.key).sort();
check('Copper Ridge: turn on ×2, remind ×2, invite, due date, one "Bids due" day', JSON.stringify(keys) === JSON.stringify(['bid-due-date:hsgc', 'bid-invite:hsgc', 'bid-link:cont', 'bid-link:crac', 'bid-remind:cont', 'bid-remind:crac', 'bids-due:2026-10-20']), keys.join(' '));
const link = bids.find((b) => b.key === 'bid-link:crac')!;
check('"Turn on the bid link" is red, now, with the switch as its action', link.title === 'Turn on the bid link' && link.tone === 'red' && link.now && link.action?.kind === 'portal' && link.meta === "CRAC Controls & Sequencing · bidders can't open it", link.meta);
const rem = bids.find((b) => b.key === 'bid-remind:crac')!;
check('"2 bidders haven\'t answered" names them and reminds exactly those two', rem.title === "2 bidders haven't answered" && rem.meta.startsWith('Apex Building Systems, Vertex Controls Group · CRAC') && rem.action?.kind === 'remind' && JSON.stringify(rem.action.invites.map((x) => x.id)) === '["i4","i5"]', rem.meta);
check('the remind row knows the link is off (no Remind button until it is on)', rem.portalOn === false && rem.tone === 'amber');
const due = bids.find((b) => b.key === 'bids-due:2026-10-20')!;
check('"Bids due · 2 packages" on Oct 20, gold, not Today, the bigger package named first', due.title === 'Bids due · 2 packages' && due.tone === 'gold' && bucketOf(due, T) === 'later' && due.meta === 'CRAC Controls & Sequencing · Containment Instrumentation', due.meta);
const flipped = bidItems([pkgs[1], pkgs[0]], invites, ctx).find((b) => b.key === 'bids-due:2026-10-20')!;
check('…whatever order the database returns them in', flipped.meta === due.meta, flipped.meta);
check('Housing Unit C: Invite bidders (button) + Set a bid due date (chevron to the details form)',
  bids.find((b) => b.key === 'bid-invite:hsgc')!.action?.kind === 'link' && bids.find((b) => b.key === 'bid-due-date:hsgc')!.href.endsWith('?edit=details#package-details'));
check('an awarded package says nothing', !bids.some((b) => b.packageId === 'old'));

const v = buildView(bids, [], T);
check('Today · 6, the badge agrees', v.counts.today === 6 && todayCount(bids, [], T) === 6, String(v.counts.today));
check('Do first = the 2 red turn-ons then the 2 amber reminders; the 2 chores after', JSON.stringify(v.today.doFirst.map((i) => i.key)) === JSON.stringify(['bid-link:crac', 'bid-link:cont', 'bid-remind:crac', 'bid-remind:cont']) && v.today.rest.length === 2, v.today.doFirst.map((i) => i.key).join(' '));

// Further out, revoked, closed.
const later = bidItems([{ ...pkgs[0], id: 'far', due_date: '2026-11-30', sub_portal_enabled: true }], [inv('k1', 'far', 'invited', 'Far Away Co')], ctx);
check('no reminder nags 7 weeks before the due date', !later.some((b) => b.key.startsWith('bid-remind')) && later.some((b) => b.key === 'bids-due:2026-11-30'));
const revoked = bidItems([{ ...pkgs[0], id: 'rv', sub_portal_enabled: false }], [{ ...inv('r1', 'rv', 'revoked', 'Cut Off Inc') }], ctx);
check('a revoked bidder is not a bidder: Invite bidders, not Turn on / Remind', revoked.some((b) => b.key === 'bid-invite:rv') && !revoked.some((b) => b.key === 'bid-link:rv' || b.key === 'bid-remind:rv'));
const closed = bidItems([{ ...pkgs[0], id: 'cl', due_date: '2026-10-08', sub_portal_enabled: true }], [inv('c1', 'cl', 'submitted', 'A'), inv('c2', 'cl', 'invited', 'B')], ctx);
check('bidding closed with bids in → "Level the bids and award", nothing else', closed.length === 1 && closed[0].title === 'Level the bids and award' && closed[0].now);
const onLink = bidItems([{ ...pkgs[0], id: 'on', sub_portal_enabled: true, due_date: '2026-10-11' }], [inv('o1', 'on', 'invited', 'Late Co')], ctx);
check('link on, due tomorrow: Remind is red (≤ 2 days) and offered', onLink.find((b) => b.key === 'bid-remind:on')!.tone === 'red' && onLink.find((b) => b.key === 'bid-remind:on')!.portalOn === true && !onLink.some((b) => b.key === 'bid-link:on'));

/* ── Other builders ───────────────────────────────────────────────────── */

check('RFI labels', rfiLabel('14') === 'RFI-014' && rfiLabel('RFI-014') === 'RFI-014' && rfiLabel('') === 'the RFI');
const rf = rfiItems([
  { id: 'r1', project_id: CR, rfi_number: '14', subject: 'Smoke damper sequence', status: 'open', due_date: '2026-10-08', ball_in_court: 'gc' },
  { id: 'r2', project_id: CR, rfi_number: '15', subject: 'Sensor location', status: 'open', response_due_date: '2026-10-12', ball_in_court: 'architect' },
], ctx, { id: 'me', email: 'pm@zz.test' });
check('RFI in our court, 2 days late → "Answer RFI-014", red', rf[0].title === 'Answer RFI-014' && rf[0].tone === 'red' && bucketOf(rf[0], T) === 'today');
check("RFI in the architect's court → \"Get an answer on RFI-015\", This week", rf[1].title === 'Get an answer on RFI-015' && bucketOf(rf[1], T) === 'week' && rf[1].day === '2026-10-12');

const cois = coiItems([
  { id: 'c1', project_id: CR, sub_id: 's-valley', sub_name: 'Valley Sheet Metal Co.', policy_type: 'GL', expiry_date: '2026-10-30' },
  { id: 'c2', project_id: CR, sub_id: 's-valley', sub_name: 'Valley Sheet Metal Co.', policy_type: 'Auto', expiry_date: '2026-10-18' },
  { id: 'c3', project_id: CR, sub_id: 's-sonoran', sub_name: 'Sonoran Electric LLC', expiry_date: '2026-10-09' },
  { id: 'c4', project_id: CR, sub_id: 's-canyon', sub_name: 'Grand Canyon Fire Protection', expiry_date: '2026-11-30' },
  { id: 'c5', project_id: CR, sub_id: null, sub_name: '[Award pending] HVAC subcontractor', expiry_date: '2026-10-15' },
  { id: 'c6', project_id: CR, sub_id: 's-desert', sub_name: 'Desert Test & Balance', expiry_date: '2026-11-01' },
], ctx);
const valley = cois.find((c) => c.key === 'coi:s-valley')!;
check('one COI row per sub, its soonest certificate (Auto, Oct 18)', cois.filter((c) => c.key === 'coi:s-valley').length === 1 && valley.day === '2026-10-18' && valley.title === 'Request COI from Valley Sheet Metal Co.');
check('8 days out → Today, amber, with Request (Ask for it)', valley.now && valley.tone === 'amber' && valley.action?.kind === 'ask_coi');
check('…and says which policy and when, month capitalised', valley.meta === 'Auto expires Oct 18 · Copper Ridge Data Center Phase II', valley.meta);
check('expired yesterday → red', cois.find((c) => c.key === 'coi:s-sonoran')!.tone === 'red');
check('22 days out → Later, grey, not now', (() => { const d = cois.find((c) => c.key === 'coi:s-desert')!; return !d.now && d.tone === 'grey' && bucketOf(d, T) === 'later'; })());
check('51 days out and the [Award pending] placeholder → nothing', !cois.some((c) => c.key === 'coi:s-canyon') && cois.length === 3);

const insp = inspectionItems([
  { id: 'n1', project_id: CR, inspection_type: 'Rough-in Electrical', status: 'scheduled', result: 'pass', scheduled_date: '2026-10-10T00:00:00+00:00', inspector_name: 'City of Chandler' },
  { id: 'n2', project_id: CR, inspection_type: 'Fire Alarm', status: 'scheduled', result: null, scheduled_date: '2026-10-06T00:00:00+00:00' },
  { id: 'n3', project_id: CR, inspection_type: 'Final', status: 'passed', result: 'passed', scheduled_date: '2026-10-10T00:00:00+00:00' },
], ctx);
check("today's booked inspection (old 'pass' default) → Host it, amber", insp.find((i) => i.key === 'inspection:n1')?.title === 'Host the Rough-in Electrical inspection' && insp.find((i) => i.key === 'inspection:n1')?.tone === 'amber');
check('a held inspection nobody recorded → Record the result, red', insp.find((i) => i.key === 'inspection:n2')?.title === 'Record the Fire Alarm inspection result' && insp.find((i) => i.key === 'inspection:n2')?.tone === 'red');
check('a passed inspection is not work', !insp.some((i) => i.key === 'inspection:n3'));

const tasks = scheduleItems([
  { id: 't1', project_id: CR, name: 'Set CRAC units', start_date: '2026-10-08', end_date: '2026-10-20', status: 'not_started' },
  { id: 't2', project_id: CR, name: 'Pull controls wire', start_date: '2026-10-01', end_date: '2026-10-14', status: 'in_progress' },
  { id: 't3', project_id: CR, name: 'Commissioning', start_date: '2026-12-01', end_date: '2026-12-10', status: 'not_started' },
  { id: 't4', project_id: CR, name: 'Mobilize', start_date: '2026-10-01', end_date: '2026-10-02', status: 'Complete' },
], ctx);
check('schedule: a late start (red, Done) and a finish this week; far-off and complete left out',
  tasks.length === 2 && tasks[0].title === 'Start Set CRAC units' && tasks[0].tone === 'red' && tasks[0].done?.kind === 'task' && tasks[1].title === 'Finish Pull controls wire' && bucketOf(tasks[1], T) === 'week', tasks.map((t) => t.title).join(' / '));

/* ── Snoozes ──────────────────────────────────────────────────────────── */

const sn = [{ item_key: 'bid-invite:hsgc', until: '2026-10-11' }];
check('a snoozed item is gone today…', !applySnoozes(bids, sn, T).some((i) => i.key === 'bid-invite:hsgc') && todayCount(bids, sn, T) === 5);
check('…and back ON its until day', applySnoozes(bids, sn, '2026-10-11').some((i) => i.key === 'bid-invite:hsgc'));
check('snooze keys', isItemKey('bid-link:628674ed-daec-431b-aba3-04cbb1723e24') && isItemKey('daily-log:p1:2026-10-10') && isItemKey('bids-due:2026-10-20') && !isItemKey('x') && !isItemKey('rfi:1; drop table') && !isItemKey(42));

check('group by day: earliest first, undated last', JSON.stringify(groupByDay([item({ key: 'a', day: '2026-10-20' }), item({ key: 'b' }), item({ key: 'c', day: '2026-10-12' })]).map((g) => g.day)) === '["2026-10-12","2026-10-20",null]');
check('short job names and money', shortJob('Copper Ridge Data Center Phase II — Critical Environment Controls') === 'Copper Ridge Data Center Phase II' && money(2_790_000) === '$2.79M' && money(412_000) === '$412K' && money(4_750_000) === '$4.75M');

/* ── The collector: who sees what, and a failing source ───────────────── */

type R = Record<string, any>;
function fakeDb(tables: Record<string, R[]>, fail: string[] = [], missing: string[] = []) {
  const calls: Array<{ table: string; filters: string[] }> = [];
  const parseOr = (expr: string) => {
    const parts: string[] = [];
    let depth = 0, cur = '';
    for (const ch of expr) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
    if (cur) parts.push(cur);
    return parts.map((p) => {
      const [col, op, ...rest] = p.split('.');
      const val = rest.join('.');
      return (r: R) => op === 'eq' ? String(r[col]) === val : op === 'is' ? r[col] == null : op === 'in' ? val.replace(/[()]/g, '').split(',').includes(String(r[col])) : op === 'lte' ? r[col] != null && String(r[col]) <= val : false;
    });
  };
  const from = (table: string) => {
    const preds: Array<(r: R) => boolean> = [];
    const log: string[] = [];
    calls.push({ table, filters: log });
    const q: any = {
      select: () => q, order: () => q, limit: () => q,
      eq: (c: string, v: unknown) => { log.push(`${c}=${v}`); preds.push((r) => r[c] === v); return q; },
      neq: (c: string, v: unknown) => { preds.push((r) => r[c] != null && r[c] !== v); return q; },
      in: (c: string, v: unknown[]) => { log.push(`${c} in ${v.length}`); preds.push((r) => v.includes(r[c])); return q; },
      is: (c: string, v: unknown) => { preds.push((r) => (r[c] ?? null) === v); return q; },
      not: (c: string, op: string, v: string) => { preds.push((r) => op === 'is' ? r[c] != null : !v.replace(/[()]/g, '').split(',').includes(String(r[c]))); return q; },
      lte: (c: string, v: string) => { preds.push((r) => r[c] != null && String(r[c]) <= v); return q; },
      gte: (c: string, v: string) => { preds.push((r) => r[c] != null && String(r[c]) >= v); return q; },
      gt: (c: string, v: string) => { preds.push((r) => r[c] != null && String(r[c]) > v); return q; },
      or: (expr: string) => { log.push(`or ${expr}`); const ps = parseOr(expr); preds.push((r) => ps.some((p) => p(r))); return q; },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        if (missing.includes(table)) return Promise.resolve({ data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } }).then(res, rej);
        if (fail.includes(table)) return Promise.resolve({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }).then(res, rej);
        return Promise.resolve({ data: (tables[table] || []).filter((r) => preds.every((p) => p(r))), error: null }).then(res, rej);
      },
    };
    return q;
  };
  return { db: { from }, calls };
}

const TEN = 'tenant-1', OTHER = 'tenant-2', ME = 'user-me';
const world: Record<string, R[]> = {
  projects: [
    { id: CR, tenant_id: TEN, name: 'Copper Ridge Data Center Phase II — Critical Environment Controls', status: 'active', start_date: '2026-11-02', deleted_at: null },
    { id: PIMA, tenant_id: TEN, name: 'Pima County Adult Detention Center — BAS Modernization', status: 'completed', start_date: '2026-04-20', deleted_at: null },
    { id: 'proj-x', tenant_id: OTHER, name: 'Someone Else', status: 'active', deleted_at: null },
  ],
  work_assignments: [],
  bid_packages: [
    ...pkgs.map((p) => ({ ...p, tenant_id: TEN, deleted_at: null, created_by: 'owner' })),
    { id: 'foreign', tenant_id: OTHER, project_id: 'proj-x', name: 'Not yours', status: 'open', due_date: null, sub_portal_enabled: false, deleted_at: null },
  ],
  bid_package_invites: invites.map((i) => ({ ...i, tenant_id: TEN })),
  project_todos: [
    { id: 'td1', tenant_id: TEN, project_id: CR, title: 'Call the CRAC vendor', status: 'pending', assigned_to: ME, due_date: '2026-10-10' },
    { id: 'td2', tenant_id: TEN, project_id: CR, title: 'Already done', status: 'Complete', assigned_to: ME, due_date: '2026-10-09' },
    { id: 'td3', tenant_id: TEN, project_id: PIMA, title: 'Old job chore', status: 'pending', assigned_to: ME, due_date: '2026-10-09' },
  ],
  schedule_tasks: [],
  my_work_snoozes: [{ tenant_id: TEN, user_id: ME, item_key: 'bid-due-date:hsgc', until: '2026-10-12' }],
};
const args = { tenantId: TEN, userId: ME, email: 'pm@zz.test', today: T, zone: 'America/Phoenix' };

(async () => {
  const owner = await collectMyWork({ ...args, db: fakeDb(world).db, companyWide: true });
  const ok = owner.items.map((i) => i.key).sort();
  check('owner: the company\'s bid work, including the open package on the finished Pima job; never another tenant\'s',
    ok.includes('bid-link:crac') && ok.includes('bid-remind:cont') && ok.includes('bid-invite:hsgc') && !ok.some((k) => k.includes('foreign')), ok.join(' '));
  check('a snoozed item comes back from the server as a snooze, and the view hides it', !buildView(owner.items, owner.snoozes, T).today.rest.some((i) => i.key === 'bid-due-date:hsgc'));
  check('work on a finished job (a to-do on Pima) is not on the list', !owner.items.some((i) => i.key === 'todo:td3'));
  check('owner: the job start shows with "no schedule tasks yet"', owner.items.some((i) => i.key === `job-start:${CR}` && i.meta.startsWith('No schedule tasks yet')));
  check("a to-do completed as 'Complete' (capital C) stays off the list", owner.items.some((i) => i.key === 'todo:td1') && !owner.items.some((i) => i.key === 'todo:td2'));
  check('snoozes are read for this person and the list says Snooze works', owner.snoozeReady && owner.snoozes.length === 1 && owner.failures.length === 0);

  const pmDb = fakeDb(world);
  const pm = await collectMyWork({ ...args, db: pmDb.db, companyWide: false });
  check('someone with no assignments sees their own to-do, not the company\'s bids', pm.items.some((i) => i.key === 'todo:td1') && !pm.items.some((i) => i.source === 'bids'), pm.items.map((i) => i.key).join(' '));
  check('every table read is tenant-scoped', pmDb.calls.every((c) => c.filters.includes(`tenant_id=${TEN}`)), pmDb.calls.filter((c) => !c.filters.includes(`tenant_id=${TEN}`)).map((c) => c.table).join(','));

  const assignedWorld = { ...world, work_assignments: [{ tenant_id: TEN, project_id: CR, assignee_user_id: ME, role: 'project_manager', status: 'active' }] };
  const pm2 = await collectMyWork({ ...args, db: fakeDb(assignedWorld).db, companyWide: false });
  check('a PM put on Copper Ridge sees its bid work', pm2.items.some((i) => i.key === 'bid-link:crac') && pm2.assigned === 1);
  const viewerWorld = { ...world, work_assignments: [{ tenant_id: TEN, project_id: CR, assignee_user_id: ME, role: 'viewer', status: 'active' }] };
  const viewer = await collectMyWork({ ...args, db: fakeDb(viewerWorld).db, companyWide: false });
  check('a viewer on the job does not get its bids to run', !viewer.items.some((i) => i.source === 'bids'));
  const superWorld = { ...world, projects: world.projects.map((p) => (p.id === CR ? { ...p, start_date: '2026-10-01' } : p)), work_assignments: [{ tenant_id: TEN, project_id: CR, assignee_user_id: ME, role: 'superintendent', status: 'active' }], daily_logs: [] };
  const sup = await collectMyWork({ ...args, db: fakeDb(superWorld).db, companyWide: false });
  check("a superintendent on a started job owes today's daily log", sup.items.some((i) => i.key === `daily-log:${CR}:${T}` && i.now));
  const filed = await collectMyWork({ ...args, db: fakeDb({ ...superWorld, daily_logs: [{ tenant_id: TEN, project_id: CR, log_date: T, deleted_at: null }] }).db, companyWide: false });
  check('…and not once it is filed', !filed.items.some((i) => i.source === 'daily_logs'));

  const broken = await collectMyWork({ ...args, db: fakeDb(world, ['rfis', 'pay_applications'], ['my_work_snoozes']).db, companyWide: true });
  check('a failing source is named and the rest still comes back', broken.failures.includes('rfis') && broken.failures.includes('pay_apps') && broken.items.some((i) => i.key === 'bid-link:crac'), broken.failures.join(','));
  check('no snooze table yet → Snooze hidden, not a failure', broken.snoozeReady === false && !broken.failures.some((f) => String(f) === 'snoozes'));

  let threw = false;
  try { await collectMyWork({ ...args, db: fakeDb(world, ['projects']).db, companyWide: true }); } catch { threw = true; }
  check('no projects read → the whole read fails (the page says so and offers Retry)', threw);

  const badge = await collectMyWork({ ...args, db: fakeDb(world).db, companyWide: true, scope: 'today' });
  check('the badge path counts what the Today tab counts', todayCount(badge.items, badge.snoozes, T) === buildView(owner.items, owner.snoozes, T).counts.today, `${todayCount(badge.items, badge.snoozes, T)} vs ${buildView(owner.items, owner.snoozes, T).counts.today}`);
  check('…and skips the far-off reads', !badge.items.some((i) => i.source === 'jobs' || i.key.startsWith('bids-due:')));

  /* Sales follow-ups: an owner also sees the team's due/overdue calls, each
     named with whose it is; a non-admin keeps their own queue. */
  const leadWorld = {
    ...world,
    profiles: [{ id: 'user-jo', tenant_id: TEN, full_name: 'Jo Rivera' }],
    lead_pipeline: [
      { id: 'L-mine', tenant_id: TEN, company_name: 'Mesa Health', next_action: 'Send the proposal', next_action_date: '2026-10-12', stage: 'Qualified', assigned_to: ME },
      { id: 'L-team-late', tenant_id: TEN, company_name: 'Tempe Labs', next_action: 'Call back', next_action_date: '2026-10-08', stage: 'Proposal', assigned_to: 'user-jo' },
      { id: 'L-team-later', tenant_id: TEN, company_name: 'Gilbert Storage', next_action: 'Site walk', next_action_date: '2026-10-15', stage: 'New', assigned_to: 'user-jo' },
      { id: 'L-team-won', tenant_id: TEN, company_name: 'Done Deal', next_action: 'Kickoff', next_action_date: '2026-10-05', stage: 'Won', assigned_to: 'user-jo' },
      { id: 'L-other-tenant', tenant_id: OTHER, company_name: 'Not ours', next_action: 'x', next_action_date: '2026-10-01', stage: 'New', assigned_to: 'user-jo' },
    ],
  };
  const ownerLeads = await collectMyWork({ ...args, db: fakeDb(leadWorld).db, companyWide: true });
  const lk = ownerLeads.items.filter((i) => i.source === 'followups');
  check("owner: own follow-up plus the team's overdue one, labeled with the assignee",
    lk.some((i) => i.key === 'lead:L-mine') && lk.some((i) => i.key === 'lead:L-team-late' && i.meta.startsWith("Jo Rivera's follow-up")), lk.map((i) => `${i.key}|${i.meta}`).join(' '));
  check("owner: a teammate's not-yet-due, won, or other-company follow-up is not shown",
    !lk.some((i) => ['lead:L-team-later', 'lead:L-team-won', 'lead:L-other-tenant'].includes(i.key)));
  const pmLeads = await collectMyWork({ ...args, db: fakeDb(leadWorld).db, companyWide: false });
  check('non-admin: only their own (and unassigned) follow-ups', pmLeads.items.filter((i) => i.source === 'followups').map((i) => i.key).join(',') === 'lead:L-mine');

  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  if (failed) process.exit(1);
})();
