/**
 * punchTime — when a punch happened. Server clock, except a punch kept on the
 * phone with no signal: its tap time, if in the past and no older than 72 h.
 * Run: npx -y tsx lib/timeclock/punch-time.sanity.test.ts   (exit 0 = every assertion held)
 */
import { punchTime } from './server';
import { SAVED_AT_HEADER } from '../offline/saved-at';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const now = '2026-10-12T15:00:00.000Z';
const h = (v?: string) => new Headers(v === undefined ? {} : { [SAVED_AT_HEADER]: v });

check('no header → server time', JSON.stringify(punchTime(h(), now)) === JSON.stringify({ at: now, savedOffline: false }));
const twoHoursAgo = '2026-10-12T13:00:00.000Z';
const r1 = punchTime(h(twoHoursAgo), now);
check('kept 2 h on the phone → tap time, flagged', r1.at === twoHoursAgo && r1.savedOffline, JSON.stringify(r1));
check('older than 72 h → server time', punchTime(h('2026-10-09T14:00:00.000Z'), now).at === now);
check('exactly 72 h → still the tap time', punchTime(h('2026-10-09T15:00:00.000Z'), now).savedOffline);
check('in the future → server time (no clocking ahead)', punchTime(h('2026-10-12T16:00:00.000Z'), now).at === now);
const skew = punchTime(h('2026-10-12T15:00:30.000Z'), now);
check('30 s phone clock skew → capped at now', skew.at === now && skew.savedOffline, JSON.stringify(skew));
check('garbage header → server time', punchTime(h('yesterday-ish'), now).at === now);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
