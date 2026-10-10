/**
 * Request text placed inside a PostgREST or() filter.
 * Run: npx -y tsx lib/pg-filter.sanity.test.ts   (exit 0 = every assertion held)
 */
import { orValue } from './pg-filter';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
check('plain name unchanged', orValue('Ruiz & Sons') === 'Ruiz & Sons');
check('email keeps its dots and @', orValue('john.doe@acme.com') === 'john.doe@acme.com');
check('cost code keeps its dot', orValue('03.300') === '03.300');
check('a comma cannot start a second condition', !orValue('x,tenant_id.neq.0').includes(','));
check('parentheses cannot open a group', !/[()]/.test(orValue('a),or(id.neq.0')));
check('quotes and backslashes are dropped', !/["\\]/.test(orValue('a"b\\c')));
check('null and numbers', orValue(null) === '' && orValue(1200) === '1200');
check('spaces collapse', orValue('  a ,, b  ') === 'a b');
if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nall pg-filter checks passed');
