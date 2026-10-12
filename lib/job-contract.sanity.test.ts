/**
 * A job's contract money (lib/job-contract) — the GC's screens and the
 * owner's portal read this one rule.
 * Run: npx -y tsx lib/job-contract.sanity.test.ts   (exit 0 = every assertion held)
 */
import { contractMoney } from './job-contract';

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`);
  else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// The live ZZ job: contract stored in original_contract_amount, contract_amount 0.
const zz = contractMoney({ project: { original_contract_amount: '12345', contract_amount: '0' } });
check('original read from original_contract_amount (portal used to show $0)', zz.original === 12345, JSON.stringify(zz));
check('no change orders → current = original, nothing pending', zz.current === 12345 && zz.approvedChanges === 0 && zz.pendingCount === 0);

check('prime contract when no stored original',
  contractMoney({ project: { contract_amount: 5 }, prime: { original_amount: 900000 } }).original === 900000);
check('contract_amount when no original or prime', contractMoney({ project: { contract_amount: '250000' } }).original === 250000);
check('accepted proposal last', contractMoney({ project: {}, acceptedProposal: { amount: null, total_amount: '88000' } }).original === 88000);
check('nothing anywhere → 0', contractMoney({ project: null }).original === 0);

const withCos = contractMoney({
  project: { original_contract_amount: 100000 },
  changeOrders: [
    { status: 'approved', cost_impact: '2500' },
    { status: 'approved', cost_impact: null, amount: 1000 },   // stored only in amount
    { status: 'approved', cost_impact: '-500' },               // a credit
    { status: 'pending', amount: 4321 },
    { status: 'draft', cost_impact: '100' },
    { status: 'rejected', cost_impact: '99999' },
  ],
});
check('approved changes sum both money columns and credits', withCos.approvedChanges === 3000 && withCos.approvedCount === 3, JSON.stringify(withCos));
check('current = original + approved', withCos.current === 103000);
check('pending counts open statuses only', withCos.pendingChanges === 4421 && withCos.pendingCount === 2, JSON.stringify(withCos));

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
