/**
 * Home's alert line reads My Day's list (lib/home/day-ticker).
 * Run: npx -y tsx lib/home/day-ticker.sanity.test.ts   (exit 0 = every assertion held)
 */
import { dayTicker } from './day-ticker';
import type { MyWorkItem } from '@/lib/my-work';
import type { TickerItem } from './ticker';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const T = '2026-10-16';
let n = 0;
const item = (p: Partial<MyWorkItem>): MyWorkItem => ({
  key: `k:${++n}`, source: 'todos', title: 'Thing', meta: '', day: null, now: false, tone: 'grey', amount: null,
  href: '/x', action: null, done: null, projectId: null, ...p,
});
const late = item({ title: 'Answer RFI-4', source: 'rfis', day: '2026-10-13', projectId: 'p1' });
const nowRed = item({ title: 'Turn on the bid link', source: 'bids', now: true, tone: 'red' });
const today = item({ title: 'Host the framing inspection', source: 'inspections', day: T });
const waiting = item({ title: '2 bidders haven\'t answered', source: 'bids', day: '2026-10-20', action: { kind: 'remind', packageId: 'b', label: 'Remind', invites: [] } });
const rfiOut = item({ title: 'Get an answer on RFI-9', source: 'rfis', day: '2026-10-18' });
const later = item({ title: 'Submit shop drawings', source: 'submittals', day: '2026-11-20' });
const snoozed = item({ title: 'Snoozed late thing', day: '2026-10-10' });
const home = {
  items: [
    { id: 'review:a', tone: 'review', text: 'Acme posted 3 photos to review', href: '/r', count: 3 },
    { id: 'done:logs', tone: 'green', text: '1 daily log in today', href: '/d', count: 1 },
    { id: 't:red|rfi', tone: 'red', text: 'Home-only red line', href: '/h', count: 5 },
  ] as TickerItem[],
  summary: { red: 5, review: 3, yellow: 0, green: 1 },
};

const t = dayTicker(home, { today: T, items: [late, nowRed, today, waiting, rfiOut, later, snoozed], snoozes: [{ item_key: snoozed.key, until: '2026-10-17' }], jobs: { p1: { name: 'Pima County Admin Building Renovation', color: null } } });
check('late count is My Day\'s late (snoozed left out)', t.summary.red === 2, String(t.summary.red));
check('today count is My Day\'s today', t.summary.yellow === 1, String(t.summary.yellow));
check('waiting count is My Day\'s waiting', t.summary.waiting === 2, String(t.summary.waiting));
check('review and done come from Home', t.summary.review === 3 && t.summary.green === 1);
check('Home\'s own red lines are replaced by My Day\'s', !t.items.some((i) => i.id === 't:red|rfi'));
check('late first, then review, today, waiting, done', t.items.map((i) => i.tone).join(',') === 'red,red,review,yellow,waiting,waiting,green', t.items.map((i) => i.tone).join(','));
check('a line names its job, shortened', t.items.some((i) => i.text === 'Answer RFI-4 · Pima County Admin Building…'), t.items.map((i) => i.text).join(' | '));
check('later items are not on the line', !t.items.some((i) => i.text.startsWith('Submit shop')));
check('no All clear while work is open', !t.items.some((i) => i.id === 'clear'));

const clear = dayTicker({ items: [], summary: { red: 0, review: 0, yellow: 0, green: 0 } }, { today: T, items: [later] });
check('All clear only when nothing is late, due or waiting', clear.items[0]?.id === 'clear' && clear.summary.red === 0);

const fallback = dayTicker(home, null);
check('without My Day\'s list, Home\'s own feed shows', fallback.items.length === 3 && fallback.summary.red === 5);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
