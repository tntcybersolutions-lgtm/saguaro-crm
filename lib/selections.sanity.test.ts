/**
 * Selections sanity — allowance variance, status, lead time, flags.
 * Run: npx -y tsx lib/selections.sanity.test.ts   (exit 0 = every assertion held)
 *
 * The first assertion is the live bug this replaces. On the demo project every
 * selection carried variance 0 while the numbers plainly disagreed: bath
 * fixtures sat $2,500 over a $22,000 allowance and the screen said nothing was
 * wrong. Nothing computed the column, so it was right once and wrong forever
 * after.
 *
 * The rest exist because each wrong answer misleads in a specific way:
 *
 *   variance 0 for an unpicked row → an untouched allowance looks settled
 *   undecided allowances in the net → the job looks wildly under budget
 *   overdue counted after a pick    → the real blockers get buried
 *   lead time ignored               → an on-time decision still misses the job
 */
import {
  variance, hasSelection, effectiveStatus, isOver, isLate, missesLeadTime,
  daysUntilDue, selectionTotals, groupByCategory, selectionFlags,
  parseLeadDays, normaliseSelection, priceOptions, optionCost,
  type SelectionRow,
} from './selections';

let failures = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
  if (!cond) failures++;
};

const NOW = Date.UTC(2026, 8, 6, 12); // 6 Sep 2026

/* ── the live rows, exactly as the database holds them ───────────────────── */

const live: SelectionRow[] = [
  { id: 'a', category: 'Flooring', item_name: 'Lobby Tile', allowance: '15000', selected_amount: '12800', variance: '0', status: 'selected', vendor: 'AZ Tile', owner_approved: false },
  { id: 'b', category: 'Paint', item_name: 'Paint Colors', allowance: '8000', selected_amount: null, status: 'pending', vendor: 'Sherwin-Williams', owner_approved: false },
  { id: 'c', category: 'Plumbing', item_name: 'Bath Fixtures', allowance: '22000', selected_amount: '24500', status: 'selected', vendor: 'Ferguson', owner_approved: false },
];

check('an under-allowance pick reports a POSITIVE variance',
  variance(live[0]) === 2200, `Lobby Tile → ${variance(live[0])} (stored column said 0)`);
check('an over-allowance pick reports a NEGATIVE variance',
  variance(live[2]) === -2500, `Bath Fixtures → ${variance(live[2])} (stored column said 0)`);
check('an unpicked row has NO variance, not zero',
  variance(live[1]) === null, `Paint Colors → ${variance(live[1])} — 0 would make an untouched allowance look settled`);
check('over-allowance is detected', isOver(live[2]) && !isOver(live[0]), 'Bath Fixtures over, Lobby Tile under');
check('numeric strings from the database are handled',
  variance({ allowance: '1000', selected_amount: '250' }) === 750, 'NUMERIC round-trips as text');

/* ── what counts as a selection ──────────────────────────────────────────── */

check('zero IS a selection', hasSelection({ selected_amount: 0 }) && variance({ allowance: 500, selected_amount: 0 }) === 500,
  'picking a $0 option is a decision, not an absence');
check('null is not a selection', !hasSelection({ selected_amount: null }), 'null → pending');
check('empty string is not a selection', !hasSelection({ selected_amount: '' }), 'blank → pending');

/* ── status ──────────────────────────────────────────────────────────────── */

check('an amount promotes pending to selected',
  effectiveStatus({ status: 'pending', selected_amount: 100 }) === 'selected',
  'stored status drifts; the fields decide');
check('owner approval wins over a stale status',
  effectiveStatus({ status: 'pending', selected_amount: 100, owner_approved: true }) === 'approved', 'approved');
check('a later stage is respected',
  effectiveStatus({ status: 'ordered', selected_amount: 1 }) === 'ordered' &&
  effectiveStatus({ status: 'installed' }) === 'installed', 'ordered / installed');
check('cancelled beats everything',
  effectiveStatus({ status: 'cancelled', selected_amount: 100, owner_approved: true }) === 'cancelled', 'cancelled');
check('no amount stays pending', effectiveStatus({ status: '' }) === 'pending', 'pending');

/* ── dates and lead time ─────────────────────────────────────────────────── */

check('days until due', daysUntilDue({ due_date: '2026-09-16' }, NOW) === 10, `→ ${daysUntilDue({ due_date: '2026-09-16' }, NOW)}`);
check('overdue is negative', daysUntilDue({ due_date: '2026-08-27' }, NOW) === -10, `→ ${daysUntilDue({ due_date: '2026-08-27' }, NOW)}`);
check('no due date is null', daysUntilDue({}, NOW) === null, 'null');

check('an overdue unpicked row is late',
  isLate({ due_date: '2026-08-27', selected_amount: null }, NOW), 'overdue with nothing picked');
check('an overdue row that HAS a pick is NOT late',
  !isLate({ due_date: '2026-08-27', selected_amount: 500 }, NOW),
  'the decision was made — flagging it buries the rows that actually block procurement');
check('a cancelled overdue row is not late',
  !isLate({ due_date: '2026-08-27', status: 'cancelled' }, NOW), 'cancelled');

/* lead_time is a TEXT column, so it holds whatever the user typed. Number()
   returns NaN for all of these, and a NaN read as 0 silently disables the only
   check that catches an on-time decision arriving after the job needs it. */
check('a bare number of days parses', parseLeadDays('21') === 21, '21');
check('"3 weeks" is 21 days', parseLeadDays('3 weeks') === 21, `${parseLeadDays('3 weeks')}`);
check('"6-8 wks" takes the LONGER end',
  parseLeadDays('6-8 wks') === 56, `${parseLeadDays('6-8 wks')} — 8 weeks; the optimistic read is the one that misses the job`);
check('"2 months" is 60 days', parseLeadDays('2 months') === 60, `${parseLeadDays('2 months')}`);
check('"10 days" parses', parseLeadDays('10 days') === 10, `${parseLeadDays('10 days')}`);
check('prose with no number is null', parseLeadDays('call vendor') === null, 'null');
check('empty and null are null',
  parseLeadDays('') === null && parseLeadDays(null) === null && parseLeadDays(0) === null, 'null');

check('a written lead time still triggers the risk check',
  missesLeadTime({ due_date: '2026-09-16', lead_time: '3 weeks' }, NOW),
  '"3 weeks" against 10 days left — the case Number() would have silently passed');

check('a lead time longer than the runway is flagged',
  missesLeadTime({ due_date: '2026-09-16', lead_time: 21 }, NOW),
  '21-day lead against 10 days left — the pick can be on time and still miss the job');
check('a lead time that fits is not flagged',
  !missesLeadTime({ due_date: '2026-09-16', lead_time: 5 }, NOW), '5-day lead, 10 days left');
check('no lead time is not a risk', !missesLeadTime({ due_date: '2026-09-16' }, NOW), 'unset');

/* ── totals ──────────────────────────────────────────────────────────────── */

const t = selectionTotals(live, NOW);
check('allowances sum across every live row', t.allowanceTotal === 45000, `${t.allowanceTotal} (15k + 8k + 22k)`);
check('selected sums only decided rows', t.selectedTotal === 37300, `${t.selectedTotal} (12.8k + 24.5k)`);
check('net variance counts decided rows only',
  t.varianceTotal === -300, `${t.varianceTotal} (+2,200 under − 2,500 over); the 8k pending allowance is excluded`);
check('outstanding allowance is tracked separately',
  t.allowanceOutstanding === 8000, `${t.allowanceOutstanding} — money not yet committed either way`);
check('over and under are reported separately',
  t.overTotal === 2500 && t.underTotal === 2200 && t.overCount === 1,
  `over ${t.overTotal} (${t.overCount} item), under ${t.underTotal}`);
check('status counts', t.pending === 1 && t.selected === 2 && t.approved === 0,
  `${t.pending} pending, ${t.selected} selected`);

const withCancelled = selectionTotals([...live, { category: 'X', item_name: 'Dropped', allowance: 99999, status: 'cancelled' }], NOW);
check('a cancelled row contributes nothing',
  withCancelled.allowanceTotal === 45000, `still ${withCancelled.allowanceTotal}`);

check('empty input is handled',
  selectionTotals([]).allowanceTotal === 0 && selectionTotals([]).items === 0, 'zeroes');

/* ── grouping ────────────────────────────────────────────────────────────── */

const groups = groupByCategory(live);
check('grouped by category', groups.length === 3, `${groups.map((g) => g.category).join(', ')}`);
check('a group carries its own variance',
  groups.find((g) => g.category === 'Plumbing')!.varianceTotal === -2500,
  `Plumbing → ${groups.find((g) => g.category === 'Plumbing')!.varianceTotal}`);
check('an unnamed category is bucketed, not dropped',
  groupByCategory([{ item_name: 'x', allowance: 1 }])[0].category === 'Uncategorised', 'Uncategorised');

/* ── flags ───────────────────────────────────────────────────────────────── */

const flags = selectionFlags(live, NOW);
const bath = flags.find((f) => f.item === 'Bath Fixtures' && /over its/.test(f.message));
check('the over-allowance row is flagged with its numbers',
  !!bath && /\$2,500 over its \$22,000 allowance/.test(bath!.message),
  `"${bath?.message}"`);
check('an 11% overage is critical, not a note',
  bath?.severity === 'critical', `severity=${bath?.severity} (2,500 of 22,000 is 11%)`);
check('a small overage is only a watch',
  selectionFlags([{ item_name: 'Trim', category: 'Finishes', allowance: 10000, selected_amount: 10200 }], NOW)[0].severity === 'watch',
  '2% over → watch');
check('an unapproved pick is flagged',
  flags.some((f) => f.item === 'Lobby Tile' && /not owner-approved/.test(f.message)),
  'picked but not approved');
check('critical flags sort first',
  flags[0].severity === 'critical', `first=${flags[0].severity}`);
check('a clean selection produces no flags',
  selectionFlags([{ item_name: 'OK', category: 'C', allowance: 100, selected_amount: 90, owner_approved: true }], NOW).length === 0,
  'under allowance and approved → silent');

/* ── options priced against the allowance ────────────────────────────────── */

const tileOptions = [
  { id: 'o1', name: 'Ceramic 12x24', unit_cost: 9, quantity: 1200, sort_order: 1 },
  { id: 'o2', name: 'Porcelain plank', unit_cost: 10.67, quantity: 1200, sort_order: 2, is_recommended: true },
  { id: 'o3', name: 'Carrara marble', unit_cost: 18, quantity: 1200, sort_order: 3 },
  { id: 'o4', name: 'Remnant lot', total_cost: 15000, sort_order: 4 },
];
const priced = priceOptions(live[0], tileOptions);

check('an option costs unit × quantity',
  priced.find((o) => o.id === 'o1')!.cost === 10800, `${priced.find((o) => o.id === 'o1')!.cost} = 9 × 1200`);
check('an option with only a total falls back to it',
  priced.find((o) => o.id === 'o4')!.cost === 15000, '15000');
check('the recommended option is shown first',
  priced[0].id === 'o2', `${priced[0].name} — order is itself a recommendation`);
check('an option under the allowance says so',
  /4,200 under your allowance/.test(priced.find((o) => o.id === 'o1')!.effect),
  `"${priced.find((o) => o.id === 'o1')!.effect}" — 15,000 allowance less 10,800`);
check('an option over the allowance shows the UPCHARGE, not the price',
  priced.find((o) => o.id === 'o3')!.effect === 'adds $6,600',
  `"${priced.find((o) => o.id === 'o3')!.effect}" — 21,600 against a 15,000 allowance`);
check('an option exactly on the allowance says so',
  priceOptions(live[0], [{ name: 'X', total_cost: 15000 }])[0].effect === 'exactly your allowance', 'exact');
check('the already-chosen option is marked',
  priced.find((o) => o.cost === 12800)?.isChosen !== true &&
  priceOptions(live[0], [{ name: 'Picked', total_cost: 12800 }])[0].isChosen === true,
  'matched on price, so renaming an option does not lose the pick');
check('with no allowance an option just shows its price',
  priceOptions({ item_name: 'x' }, [{ name: 'Y', total_cost: 500 }])[0].effect === '$500',
  'no allowance to compare against');
check('unit_cost beats a stale stored total',
  optionCost({ unit_cost: 10, quantity: 5, total_cost: 999 }) === 50,
  '50 — total_cost is a plain column that nothing recomputes');
check('no options is handled', priceOptions(live[0], []).length === 0, 'empty');

/* ── normalisation: the read path that never mapped back ─────────────────── */

const n = normaliseSelection(live[2], NOW);
check('normalising exposes the name the UI actually reads',
  n.item === 'Bath Fixtures', `item="${n.item}" — the card title read .item and the column is item_name`);
check('normalising exposes the price the UI actually reads',
  n.cost === 24500, `cost=${n.cost} — the card price read .cost and the column is selected_amount`);
check('normalising carries the DERIVED variance, not the stored 0',
  n.variance === -2500, `${n.variance}`);
check('normalising keeps the real column names too',
  n.item_name === 'Bath Fixtures' && Number(n.selected_amount) === 24500,
  'both spellings present, so neither caller breaks');
check('an unpicked row normalises to no cost, not zero',
  normaliseSelection(live[1], NOW).cost === null, 'null — 0 would price a decision nobody has made');
check('derived status and flags ride along',
  n.effective_status === 'selected' && n.is_over === true && n.is_late === false,
  'one server-side answer every caller agrees on');
check('written lead time normalises to days',
  normaliseSelection({ lead_time: '6-8 weeks' }, NOW).lead_days === 56, 'lead_days=56');

console.log(failures === 0 ? '\nALL SELECTION ASSERTIONS HELD' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
