/**
 * A job's contract money (lib/job-contract) — the GC's screens and the
 * owner's portal read this one rule.
 * Run: npx -y tsx lib/job-contract.sanity.test.ts   (exit 0 = every assertion held)
 */
import { contractMoney, originalContract } from './job-contract';

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


// ── Double count (FOUND 15 Oct): contract_amount / revised_contract_value already carry approved COs.
const pimaCos = [{ status: 'approved', cost_impact: null, amount: 86400 }, { status: 'approved', cost_impact: null, amount: 41250 }];
const pima = contractMoney({ project: { original_contract_amount: '2412000', contract_amount: '2539650', contract_value: '2539650', revised_contract_value: '2539650' }, changeOrders: pimaCos });
check('Pima: original from the original column, current = $2,539,650 (was $2,667,300)', pima.original === 2412000 && pima.current === 2539650, JSON.stringify(pima));
const noOriginal = contractMoney({ project: { contract_amount: '2539650', contract_value: '2539650' }, changeOrders: pimaCos });
check('only contract_amount (revised): approved COs are not added twice', noOriginal.original === 2412000 && noOriginal.current === 2539650, JSON.stringify(noOriginal));
const rcv = contractMoney({ project: { revised_contract_value: '3136800' }, changeOrders: [{ status: 'approved', amount: 16800 }] });
check('revised_contract_value less approved', rcv.original === 3120000 && rcv.current === 3136800, JSON.stringify(rcv));
check('original_contract_value counts as an original (Camelback read $0 before)',
  contractMoney({ project: { original_contract_value: '3120000', contract_value: '3120000', contract_amount: '0' }, changeOrders: [{ status: 'approved', amount: 16800 }] }).current === 3136800);
check('contract_value is never reduced (nothing adds COs to it)', originalContract({ contract_value: 500 }, 200) === 500);
check('a revised figure smaller than the approved COs is not an original', originalContract({ contract_amount: 100 }, 250, { acceptedProposal: { amount: 9000 } }) === 9000);
check('prime contract still beats revised columns', originalContract({ contract_amount: 1000 }, 100, { prime: { original_amount: 777 } }) === 777);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
