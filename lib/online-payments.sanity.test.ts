/**
 * When a company's Stripe account counts as ready to take online payments.
 * Run: npx -y tsx lib/online-payments.sanity.test.ts   (exit 0 = every assertion held)
 */
import { accountReadiness } from './online-payments';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const ok = { charges_enabled: true, payouts_enabled: true, requirements: { past_due: [], currently_due: [], disabled_reason: null } };
check('charges + payouts on, nothing due → ready', accountReadiness(ok).ready === true);
check('payouts held → not ready', accountReadiness({ ...ok, payouts_enabled: false }).ready === false);
check('charges off → not ready', accountReadiness({ ...ok, charges_enabled: false }).ready === false);
check('past-due requirement → not ready', accountReadiness({ ...ok, requirements: { past_due: ['external_account'], currently_due: [] } }).ready === false);
check('disabled by Stripe → not ready', accountReadiness({ ...ok, requirements: { disabled_reason: 'requirements.past_due' } }).ready === false);
check('currently due only (not yet overdue) → still ready', accountReadiness({ ...ok, requirements: { past_due: [], currently_due: ['individual.ssn_last_4'] } }).ready === true);
const d = accountReadiness({ charges_enabled: false, payouts_enabled: false, requirements: { past_due: ['a', 'b'], currently_due: ['b', 'c'] } }).due;
check('due lists overdue first, no repeats', JSON.stringify(d) === '["a","b","c"]', JSON.stringify(d));
check('missing requirements → not ready, nothing due', JSON.stringify(accountReadiness({})) === '{"ready":false,"due":[]}');

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('all passed');
