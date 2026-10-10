/**
 * The Settings time-zone picker's list and search.
 * Run: bundle with esbuild and run with node (also under TZ=America/Phoenix, America/Chicago, Pacific/Kiritimati —
 * nothing here may depend on the machine's zone).
 */
import { US_ZONES, searchZones, supportedZones, timeIn, zoneChoices, zoneLabel, zoneName } from './time-zone-choices';
import { isTimeZone } from './time-zone';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const all = zoneChoices();
check('the seven US zones come first, east to west',
  all.slice(0, 7).map((c) => c.zone).join() === 'America/New_York,America/Chicago,America/Denver,America/Phoenix,America/Los_Angeles,America/Anchorage,Pacific/Honolulu',
  all.slice(0, 7).map((c) => c.zone).join());
check('friendly names', all.slice(0, 7).map((c) => c.name).join('|') === 'Eastern|Central|Mountain|Arizona (no DST)|Pacific|Alaska|Hawaii');
check('every US zone is a real zone', US_ZONES.every((z) => isTimeZone(z.zone)));
check('the runtime lists hundreds of zones', supportedZones().length > 300, String(supportedZones().length));
check('the full list holds every runtime zone once', all.length >= supportedZones().length && new Set(all.map((c) => c.zone)).size === all.length);
check('after the US zones, A→Z', (() => { const rest = all.slice(7).map((c) => c.zone); return rest.every((z, i) => i === 0 || rest[i - 1].localeCompare(z) <= 0); })());
check('no US zone repeats in the rest', !all.slice(7).some((c) => c.us));
check('an extra zone the runtime leaves out is still listed', zoneChoices(['Europe/London'], ['UTC']).some((c) => c.zone === 'UTC'));
check('an empty runtime list still offers the US zones', zoneChoices([]).length === 7);

const names = (q: string) => searchZones(all, q).map((c) => c.zone);
check('"Iowa" → Central only', JSON.stringify(names('Iowa')) === JSON.stringify(['America/Chicago']), JSON.stringify(names('Iowa')));
check('"central" → Central first', names('central')[0] === 'America/Chicago');
check('"des moines" → Central', names('des moines')[0] === 'America/Chicago');
check('"arizona" → Arizona (no DST)', names('arizona')[0] === 'America/Phoenix');
check('"phoenix" → Arizona', names('phoenix').includes('America/Phoenix'));
check('"denver" → Mountain', names('denver')[0] === 'America/Denver');
check('"london" → Europe/London', names('london').includes('Europe/London'));
check('"buenos aires" → the Argentina zone', names('buenos aires').some((z) => z.endsWith('Buenos_Aires')));
check('"America/Chicago" by its id', names('America/Chicago')[0] === 'America/Chicago');
check('blank search → everything', searchZones(all, '   ').length === all.length);
check('nonsense → nothing', names('zzzzqq').length === 0);

check('label: US', zoneLabel('America/Chicago') === 'Central (America/Chicago)');
check('label: world', zoneLabel('America/Argentina/Buenos_Aires') === 'Buenos Aires (America/Argentina/Buenos_Aires)');
check('name: Arizona', zoneName('America/Phoenix') === 'Arizona (no DST)');
check('name: none', zoneName(null) === '' && zoneLabel(undefined) === '');

// 7:30 PM Central on Oct 10 = 00:30 UTC Oct 11.
const evening = new Date('2026-10-11T00:30:00Z');
check('time in Central at 00:30Z is 7:30 PM', timeIn('America/Chicago', evening) === '7:30 PM', timeIn('America/Chicago', evening));
check('time in Arizona at 00:30Z is 5:30 PM', timeIn('America/Phoenix', evening) === '5:30 PM');
check('time in a junk zone is blank, not a throw', timeIn('Mars/Base', evening) === '');

console.log(`(machine zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone})`);
if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
