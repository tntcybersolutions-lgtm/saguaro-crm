/**
 * The GPS stamp on a jobsite photo: what counts as a coordinate, and how it reads.
 * Run: npx -y tsx lib/photo-gps.sanity.test.ts   (exit 0 = every assertion held)
 */
import { readFix, fixLabel, fixMapUrl } from './photo-gps';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

check('numbers are a fix', JSON.stringify(readFix(33.4484, -112.074)) === '{"lat":33.4484,"lng":-112.074}');
check('numeric strings (Postgres numeric) are a fix', JSON.stringify(readFix('33.4484', '-112.074')) === '{"lat":33.4484,"lng":-112.074}');
check('null is no fix', readFix(null, null) === null);
check('one side missing is no fix', readFix(33.4, undefined) === null);
check('text is no fix', readFix('north', 'yard') === null);
check('latitude past 90 is no fix', readFix(91, 0) === null);
check('longitude past 180 is no fix', readFix(0, -181) === null);
check('Infinity is no fix', readFix(Infinity, 0) === null);
check('label is 5 decimals', fixLabel({ lat: 33.4484, lng: -112.074 }) === '33.44840, -112.07400');
check('map link carries the point', fixMapUrl({ lat: 33.4484, lng: -112.074 }).startsWith('https://maps.apple.com/?ll=33.4484,-112.074'));

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('all passed');
