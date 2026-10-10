/**
 * Date-only expiries are calendar days — valid through the end of the day.
 * Run: npx -y tsx lib/calendar-day.sanity.test.ts   (exit 0 = every assertion held)
 * Also run it with TZ=America/Phoenix: the device-clock checks change with the zone.
 */
import {
  daysOnEarth, dayInZone, daysUntilDay, isPastDay, localDay, plausibleToday, toDay, HOME_TIME_ZONE, LOCAL_DAY_HEADER,
} from './calendar-day';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

/** The check the sub portal and the invoice gate used to make. */
const oldStillValid = (expiry: string, now: Date) => new Date(expiry).getTime() > now.getTime();

// ── Reading a day ──
check('plain day', toDay('2026-10-10') === '2026-10-10');
check('date part of a timestamp', toDay('2026-10-10T07:00:00Z') === '2026-10-10');
check('padded value', toDay(' 2026-10-10 ') === '2026-10-10');
check('Feb 30 is not a day', toDay('2026-02-30') === null);
check('Feb 29 in a leap year is', toDay('2028-02-29') === '2028-02-29');
check('trailing digits refused', toDay('2026-10-100') === null);
check('free text refused', toDay('next week') === null);
check('null / number refused', toDay(null) === null && toDay(20261010) === null);

// ── Counting days ──
check('same day → 0', daysUntilDay('2026-10-10', '2026-10-10') === 0);
check('tomorrow → 1', daysUntilDay('2026-10-11', '2026-10-10') === 1);
check('yesterday → -1', daysUntilDay('2026-10-09', '2026-10-10') === -1);
check('30 days out', daysUntilDay('2026-11-09', '2026-10-10') === 30);
check('across the US DST change (Nov 1)', daysUntilDay('2026-11-02', '2026-10-31') === 2);
check('across the spring DST change (Mar 8 2026)', daysUntilDay('2026-03-09', '2026-03-07') === 2);
check('across a year end', daysUntilDay('2027-01-01', '2026-12-31') === 1);
check('across Feb 29', daysUntilDay('2028-03-01', '2028-02-28') === 2);
check('invalid day → null', daysUntilDay('2026-02-30', '2026-10-10') === null && daysUntilDay('2026-10-10', 'today') === null);

check('expiry today is not past', !isPastDay('2026-10-10', '2026-10-10'));
check('expiry yesterday is past', isPastDay('2026-10-09', '2026-10-10'));
check('expiry tomorrow is not past', !isPastDay('2026-10-11', '2026-10-10'));
check('no expiry is not past', !isPastDay(null, '2026-10-10') && !isPastDay('', '2026-10-10'));

// ── Phoenix (UTC−7 all year, no DST) — the reported failure ──
// 8:30 PM on Oct 10 in Phoenix, a COI that expires Oct 10.
const phxEvening = new Date('2026-10-11T03:30:00Z');
check('Phoenix evening is still Oct 10', dayInZone('America/Phoenix', phxEvening) === '2026-10-10');
check('old check called it expired that evening', !oldStillValid('2026-10-10', phxEvening));
check('Phoenix evening: expiry day not past', !isPastDay('2026-10-10', dayInZone('America/Phoenix', phxEvening)));
check('Phoenix evening: 0 days left', daysUntilDay('2026-10-10', dayInZone('America/Phoenix', phxEvening)) === 0);

// 8 AM on the last day.
const phxMorning = new Date('2026-10-10T15:00:00Z');
check('old check called it expired all through the last day', !oldStillValid('2026-10-10', phxMorning));
check('Phoenix morning of the last day: not past', !isPastDay('2026-10-10', dayInZone('America/Phoenix', phxMorning)));

// 6 PM the evening BEFORE the last day.
const phxEveBefore = new Date('2026-10-10T01:00:00Z');
check('Phoenix evening before is Oct 9', dayInZone('America/Phoenix', phxEveBefore) === '2026-10-09');
check('old check called it expired the evening before', !oldStillValid('2026-10-10', phxEveBefore));
check('evening before: 1 day left', daysUntilDay('2026-10-10', dayInZone('America/Phoenix', phxEveBefore)) === 1);

// 12:30 AM Oct 11 in Phoenix — now it has lapsed.
const phxAfter = new Date('2026-10-11T07:30:00Z');
check('just after midnight Phoenix: past', isPastDay('2026-10-10', dayInZone('America/Phoenix', phxAfter)));
check('just after midnight Phoenix: -1 day', daysUntilDay('2026-10-10', dayInZone('America/Phoenix', phxAfter)) === -1);

check('DST zone reads its own day (New York 12:30 AM Nov 1)', dayInZone('America/New_York', new Date('2026-11-01T04:30:00Z')) === '2026-11-01');

// ── Server "today": the portal's claimed day, within reason ──
check('header name', LOCAL_DAY_HEADER === 'x-local-day');
check('home zone is Phoenix', HOME_TIME_ZONE === 'America/Phoenix');
const earth = daysOnEarth(phxEvening);
check('days on Earth at 03:30Z Oct 11', earth.earliest === '2026-10-10' && earth.latest === '2026-10-11', JSON.stringify(earth));
check('Phoenix sub’s day accepted', plausibleToday('2026-10-10', phxEvening) === '2026-10-10');
check('a day it is somewhere else accepted', plausibleToday('2026-10-11', phxEvening) === '2026-10-11');
check('a week ago refused → Phoenix day', plausibleToday('2026-10-03', phxEvening) === '2026-10-10');
check('a day not yet begun anywhere refused', plausibleToday('2026-10-12', phxEvening) === '2026-10-10');
check('no header → Phoenix day', plausibleToday(null, phxEvening) === '2026-10-10');
check('timestamp-shaped header refused', plausibleToday('2026-10-11T00:00', phxEvening) === '2026-10-10');
check('Feb 30 header refused', plausibleToday('2026-02-30', new Date('2026-03-01T12:00:00Z')) === dayInZone('America/Phoenix', new Date('2026-03-01T12:00:00Z')));
// 10:30 PM Oct 10 in Honolulu — already Oct 11 in Phoenix. The sub's own day governs.
const hnlLate = new Date('2026-10-11T08:30:00Z');
check('Phoenix has moved on', dayInZone('America/Phoenix', hnlLate) === '2026-10-11');
check('Honolulu sub’s last day accepted', plausibleToday('2026-10-10', hnlLate) === '2026-10-10');
check('Honolulu sub not past on the last day', !isPastDay('2026-10-10', plausibleToday('2026-10-10', hnlLate)));

// ── The device's own clock ──
check('local 11:59 PM is that day', localDay(new Date(2026, 9, 10, 23, 59)) === '2026-10-10');
check('local 12:01 AM is that day', localDay(new Date(2026, 9, 10, 0, 1)) === '2026-10-10');
check('local day pads month and day', localDay(new Date(2026, 0, 5, 12)) === '2026-01-05');
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
if (zone === 'America/Phoenix') {
  check('[TZ=America/Phoenix] device day at 8:30 PM is Oct 10', localDay(phxEvening) === '2026-10-10');
  check('[TZ=America/Phoenix] device day matches the zone day', localDay(phxAfter) === dayInZone('America/Phoenix', phxAfter));
} else if (zone === 'UTC' || zone === 'Etc/UTC') {
  check('[TZ=UTC] device day at 03:30Z is Oct 11', localDay(phxEvening) === '2026-10-11');
} else {
  check(`[TZ=${zone}] device day matches the zone day`, localDay(phxEvening) === dayInZone(zone, phxEvening));
}
console.log(`(device zone: ${zone})`);

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nall calendar-day checks passed');
