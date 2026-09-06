/**
 * Commitment rollup sanity — the committed/actual chain behind the cost report.
 * Run: npx -y tsx lib/commitments.sanity.test.ts   (exit 0 = every assertion held)
 *
 * The property that matters most here is IDEMPOTENCE. The code this replaces
 * incremented `committed` on PO create and never decremented on update, delete
 * or cancel, so the figure only ever drifted upward and could not be corrected
 * except by hand. Every assertion below exists because getting it wrong puts a
 * specific wrong number in front of a GC:
 *
 *   - not idempotent      → running the rollup twice doubles committed cost
 *   - dead POs counted    → a cancelled order still eats budget forever
 *   - draft bills counted → unapproved paperwork reads as money spent
 *   - arbitrary matching  → the same PO lands on a different line each run
 *   - orphans dropped     → real money silently vanishes from the report
 */
import {
  rollup, matchLine, codeOf, divisionOf, poCounts, billCounts, invoiceCounts,
  type BudgetLine, type SourceDoc,
} from './commitments';

let failures = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
  if (!cond) failures++;
};

const lines: BudgetLine[] = [
  { id: 'L1', cost_code: '01-000', division: '01', description: 'General Conditions', original_budget: 175000, approved_changes: 0, revised_budget: 175000, committed: 0, actual: 62000, projected: 0 },
  { id: 'L2', cost_code: '03-300', division: '03', description: 'Cast-in-Place Concrete', original_budget: 450000, approved_changes: 28000, revised_budget: 478000, committed: 0, actual: 360000, projected: 0 },
  { id: 'L3', cost_code: '05-120', division: '05', description: 'Structural Steel', original_budget: 620000, approved_changes: 0, revised_budget: 620000, committed: 0, actual: 0, projected: 0 },
];

/* ── matching ────────────────────────────────────────────────────────────── */

check('exact cost code wins', matchLine('03-300', lines)?.id === 'L2', `→ ${matchLine('03-300', lines)?.id}`);
check('division prefix catches a nearby code',
  matchLine('03-350', lines)?.id === 'L2',
  `03-350 (no exact line) → ${matchLine('03-350', lines)?.id} (concrete)`);
check('an unknown division matches nothing rather than guessing',
  matchLine('99-999', lines) === null, `→ ${matchLine('99-999', lines)}`);
check('an empty code matches nothing', matchLine('', lines) === null, 'blank → null');
check('matching is deterministic regardless of row order',
  matchLine('03-350', [...lines].reverse())?.id === matchLine('03-350', lines)?.id,
  'reversed input gives the same line — the .or(...).limit(1) it replaces did not');
check('codeOf trims and never yields "null"', codeOf('  03-300 ') === '03-300' && codeOf(null) === '', 'ok');
check('divisionOf takes the leading two', divisionOf('03-300') === '03', `→ ${divisionOf('03-300')}`);

/* ── status vocabulary ───────────────────────────────────────────────────── */

check('a cancelled PO is not a commitment', !poCounts({ status: 'cancelled' }), 'cancelled → excluded');
check('a voided PO is not a commitment', !poCounts({ status: 'Voided' }), 'case-insensitive');
check('a draft PO IS a commitment until killed', poCounts({ status: 'draft' }), 'draft → counted');
check('a draft bill is not spend', !billCounts({ status: 'draft' }), 'draft → excluded');
check('an unpaid bill IS spend', billCounts({ status: 'unpaid' }), 'unpaid → counted (money owed)');
check('a bill with no status counts rather than vanishing', billCounts({}), 'blank → counted');
check('a draft invoice is not spend', !invoiceCounts({ status: 'draft' }), 'draft → excluded');
check('an approved invoice is spend', invoiceCounts({ status: 'approved' }), 'approved → counted');

/* ── the rollup ──────────────────────────────────────────────────────────── */

const pos: SourceDoc[] = [
  { id: 'P1', cost_code: '03-300', status: 'issued', total: 200000 },
  { id: 'P2', cost_code: '03-350', status: 'draft', total: 40000 },      // division match → L2
  { id: 'P3', cost_code: '05-120', status: 'issued', subtotal: 500000 }, // total absent → subtotal
  { id: 'P4', cost_code: '05-120', status: 'cancelled', total: 999999 }, // must not count
  { id: 'P5', cost_code: '77-000', status: 'issued', total: 12000 },     // orphan
];
const bills: SourceDoc[] = [
  { id: 'B1', cost_code: '01-000', status: 'paid', total: 30000 },
  { id: 'B2', cost_code: '01-000', status: 'unpaid', amount: 12000 },    // total absent → amount
  { id: 'B3', cost_code: '01-000', status: 'draft', total: 500000 },     // must not count
  { id: 'B4', cost_code: '88-000', status: 'paid', total: 3000 },        // orphan
];
const invoices: SourceDoc[] = [
  { id: 'I1', cost_code: '03-300', status: 'approved', amount: 360000 },
  { id: 'I2', cost_code: '03-300', status: 'draft', amount: 88888 },     // must not count
];

const r = rollup(lines, pos, bills, invoices);
const byId = Object.fromEntries(r.updates.map((u) => [u.id, u]));

check('committed sums live POs only',
  byId.L2.committed === 240000, `L2 committed=${byId.L2.committed} (200k + 40k draft; 0 cancelled)`);
check('a cancelled PO is excluded from committed',
  byId.L3.committed === 500000, `L3 committed=${byId.L3.committed} (500k subtotal; the 999,999 cancelled PO is out)`);
check('subtotal is used when total is absent', byId.L3.committed === 500000, 'fallback chain total → subtotal → amount');
check('actual sums bills and invoices together',
  byId.L1.actual === 42000, `L1 actual=${byId.L1.actual} (30k paid + 12k unpaid; 500k draft excluded)`);
check('invoices reach actual', byId.L2.actual === 360000, `L2 actual=${byId.L2.actual}`);
check('a draft invoice is excluded', byId.L2.actual === 360000, '88,888 draft not counted');

check('projected is the largest of budget, committed and actual',
  byId.L3.projected === 620000 && byId.L2.projected === 478000,
  `L3=${byId.L3.projected} (budget 620k > committed 500k), L2=${byId.L2.projected} (budget 478k)`);

const overrun = rollup(
  [{ id: 'X', cost_code: '09-100', revised_budget: 100000, committed: 0, actual: 0, projected: 0 }],
  [{ cost_code: '09-100', status: 'issued', total: 130000 }], [], []);
check('projected follows a commitment above budget',
  overrun.updates[0].projected === 130000,
  `budget 100k, committed 130k → projected ${overrun.updates[0].projected}`);

/* ── idempotence: the whole point ────────────────────────────────────────── */

const applied: BudgetLine[] = lines.map((l) => {
  const u = byId[l.id];
  return { ...l, committed: u.committed, actual: u.actual, projected: u.projected };
});
const again = rollup(applied, pos, bills, invoices);
check('running the rollup twice changes nothing',
  again.updates.every((u) => !u.changed),
  `second pass reports ${again.updates.filter((u) => u.changed).length} changed rows (the += it replaces would have doubled every figure)`);
check('the second pass produces identical figures',
  JSON.stringify(again.updates.map((u) => [u.committed, u.actual, u.projected])) ===
  JSON.stringify(r.updates.map((u) => [u.committed, u.actual, u.projected])),
  'byte-identical');

/* Deleting the source must pull the money back out — the failure the old
   incremental code could never recover from. */
const afterDelete = rollup(applied, pos.filter((p) => p.id !== 'P1'), bills, invoices);
check('deleting a PO removes its commitment',
  afterDelete.updates.find((u) => u.id === 'L2')!.committed === 40000,
  `L2 committed 240k → ${afterDelete.updates.find((u) => u.id === 'L2')!.committed} after the 200k PO is deleted`);

const afterCancel = rollup(applied, pos.map((p) => p.id === 'P1' ? { ...p, status: 'cancelled' } : p), bills, invoices);
check('cancelling a PO removes its commitment',
  afterCancel.updates.find((u) => u.id === 'L2')!.committed === 40000,
  `cancelled → ${afterCancel.updates.find((u) => u.id === 'L2')!.committed}`);

const afterEdit = rollup(applied, pos.map((p) => p.id === 'P1' ? { ...p, total: 90000 } : p), bills, invoices);
check('editing a PO down lowers the commitment',
  afterEdit.updates.find((u) => u.id === 'L2')!.committed === 130000,
  `200k → 90k gives ${afterEdit.updates.find((u) => u.id === 'L2')!.committed} (90k + 40k)`);

/* ── orphans ─────────────────────────────────────────────────────────────── */

check('money with no matching budget line is reported, not dropped',
  r.unmatched.length === 2 && r.unmatched.some((u) => u.costCode === '77-000') && r.unmatched.some((u) => u.costCode === '88-000'),
  `unmatched: ${r.unmatched.map((u) => `${u.costCode} $${u.committed + u.actual}`).join(', ')}`);
check('orphans are ordered by how much money is stranded',
  r.unmatched[0].costCode === '77-000', `largest first: ${r.unmatched[0].costCode}`);

/* ── totals and empty states ─────────────────────────────────────────────── */

check('totals sum the applied lines',
  r.totals.committed === 740000 && r.totals.actual === 402000,
  `committed=${r.totals.committed} actual=${r.totals.actual}`);
check('budget total reads revised where present',
  r.totals.budget === 1273000, `budget=${r.totals.budget} (175k + 478k + 620k)`);

const empty = rollup(lines, [], [], []);
check('no source documents zeroes the figures rather than leaving stale ones',
  empty.updates.every((u) => u.committed === 0 && u.actual === 0),
  'all zero — a deleted last PO must not leave its commitment behind');
check('zeroing is still reported as a change where the row held a value',
  empty.updates.find((u) => u.id === 'L1')!.changed,
  'L1 held actual 62,000 and now computes 0, so it is flagged');
check('no budget lines at all is handled', rollup([], pos, bills, invoices).updates.length === 0,
  `and every document becomes an orphan: ${rollup([], pos, bills, invoices).unmatched.length} codes`);

/* ── the legacy-data guard ───────────────────────────────────────────────────
   Computing zero from zero documents is correct arithmetic and a destructive
   migration. A budget carrying hand-entered actuals from before this chain
   existed would lose them to the first PO anyone raised on the project — which
   is exactly what happened on the demo project the first time this ran, wiping
   $422,000 of figures no document supported. The flag lets the writer refuse
   while the preview still shows what the derived numbers would be. */
check('a project with no source documents is flagged',
  empty.noSourceDocuments === true, 'noSourceDocuments=true when POs, bills and invoices are all empty');
check('a project with any source document is NOT flagged',
  rollup(lines, pos, [], []).noSourceDocuments === false, 'one PO is enough to make the ledger authoritative');
check('the flag does not suppress the computed preview',
  empty.updates.length === lines.length,
  'the figures are still reported so the difference can be seen before it is adopted');

console.log(failures === 0 ? '\nALL COMMITMENT ASSERTIONS HELD' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
