/**
 * Owner Home alert ticker.
 * Run: npx -y tsx lib/home/ticker.sanity.test.ts   (exit 0 = every assertion held)
 */
import { buildTicker, zonedMidnightIso } from './ticker';
import type { QueueItem } from './rank';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const q = (id: string, sourceType: string, tier: QueueItem['tier'], projectId: string | null, extra: Partial<QueueItem> = {}): QueueItem => ({
  id, sourceType, sourceId: id, title: id, projectId, projectName: projectId ? `Job ${projectId}` : null,
  owner: null, dueAt: null, tier, reason: '', actionLabel: 'Open', href: `/app/projects/${projectId}/x`, updatedAt: null, ...extra,
});

const items: QueueItem[] = [
  q('rfi:1', 'rfi', 2, 'A'), q('rfi:2', 'rfi', 2, 'A'), q('rfi:3', 'rfi', 2, 'B'),
  q('insp:1', 'inspection', 0, 'A'),
  q('punch:1', 'punch', 3, 'A'), q('punch:2', 'punch', 4, 'A'),
  q('change_order:1', 'change_order', 4, 'B'), q('change_order:2', 'change_order', 2, 'B'),
  q('todo:9', 'todo', 5, 'A'),
  q('group:coi-expired', 'coi', 2, null, { title: '2 insurance certificates expired', count: 2, href: '/app/compliance' }),
  q('group:coi-expiring', 'coi', 4, null, { title: '1 insurance certificate expire within 30 days', count: 1, href: '/app/compliance' }),
  q('group:w9', 'w9', 5, null, { title: '3 W-9s not returned', count: 3, href: '/app/compliance' }),
];
const t = buildTicker({
  items,
  review: [{ projectId: 'A', projectName: 'Desert Vista Medical Plaza', sender: 'ABC Electric', photos: 6, videos: 1, toGc: true }],
  done: { logs: 2, photos: 0, punchClosed: 1 },
});
const texts = t.items.map((i) => `${i.tone}:${i.text}`);

check('RFIs roll up per job', texts.includes('red:2 RFIs past response date · Job A') && texts.includes('red:1 RFI past response date · Job B'), texts.join(' | '));
check('failed inspection is its own red line', texts.includes('red:Failed inspection · Job A'));
check('stale change order is red, waiting one is yellow', texts.includes('red:1 change order waiting 14+ days for a decision · Job B') && texts.includes('yellow:1 change order waiting for your decision · Job B'));
check('due today and due this week are separate yellow lines', texts.includes('yellow:1 punch item due today · Job A') && texts.includes('yellow:1 punch item due this week · Job A'));
check('expired COIs are red, expiring COIs yellow', texts.includes('red:2 insurance certificates expired') && texts.some((x) => x.startsWith('yellow:1 insurance certificate expire')));
check('info-tier items (no deadline, W-9s) stay off the ticker', !texts.some((x) => x.includes('to-do') || x.includes('W-9')));
check('sub photos to review read who / what / where', texts.includes('review:ABC Electric sent you 6 photos & 1 video to review · Desert Vista Medical Plaza'));
check('review links to the job inbox', t.items.find((i) => i.tone === 'review')?.href === '/app/projects/A/photos?inbox=1');
check('done today is green', texts.includes('green:2 daily logs in today') && texts.includes('green:1 punch item closed today') && !texts.some((x) => x.includes('photo & video added')));
check('order: red, review, yellow, green', (() => {
  const order = ['red', 'review', 'yellow', 'green'];
  const idx = t.items.map((i) => order.indexOf(i.tone));
  return idx.every((v, i) => i === 0 || v >= idx[i - 1]);
})(), t.items.map((i) => i.tone).join(','));
check('summary counts records, not lines', t.summary.red === 2 + 1 + 1 + 1 + 2 && t.summary.review === 7 && t.summary.green === 3, JSON.stringify(t.summary));
check('no "all clear" when something is red', !texts.some((x) => x.includes('All clear')));

const quiet = buildTicker({ items: [q('todo:1', 'todo', 5, 'A')], review: [], done: { logs: 0, photos: 0, punchClosed: 0 } });
check('nothing pending → one green all-clear line', quiet.items.length === 1 && quiet.items[0].tone === 'green' && quiet.items[0].text.startsWith('All clear'));

const many = buildTicker({ items: Array.from({ length: 60 }, (_, i) => q(`rfi:${i}`, 'rfi', 2, `P${i}`)), review: [], done: null });
check('capped so the strip stays readable', many.items.length === 18);

check('long job names are shortened', buildTicker({ items: [q('rfi:x', 'rfi', 2, 'L', { projectName: 'An Extremely Long Project Name For A Hospital Wing' })], review: [], done: null }).items[0].text.endsWith('…'));

// zonedMidnightIso: Phoenix is UTC-7 all year.
check('Phoenix midnight → 07:00Z', zonedMidnightIso('2026-10-06', 'America/Phoenix') === '2026-10-06T07:00:00.000Z', zonedMidnightIso('2026-10-06', 'America/Phoenix'));
check('UTC midnight stays midnight', zonedMidnightIso('2026-10-06', 'UTC') === '2026-10-06T00:00:00.000Z');
check('bad zone falls back to UTC', zonedMidnightIso('2026-10-06', 'Not/AZone') === '2026-10-06T00:00:00.000Z');

if (failed) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
console.log('\nall ticker assertions held');
