/**
 * Home queue ranking sanity — pins the deterministic order the dashboard uses.
 * Run: npx -y tsx lib/home/rank.sanity.test.ts   (exit 0 = every assertion held)
 *
 * Includes the spec's Operations acceptance scenario (docs/SPEC-dashboard-
 * 2026-10-03.md §16): a blocked inspection today and an overdue RFI must rank
 * above a large volume of compliance reminders.
 */
import { addDays, daysBetween, dueReason, fmtMoneyShort, isMine, rankQueue, summarisePortfolio, tierForDue, ymdIn, type QueueItem } from './rank';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const today = '2026-10-03';

// tierForDue
check('no due date → info (5)', tierForDue(null, today) === 5);
check('yesterday → overdue (2)', tierForDue('2026-10-02', today) === 2);
check('today → due today (3), not overdue', tierForDue('2026-10-03', today) === 3);
check('timestamp today counts as today', tierForDue('2026-10-03T23:30:00Z', today) === 3);
check('in 7 days → this week (4)', tierForDue(addDays(today, 7), today) === 4);
check('in 8 days → info (5)', tierForDue(addDays(today, 8), today) === 5);
check('critical beats a date', tierForDue('2027-01-01', today, { critical: true }) === 0);
check('blocking beats a date', tierForDue(null, today, { blocking: true }) === 1);

// dates
check('addDays crosses months', addDays('2026-10-30', 3) === '2026-11-02');
check('daysBetween negative for past', daysBetween(today, '2026-10-01') === -2);
check('dueReason overdue wording', dueReason('2026-10-01', today) === '2 days overdue');
check('dueReason singular', dueReason('2026-10-02', today) === '1 day overdue');
check('dueReason missing deadline is honest', dueReason(null, today) === 'Deadline not set');
check('ymdIn returns YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(ymdIn('America/Phoenix')));
check('ymdIn respects timezone (Phoenix vs UTC near midnight)',
  ymdIn('America/Phoenix', new Date('2026-10-03T05:00:00Z')) === '2026-10-02' && ymdIn('UTC', new Date('2026-10-03T05:00:00Z')) === '2026-10-03');

// isMine
const me = { id: '11111111-2222-3333-4444-555555555555', email: 'Chad@TNTCyber.com', name: 'Chad Derocher' };
check('isMine by uuid', isMine([me.id], me));
check('isMine by email, case-insensitive', isMine(['chad@tntcyber.com'], me));
check('isMine by name', isMine(['chad derocher'], me));
check('isMine false for someone else', !isMine(['someone@else.com', null], me));

// ranking — Operations scenario
const base = (o: Partial<QueueItem> & Pick<QueueItem, 'id' | 'tier'>): QueueItem => ({
  sourceType: 'x', sourceId: o.id, title: o.id, projectId: null, projectName: null, owner: null,
  dueAt: null, reason: '', actionLabel: 'Open', href: '/', updatedAt: null, ...o,
});
const compliance = Array.from({ length: 40 }, (_, i) => base({ id: `w9:${i}`, tier: 5 }));
const items: QueueItem[] = [
  ...compliance,
  base({ id: 'group:coi-expiring', tier: 4, dueAt: '2026-10-20' }),
  base({ id: 'rfi:overdue', tier: 2, dueAt: '2026-09-30' }),
  base({ id: 'insp:today', tier: 1, dueAt: today }),
  base({ id: 'todo:today', tier: 3, dueAt: today }),
  base({ id: 'rfi:older-overdue', tier: 2, dueAt: '2026-09-20' }),
];
const ranked = rankQueue(items);
check('blocked inspection today ranks first', ranked[0].id === 'insp:today', ranked[0].id);
check('older overdue before newer overdue', ranked[1].id === 'rfi:older-overdue' && ranked[2].id === 'rfi:overdue', ranked.slice(1, 3).map(r => r.id).join(','));
check('due today after overdue', ranked[3].id === 'todo:today');
check('compliance volume stays below urgent work', ranked.slice(0, 5).every(r => !r.id.startsWith('w9:')));
check('top 5 fits the critical work', ranked.slice(0, 4).map(r => r.tier).join(',') === '1,2,2,3');

// dedupe
const dup = rankQueue([base({ id: 'rfi:1', tier: 2 }), base({ id: 'rfi:1', tier: 2 })]);
check('duplicate source records collapse to one row', dup.length === 1);

// tie-break by oldest update
const tie = rankQueue([
  base({ id: 'b', tier: 4, dueAt: '2026-10-05', updatedAt: '2026-10-02T00:00:00Z' }),
  base({ id: 'a', tier: 4, dueAt: '2026-10-05', updatedAt: '2026-09-01T00:00:00Z' }),
]);
check('same tier & due → oldest update first', tie[0].id === 'a');

// Owner hero money
check('$0 stays $0', fmtMoneyShort(0) === '$0');
check('under $10K in full', fmtMoneyShort(9999) === '$9,999');
check('thousands as K', fmtMoneyShort(475000) === '$475K');
check('rounds up into millions, not $1000K', fmtMoneyShort(999_500) === '$1M');
check('millions to two places', fmtMoneyShort(4_750_000) === '$4.75M');
check('no trailing zeros', fmtMoneyShort(5_000_000) === '$5M' && fmtMoneyShort(10_500_000) === '$10.5M');
check('$100M is not shown as $1M', fmtMoneyShort(100_000_000) === '$100M');

const jobs = [{ id: 'a', contract: 1_000_000 }, { id: 'b', contract: 500_000 }, { id: 'c', contract: 0 }];
const pf = summarisePortfolio(jobs, [
  { project_id: 'a', total_completed_stored: 100_000 },
  { project_id: 'a', total_completed_stored: '250000' }, // cumulative: latest app wins, not the sum
  { project_id: 'b', total_completed_stored: null },
  { project_id: 'c', total_completed_stored: 80_000 }, // no contract value → not counted
  { project_id: 'zzz', total_completed_stored: 9_999 }, // not an active job
  { project_id: null, total_completed_stored: 5 },
]);
check('contract total counts priced jobs', pf.total === 1_500_000 && pf.priced === 2, JSON.stringify(pf));
check('billed = latest cumulative per priced job', pf.billed === 250_000, JSON.stringify(pf));
check('no pay apps → nothing billed', summarisePortfolio(jobs, []).billed === 0);

if (failed) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
console.log('\nall home ranking assertions held');
