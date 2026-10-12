/**
 * The state a job sits in (lib/us-state) — it picks the job's lien-waiver and
 * wage rules, so a wrong answer is a wrong law, not a typo.
 * Run: npx -y tsx lib/us-state.sanity.test.ts   (exit 0 = every assertion held)
 */
import { stateFromAddress } from './us-state';

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  if (got === want) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name} — got ${String(got)}, want ${String(want)}`); }
}

check('code in an address', stateFromAddress('1 Test Street, Phoenix, AZ 85001'), 'AZ');
check('the code beats a street name', stateFromAddress('12 Washington St, Kansas City, MO 64105'), 'MO');
check('"ME" inside Mesa is not Maine', stateFromAddress('200 N Test St, Mesa'), null);
check('"St" is not a state', stateFromAddress('100 N Test St'), null);
check('a bare State column', stateFromAddress('tx'), 'TX');
check('spelled out', stateFromAddress('Austin, Texas'), 'TX');
check('West Virginia is not Virginia', stateFromAddress('Charleston, West Virginia'), 'WV');
check('Arkansas is not Kansas', stateFromAddress('Little Rock, Arkansas'), 'AR');
check('empty', stateFromAddress(''), null);
check('null', stateFromAddress(null), null);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
