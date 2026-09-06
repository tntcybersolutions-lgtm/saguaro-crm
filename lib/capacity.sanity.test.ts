/**
 * Capacity / levelling / cost-curve sanity.
 * Run: npx -y tsx lib/capacity.sanity.test.ts   (exit 0 = every assertion held)
 *
 * These are the properties that make the capacity page trustworthy rather than
 * decorative. Each one exists because getting it wrong produces a specific
 * false statement on screen:
 *
 *   - counting finished tasks   → every past week shows a fake overload
 *   - counting inactive staff   → supply is overstated and nothing ever flags
 *   - levelling a critical task → the tool quietly proposes moving the end date
 *   - drawing actuals to the end → a guess rendered in the same ink as a fact
 *
 * Dates here are pinned, never `new Date()`, so the suite cannot start failing
 * on a Monday.
 */
import {
  weekStart, weeksBetween, capacityByTrade, levellingMoves, utilisation, costCurve,
  tradeKey, parseDay, WEEKLY_HOURS,
  type CapTask, type CapEmployee, type CapTimeEntry,
} from './capacity';

let failures = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
  if (!cond) failures++;
};

const D = (s: string) => parseDay(s)!;
const NOW = D('2026-04-15'); // a Wednesday

/* ── week maths ──────────────────────────────────────────────────────────── */

check('weekStart snaps to Monday', weekStart(D('2026-04-15')) === '2026-04-13',
  `Wed 15 Apr → ${weekStart(D('2026-04-15'))} (expected Mon 13 Apr)`);
check('weekStart on a Monday is idempotent', weekStart(D('2026-04-13')) === '2026-04-13',
  `${weekStart(D('2026-04-13'))}`);
check('weekStart rolls Sunday BACK, not forward', weekStart(D('2026-04-19')) === '2026-04-13',
  `Sun 19 Apr → ${weekStart(D('2026-04-19'))} (expected Mon 13 Apr — the bug here puts Sunday in next week)`);
check('weeksBetween is inclusive of both ends',
  weeksBetween(D('2026-04-13'), D('2026-04-27')).join(',') === '2026-04-13,2026-04-20,2026-04-27',
  weeksBetween(D('2026-04-13'), D('2026-04-27')).join(','));
check('tradeKey folds blanks into one bucket', tradeKey(null) === 'unassigned' && tradeKey('  ') === 'unassigned',
  `null→${tradeKey(null)}, blank→${tradeKey('  ')}`);
check('tradeKey is case-insensitive', tradeKey('Electrical') === tradeKey('electrical'), 'Electrical === electrical');

/* ── capacity ────────────────────────────────────────────────────────────── */

const employees: CapEmployee[] = [
  { id: 'e1', full_name: 'A Sparks', trade: 'Electrical', is_active: true },
  { id: 'e2', full_name: 'B Sparks', trade: 'electrical', is_active: true },
  { id: 'e3', full_name: 'C Gone', trade: 'Electrical', is_active: false },
  { id: 'e4', full_name: 'D Framer', trade: 'Framing', is_active: true },
];

const span = { start_date: '2026-04-13', end_date: '2026-04-24' };
const tasks: CapTask[] = [
  { id: 't1', name: 'Feeders', trade: 'Electrical', ...span, pct_complete: 0, total_float: 4 },
  { id: 't2', name: 'Panels', trade: 'Electrical', ...span, pct_complete: 0, total_float: 0, is_critical: true },
  { id: 't3', name: 'Devices', trade: 'Electrical', ...span, pct_complete: 0, total_float: 9 },
  { id: 't4', name: 'Done already', trade: 'Electrical', ...span, pct_complete: 100, total_float: 5 },
  { id: 't5', name: 'Walls', trade: 'Framing', ...span, pct_complete: 10, total_float: 2 },
];

const caps = capacityByTrade(tasks, employees, { from: NOW, horizonWeeks: 4 });
const elec = caps.find((c) => c.trade === 'electrical')!;
const fram = caps.find((c) => c.trade === 'framing')!;

check('supply counts ACTIVE employees only', elec.supply === 2, `electrical supply=${elec.supply} (3 on the books, 1 inactive)`);
check('completed tasks are excluded from demand', elec.peakDemand === 3,
  `peak electrical demand=${elec.peakDemand} (4 tasks, one at 100%)`);
check('overload is demand minus supply', elec.worstWeek?.overBy === 1,
  `worst week overBy=${elec.worstWeek?.overBy} (3 needed, 2 available)`);
check('a trade within capacity is not flagged', fram.overWeeks === 0,
  `framing overWeeks=${fram.overWeeks} (1 task, 1 framer)`);
check('overloaded trades sort first', caps[0].trade === 'electrical', `first=${caps[0].trade}`);
check('weeks before today are not reported', elec.weeks.every((w) => w.week >= weekStart(NOW)),
  `first week=${elec.weeks[0]?.week}, today's week=${weekStart(NOW)}`);

const noneLive = capacityByTrade(
  [{ id: 'x', name: 'Old', trade: 'Electrical', start_date: '2020-01-01', end_date: '2020-02-01', pct_complete: 0 }],
  employees, { from: NOW, horizonWeeks: 4 });
check('a task entirely in the past creates no demand',
  (noneLive.find((c) => c.trade === 'electrical')?.peakDemand ?? 0) === 0,
  `peak=${noneLive.find((c) => c.trade === 'electrical')?.peakDemand}`);

/* ── levelling ───────────────────────────────────────────────────────────── */

const moves = levellingMoves(tasks, caps);
const names = moves.map((m) => m.taskName);
check('levelling never proposes moving a critical task', !names.includes('Panels'),
  `suggested: [${names.join(', ')}]`);
check('levelling only offers tasks with float', moves.every((m) => m.floatDays > 0),
  `floats: [${moves.map((m) => m.floatDays).join(', ')}]`);
check('levelling offers the tasks that CAN move', names.includes('Feeders') && names.includes('Devices'),
  `suggested: [${names.join(', ')}]`);
check('each task is suggested once, not once per week',
  new Set(names).size === names.length, `${names.length} moves, ${new Set(names).size} unique`);
check('the suggestion names the float and the week',
  /float/.test(moves[0]?.suggestion ?? '') && /2026-/.test(moves[0]?.suggestion ?? ''),
  `"${moves[0]?.suggestion ?? ''}"`);

/* ── utilisation ─────────────────────────────────────────────────────────── */

const entries: CapTimeEntry[] = [
  { employee_id: 'e1', work_date: '2026-04-13', total_hours: 10, overtime_hours: 2, labor_cost: 500 },
  { employee_id: 'e1', work_date: '2026-04-14', total_hours: 10, overtime_hours: 2, labor_cost: 500 },
  { employee_id: 'e1', work_date: '2026-04-15', total_hours: 10, overtime_hours: 2, labor_cost: 500 },
  { employee_id: 'e1', work_date: '2026-04-16', total_hours: 10, overtime_hours: 2, labor_cost: 500 },
  { employee_id: 'e2', work_date: '2026-04-13', total_hours: 8, overtime_hours: 0, labor_cost: 320 },
];
const { rows: util, suspect } = utilisation(entries, employees);
const u1 = util.find((u) => u.employeeId === 'e1')!;
const u2 = util.find((u) => u.employeeId === 'e2')!;

check('hours aggregate into the right week', u1.weeks.length === 1 && u1.weeks[0].week === '2026-04-13',
  `weeks=${JSON.stringify(u1.weeks.map((w) => w.week))}`);
check('40 booked hours reads as 100%', u1.weeks[0].hours === 40 && u1.weeks[0].utilisation === 100,
  `${u1.weeks[0].hours}h → ${u1.weeks[0].utilisation}% (base ${WEEKLY_HOURS}h)`);
check('overtime is surfaced separately, not hidden in the total', u1.overtimeHours === 8,
  `overtime=${u1.overtimeHours}h`);
check('labour cost sums', u1.cost === 2000, `cost=${u1.cost}`);
check('an 8-hour week reads as 20%, not 100%', u2.weeks[0].utilisation === 20, `${u2.weeks[0].utilisation}%`);
check('most-loaded person sorts first', util[0].employeeId === 'e1', `first=${util[0].name}`);
check('the employee name is resolved, not an id', u1.name === 'A Sparks', `name=${u1.name}`);
check('clean data produces no false suspects', suspect.length === 0, `${suspect.length} suspect entries`);

/* A shift that was never clocked out. Live data has six of these — one entry
   carrying 912 hours, clocked in 19 Jun and out 27 Jul. Averaged in it reports
   a crew at 2,400% and buries the three people on genuine overtime. */
const runaway = utilisation(
  [...entries, { employee_id: 'e2', work_date: '2026-04-14', total_hours: 912.29, overtime_hours: 904.29, labor_cost: 40000 }],
  employees,
);
const r2 = runaway.rows.find((u) => u.employeeId === 'e2')!;
check('a 912-hour entry is quarantined, not averaged in',
  runaway.suspect.length === 1 && runaway.suspect[0].hours === 912.29,
  `suspect=${JSON.stringify(runaway.suspect[0] ?? null)}`);
check('the runaway entry does not corrupt utilisation',
  r2.weeks.every((w) => w.utilisation < 200) && r2.totalHours === 8,
  `e2 still reads ${r2.totalHours}h / ${r2.weeks[0]?.utilisation}% (would be ~2300% if averaged in)`);
check('the quarantine names the person and the reason',
  runaway.suspect[0].name === 'B Sparks' && /never clocked out/.test(runaway.suspect[0].reason),
  `"${runaway.suspect[0].name}: ${runaway.suspect[0].reason}"`);
check('a long-but-plausible 14h day is NOT quarantined',
  utilisation([{ employee_id: 'e1', work_date: '2026-04-14', total_hours: 14 }], employees).suspect.length === 0,
  '14h double shift kept');

/* ── cost curve ──────────────────────────────────────────────────────────── */

const curveTasks: CapTask[] = [
  { name: 'Phase 1', trade: 'x', start_date: '2026-04-06', end_date: '2026-04-19' },
  { name: 'Phase 2', trade: 'x', start_date: '2026-04-20', end_date: '2026-05-03' },
];
const actuals = new Map<string, number>([['2026-04-06', 30000], ['2026-04-13', 30000]]);
const curve = costCurve(curveTasks, 100000, actuals, 125000, NOW);

check('the curve covers the whole schedule', curve.length >= 4, `${curve.length} weekly points`);
check('planned value ends at BAC', Math.abs(curve[curve.length - 1].plannedCum - 100000) < 1,
  `final plannedCum=${curve[curve.length - 1].plannedCum}`);
check('planned value only ever rises',
  curve.every((p, i) => i === 0 || p.plannedCum >= curve[i - 1].plannedCum), 'monotonic');
check('actuals STOP at today rather than running flat to the end',
  curve.some((p) => p.actualCum != null) && curve[curve.length - 1].actualCum === null,
  `last actualCum=${curve[curve.length - 1].actualCum} (must be null — drawing a guess as a fact is the bug)`);
check('actuals accumulate to what was booked',
  (curve.find((p) => p.week === '2026-04-13')?.actualCum ?? 0) === 60000,
  `cum at 13 Apr=${curve.find((p) => p.week === '2026-04-13')?.actualCum}`);
check('the forecast line lands on EAC, not BAC',
  Math.abs((curve[curve.length - 1].forecastCum ?? 0) - 125000) < 1,
  `final forecastCum=${curve[curve.length - 1].forecastCum} (EAC 125000)`);
check('forecast is drawn forward only, never over history',
  curve.filter((p) => p.week < weekStart(NOW)).every((p) => p.forecastCum === null),
  'no forecast points before this week');

check('no schedule dates ⇒ no curve, not a fabricated straight line',
  costCurve([], 100000, new Map(), null, NOW).length === 0, 'empty in, empty out');
check('zero budget ⇒ no curve', costCurve(curveTasks, 0, new Map(), null, NOW).length === 0, 'BAC 0 → []');

console.log(failures === 0 ? '\nALL CAPACITY ASSERTIONS HELD' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
