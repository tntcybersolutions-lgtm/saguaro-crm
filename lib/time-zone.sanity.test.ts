/**
 * Each company's own time zone — days, day ranges and deadlines in any zone.
 * Run: npx -y tsx lib/time-zone.sanity.test.ts   (also with TZ=America/Phoenix and TZ=Pacific/Kiritimati)
 */
import {
  isTimeZone, dayIn, startOfDayIn, dayRangeIn, endOfDayIn, zoneOffsetMs, requestTimeZone, TIME_ZONE_HEADER,
  addDays, monthOf, requestDay, companyDay, companyTimeZones, companyDayLookup,
} from './time-zone';

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

// ── calendar arithmetic (no zone inside) ──
check('addDays +30 from Iowa\'s Oct 10', addDays('2026-10-10', 30) === '2026-11-09');
check('addDays crosses a year', addDays('2026-12-25', 10) === '2027-01-04');
check('addDays backwards', addDays('2026-03-01', -1) === '2026-02-28');
check('addDays across the spring DST change is still +20 days', addDays('2026-03-01', 20) === '2026-03-21');
check('addDays leap day', addDays('2028-02-28', 1) === '2028-02-29');
check('monthOf October', JSON.stringify(monthOf('2026-10-10')) === JSON.stringify({ first: '2026-10-01', last: '2026-10-31' }));
check('monthOf February (leap year)', monthOf('2028-02-15').last === '2028-02-29');
check('monthOf December', monthOf('2026-12-31').last === '2026-12-31');

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

  // requestDay: the Iowa GC at 7:30 PM Central gets Oct 10 — from the device, or the company when the device is silent.
  const warns: string[] = [];
  const origWarn = console.warn;
  console.warn = (...a: unknown[]) => { warns.push(a.join(' ')); };
  try {
    const d1 = await requestDay(h('America/Chicago'), db('America/Phoenix'), 't1', 'test', evening);
    check('requestDay: Iowa device at 7:30 PM Central → Oct 10', d1.today === '2026-10-10' && d1.zone === 'America/Chicago' && d1.source === 'device', JSON.stringify(d1));
    const d2 = await requestDay(null, db('America/Chicago'), 't1', 'test', evening);
    check('requestDay: no header, Iowa company → Oct 10', d2.today === '2026-10-10' && d2.source === 'company', JSON.stringify(d2));
    const d3 = await requestDay(null, db('America/Phoenix'), 't1', 'test', evening);
    check('requestDay: a Phoenix company keeps its own day (5:30 PM Oct 10)', d3.today === '2026-10-10' && d3.zone === 'America/Phoenix');
    const lateIowa = new Date('2026-10-11T05:30:00Z'); // 12:30 AM Central Oct 11 = 10:30 PM Phoenix Oct 10
    check('requestDay: after midnight in Iowa the Iowa company is on Oct 11 …', (await requestDay(null, db('America/Chicago'), 't1', 'test', lateIowa)).today === '2026-10-11');
    check('… while a Phoenix company is still on Oct 10', (await requestDay(null, db('America/Phoenix'), 't1', 'test', lateIowa)).today === '2026-10-10');
    warns.length = 0;
    const d4 = await requestDay(null, db(null), 't1', 'zz-scope', evening);
    check('requestDay: nothing known → the UTC day, and it is logged', d4.today === '2026-10-11' && d4.source === 'utc' && warns.some((w) => w.includes('zz-scope')), JSON.stringify({ d4, warns }));
    warns.length = 0;
    await requestDay(h('America/Chicago'), db(null), 't1', 'zz-scope', evening);
    check('requestDay: a known zone logs nothing', warns.length === 0);

    const c1 = await companyDay(db('America/Chicago'), 't1', 'cron', evening);
    check('companyDay: Iowa company at 7:30 PM Central → Oct 10', c1.today === '2026-10-10' && c1.source === 'company');
    warns.length = 0;
    const c2 = await companyDay(db(null), 't1', 'zz-cron', evening);
    check('companyDay: no zone → UTC day, logged', c2.today === '2026-10-11' && c2.source === 'utc' && warns.some((w) => w.includes('zz-cron')));

    // companyTimeZones / companyDayLookup: one read for many companies, each on its own day.
    const rows = [{ id: 'iowa', time_zone: 'America/Chicago' }, { id: 'phx', time_zone: 'America/Phoenix' }, { id: 'junk', time_zone: 'Phoenix' }, { id: 'none', time_zone: null }];
    let inIds: string[] = [];
    const manyDb = { from: () => ({ select: () => ({ in: async (_c: string, ids: string[]) => { inIds = ids; return { data: rows.filter((r) => ids.includes(r.id)), error: null }; } }) }) };
    const zones = await companyTimeZones(manyDb, ['iowa', 'phx', 'iowa', 'junk', 'none', '']);
    check('companyTimeZones: one read, ids de-duplicated', JSON.stringify(inIds) === JSON.stringify(['iowa', 'phx', 'junk', 'none']), JSON.stringify(inIds));
    check('companyTimeZones: real zones only', zones.get('iowa') === 'America/Chicago' && zones.get('phx') === 'America/Phoenix' && !zones.has('junk') && !zones.has('none'));
    check('companyTimeZones: no ids → no read', (await companyTimeZones({ from: () => { throw new Error('read'); } }, [])).size === 0);
    warns.length = 0;
    const todayOf = companyDayLookup(zones, 'zz-lookup', lateIowa);
    check('companyDayLookup: Iowa Oct 11, Phoenix Oct 10 at the same instant', todayOf('iowa') === '2026-10-11' && todayOf('phx') === '2026-10-10');
    check('companyDayLookup: a company with no zone → UTC day, logged once', todayOf('none') === '2026-10-11' && todayOf('none') === '2026-10-11' && warns.filter((w) => w.includes('zz-lookup')).length === 1, String(warns.length));
  } finally {
    console.warn = origWarn;
  }

  if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
  console.log('\nall passed');
})();
