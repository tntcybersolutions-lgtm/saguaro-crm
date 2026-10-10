/**
 * Each company's own time zone — days, day ranges and deadlines in any zone.
 * Run: npx -y tsx lib/time-zone.sanity.test.ts   (also with TZ=America/Phoenix and TZ=Pacific/Kiritimati)
 */
import { isTimeZone, dayIn, startOfDayIn, dayRangeIn, endOfDayIn, zoneOffsetMs, requestTimeZone, TIME_ZONE_HEADER, stateTimeZone, jobTimeZone } from './time-zone';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const iso = (d: Date) => d.toISOString();

check('real zones', isTimeZone('America/Chicago') && isTimeZone('America/Phoenix') && isTimeZone('UTC') && isTimeZone('Pacific/Honolulu'));
check('not zones', !isTimeZone('Mars/Olympus') && !isTimeZone('') && !isTimeZone(null) && !isTimeZone('America/Chicago; drop table') && !isTimeZone(42));

// 7:30 PM Central on Oct 10 = 00:30 UTC Oct 11 — still Oct 10 in Iowa, already Oct 11 in UTC.
const evening = new Date('2026-10-11T00:30:00Z');
check('Iowa evening is still Oct 10 in Chicago', dayIn('America/Chicago', evening) === '2026-10-10', dayIn('America/Chicago', evening));
check('…and Oct 10 in Phoenix (5:30 PM)', dayIn('America/Phoenix', evening) === '2026-10-10');
check('…but Oct 11 in UTC', dayIn('UTC', evening) === '2026-10-11');
check('Kiritimati is a day ahead', dayIn('Pacific/Kiritimati', new Date('2026-10-10T12:00:00Z')) === '2026-10-11');

check('Chicago offset in October is -5 h (CDT)', zoneOffsetMs('America/Chicago', evening) === -5 * 3600_000, String(zoneOffsetMs('America/Chicago', evening)));
check('Chicago offset in January is -6 h (CST)', zoneOffsetMs('America/Chicago', new Date('2026-01-15T12:00:00Z')) === -6 * 3600_000);
check('Phoenix never moves (-7 h)', zoneOffsetMs('America/Phoenix', new Date('2026-07-01T12:00:00Z')) === -7 * 3600_000 && zoneOffsetMs('America/Phoenix', new Date('2026-01-01T12:00:00Z')) === -7 * 3600_000);

check('Chicago midnight Oct 10 = 05:00 UTC', iso(startOfDayIn('America/Chicago', '2026-10-10')) === '2026-10-10T05:00:00.000Z', iso(startOfDayIn('America/Chicago', '2026-10-10')));
check('Phoenix midnight Oct 10 = 07:00 UTC', iso(startOfDayIn('America/Phoenix', '2026-10-10')) === '2026-10-10T07:00:00.000Z');
check('New York midnight Jan 5 = 05:00 UTC', iso(startOfDayIn('America/New_York', '2026-01-05')) === '2026-01-05T05:00:00.000Z');

const r = dayRangeIn('America/Chicago', '2026-10-10');
check('Chicago Oct 10 is 24 h', r.to.getTime() - r.from.getTime() === 24 * 3600_000);
const spring = dayRangeIn('America/New_York', '2026-03-08');
check('spring-forward day is 23 h', spring.to.getTime() - spring.from.getTime() === 23 * 3600_000, String((spring.to.getTime() - spring.from.getTime()) / 3600_000));
const fall = dayRangeIn('America/New_York', '2026-11-01');
check('fall-back day is 25 h', fall.to.getTime() - fall.from.getTime() === 25 * 3600_000, String((fall.to.getTime() - fall.from.getTime()) / 3600_000));
check('the 7:30 PM Iowa punch falls in Chicago Oct 10', evening >= r.from && evening < r.to);

check('a bid due Oct 20 in Iowa closes 11:59:59.999 PM Central', iso(endOfDayIn('America/Chicago', '2026-10-20')) === '2026-10-21T04:59:59.999Z', iso(endOfDayIn('America/Chicago', '2026-10-20')));
check('…and in Phoenix at 06:59:59.999 UTC', iso(endOfDayIn('America/Phoenix', '2026-10-20')) === '2026-10-21T06:59:59.999Z');
check('month end rolls over', iso(dayRangeIn('UTC', '2026-12-31').to) === '2027-01-01T00:00:00.000Z');

(async () => {
  const h = (v: string | null) => ({ get: (n: string) => (n === TIME_ZONE_HEADER ? v : null) });
  const db = (tz: string | null, err: unknown = null) => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tz === undefined ? null : { time_zone: tz }, error: err }) }) }) }),
  });
  check('device zone wins', JSON.stringify(await requestTimeZone(h('America/Chicago'), db('America/New_York'), 't1')) === JSON.stringify({ zone: 'America/Chicago', source: 'device' }));
  check('bad header → company zone', JSON.stringify(await requestTimeZone(h('Nowhere/Land'), db('America/Chicago'), 't1')) === JSON.stringify({ zone: 'America/Chicago', source: 'company' }));
  check('no header → company zone', (await requestTimeZone(null, db('America/Denver'), 't1')).zone === 'America/Denver');
  check('nothing known → UTC, said so (never Phoenix)', JSON.stringify(await requestTimeZone(null, db(null), 't1')) === JSON.stringify({ zone: 'UTC', source: 'utc' }));
  check('junk stored company zone ignored', (await requestTimeZone(null, db('Phoenix'), 't1')).source === 'utc');
  let threw = false; try { await requestTimeZone(null, db(null, new Error('boom')), 't1'); } catch { threw = true; }
  check('a failed company read throws, not guesses', threw);

  // A job's deadlines: the company's zone, else the job's state, else UTC.
  check('Iowa job → Chicago', stateTimeZone('IA') === 'America/Chicago' && stateTimeZone(' iowa ') === 'America/Chicago');
  check('every state + DC has a zone', ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].every((c) => isTimeZone(stateTimeZone(c))));
  check('unknown state → null, not a home zone', stateTimeZone('') === null && stateTimeZone(null) === null && stateTimeZone('Ontario') === null);
  check('company zone beats job state', JSON.stringify(await jobTimeZone(db('America/Denver'), 't1', 'IA')) === JSON.stringify({ zone: 'America/Denver', source: 'company' }));
  check('no company zone → job state', JSON.stringify(await jobTimeZone(db(null), 't1', 'IA')) === JSON.stringify({ zone: 'America/Chicago', source: 'state' }));
  check('neither → UTC, said so', JSON.stringify(await jobTimeZone(db(null), 't1', '')) === JSON.stringify({ zone: 'UTC', source: 'utc' }));

  if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
  console.log('\nall passed');
})();
