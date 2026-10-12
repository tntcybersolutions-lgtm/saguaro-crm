/**
 * Calendar-sync feed format. Run: npx -y tsx lib/calendar/ics.sanity.test.ts
 */
import { buildIcs, icsText, fold } from './ics';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const now = new Date('2026-10-12T15:00:00Z');
const ics = buildIcs('Saguaro — Acme', [
  { uid: 't1', title: 'Framing, level 2; west', allDay: true, start: '2026-10-05', end: '2026-10-09', location: 'Mesa Flex' },
  { uid: 'i1', title: 'Inspection', allDay: false, startUtc: '2026-10-14T16:00:00Z', endUtc: '2026-10-14T17:00:00Z' },
  { uid: 'm1', title: 'OAC meeting', allDay: false, floatingStart: '2026-10-15T09:30:00', floatingEnd: '2026-10-15T10:30:00' },
  { uid: 'd1', title: 'One day', allDay: true, start: '2026-10-20', end: null },
], now);
const L = ics.split('\r\n');
check('wraps in VCALENDAR with CRLF', L[0] === 'BEGIN:VCALENDAR' && ics.endsWith('END:VCALENDAR\r\n'));
check('4 events', L.filter((l) => l === 'BEGIN:VEVENT').length === 4);
check('text escaped (comma, semicolon)', ics.includes('SUMMARY:Framing\\, level 2\; west'));
check('all-day end is exclusive (+1 day)', ics.includes('DTSTART;VALUE=DATE:20261005') && ics.includes('DTEND;VALUE=DATE:20261010'));
check('single all-day item spans its day', ics.includes('DTSTART;VALUE=DATE:20261020') && ics.includes('DTEND;VALUE=DATE:20261021'));
check('timed item in UTC', ics.includes('DTSTART:20261014T160000Z') && ics.includes('DTEND:20261014T170000Z'));
check('meeting floating local time', ics.includes('DTSTART:20261015T093000') && !ics.includes('DTSTART:20261015T093000Z'));
check('UIDs are global', ics.includes('UID:t1@saguarocontrol.net'));
check('newline escaped', icsText('a\nb') === 'a\\nb');
const long = fold('DESCRIPTION:' + 'x'.repeat(200));
check('long lines folded at 75', long.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75) && long.split('\r\n')[1].startsWith(' '));
if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
