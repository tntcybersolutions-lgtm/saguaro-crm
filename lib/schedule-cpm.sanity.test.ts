/**
 * CPM sanity — calendar, passes, float, relationship types, cycles.
 * Run: npx -y tsx lib/schedule-cpm.sanity.test.ts
 *
 * The assertions that matter most are the ones simple schedulers get wrong and
 * never report:
 *
 *   working days   a 10-day task starting Friday finishes a week on Thursday,
 *                  not on Sunday. Calendar-day maths under-runs every duration
 *                  by two days a week.
 *   free float     is not total float. Total float is shared along a chain;
 *                  spend it and somebody downstream who thought they had it too
 *                  is the one who gets hurt.
 *   negative float is how late you already are. Clamping it to zero makes a
 *                  schedule three weeks late look merely tight.
 *   cycles         must be reported, not recursed until the stack dies.
 */
import {
  computeCpm, toDayIndex, fromDayIndex, addWorkDays, workDaysBetween, shiftWorkDays,
  isWorkDay, makeCalendar, FIVE_DAY, SEVEN_DAY, parseDependencies,
  type CpmTask,
} from './schedule-cpm';

let failures = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
  if (!cond) failures++;
};
const D = (iso: string) => toDayIndex(iso)!;
const S = (d: number | null) => fromDayIndex(d);

/* ── the calendar, which is where schedules silently drift ───────────────── */

check('2026-09-07 is a Monday and a work day', isWorkDay(D('2026-09-07'), FIVE_DAY), 'Monday');
check('Saturday is not a work day', !isWorkDay(D('2026-09-12'), FIVE_DAY), 'Saturday');
check('Sunday is not a work day', !isWorkDay(D('2026-09-13'), FIVE_DAY), 'Sunday');

check('a one-day task starts and finishes the same day',
  S(addWorkDays(D('2026-09-07'), 1, FIVE_DAY)) === '2026-09-07', 'inclusive');
check('a five-day task starting Monday finishes Friday',
  S(addWorkDays(D('2026-09-07'), 5, FIVE_DAY)) === '2026-09-11', S(addWorkDays(D('2026-09-07'), 5, FIVE_DAY))!);
check('a TEN-day task starting FRIDAY finishes a week on Thursday',
  S(addWorkDays(D('2026-09-11'), 10, FIVE_DAY)) === '2026-09-24',
  `${S(addWorkDays(D('2026-09-11'), 10, FIVE_DAY))} — calendar-day maths would say the 20th, a Sunday`);
check('a task starting on a Saturday is pulled to Monday',
  S(addWorkDays(D('2026-09-12'), 1, FIVE_DAY)) === '2026-09-14', 'no work happens on the weekend');
check('a seven-day calendar does no skipping',
  S(addWorkDays(D('2026-09-11'), 10, SEVEN_DAY)) === '2026-09-20', 'calendar days when that is genuinely the rule');

check('a holiday is skipped',
  S(addWorkDays(D('2026-09-07'), 5, makeCalendar([1, 2, 3, 4, 5], ['2026-09-09']))) === '2026-09-14',
  'five working days across a Wednesday holiday lands the following Monday');

check('working days between two dates counts inclusively',
  workDaysBetween(D('2026-09-07'), D('2026-09-11'), FIVE_DAY) === 5, 'Mon to Fri is 5');
check('and skips the weekend',
  workDaysBetween(D('2026-09-07'), D('2026-09-14'), FIVE_DAY) === 6, 'Mon to the next Mon is 6 working days');
check('shifting forward skips the weekend',
  S(shiftWorkDays(D('2026-09-11'), 1, FIVE_DAY)) === '2026-09-14', 'Friday + 1 working day is Monday');
check('shifting backward skips it too',
  S(shiftWorkDays(D('2026-09-14'), -1, FIVE_DAY)) === '2026-09-11', 'Monday − 1 is Friday');

/* ── forward and backward pass on a simple chain ─────────────────────────── */

{
  /* A → B → C, five days each, starting Monday 7 Sep 2026. */
  const tasks: CpmTask[] = [
    { id: 'A', name: 'A', duration: 5, start_date: '2026-09-07', predecessors: [] },
    { id: 'B', name: 'B', duration: 5, predecessors: [{ id: 'A' }] },
    { id: 'C', name: 'C', duration: 5, predecessors: [{ id: 'B' }] },
  ];
  const n = computeCpm(tasks);
  check('A runs Mon to Fri', n.byId.A.esDate === '2026-09-07' && n.byId.A.efDate === '2026-09-11', `${n.byId.A.esDate}…${n.byId.A.efDate}`);
  check('B starts the next WORKING day, not the next day',
    n.byId.B.esDate === '2026-09-14', `${n.byId.B.esDate} — the Saturday is not a start date`);
  check('C follows B', n.byId.C.esDate === '2026-09-21' && n.byId.C.efDate === '2026-09-25', `${n.byId.C.esDate}…${n.byId.C.efDate}`);
  check('the project finishes when the last task does',
    n.projectFinish === '2026-09-25', n.projectFinish!);
  check('every task on a single chain is critical',
    n.tasks.every((t) => t.isCritical), 'nothing can slip');
  check('and float is zero throughout',
    n.tasks.every((t) => t.totalFloat === 0), n.tasks.map((t) => t.totalFloat).join(','));
  check('the critical path is ordered',
    n.criticalPath.join('') === 'ABC', n.criticalPath.join(' → '));
}

/* ── float, and the difference between the two kinds ─────────────────────── */

{
  /*        ┌── B (2d) ──┐
     A (5d) ┤            ├── D (3d)
            └── C (8d) ──┘
     C drives D. B has slack. */
  const tasks: CpmTask[] = [
    { id: 'A', duration: 5, start_date: '2026-09-07', predecessors: [] },
    { id: 'B', duration: 2, predecessors: [{ id: 'A' }] },
    { id: 'C', duration: 8, predecessors: [{ id: 'A' }] },
    { id: 'D', duration: 3, predecessors: [{ id: 'B' }, { id: 'C' }] },
  ];
  const n = computeCpm(tasks);
  check('the longer branch is critical',
    n.byId.C.isCritical && !n.byId.B.isCritical, 'C critical, B not');
  check('the short branch carries the difference as float',
    n.byId.B.totalFloat === 6, `${n.byId.B.totalFloat} days — 8 minus 2`);
  check('D starts the working day AFTER the longer predecessor finishes',
    toDayIndex(n.byId.D.esDate!)! > toDayIndex(n.byId.C.efDate!)! &&
    toDayIndex(n.byId.D.esDate!)! > toDayIndex(n.byId.B.efDate!)!,
    `D ${n.byId.D.esDate} follows C's ${n.byId.C.efDate}, not B's ${n.byId.B.efDate}`);
  check('a merge point is critical', n.byId.D.isCritical, 'D on the path');
  check('free float on B equals its total float here',
    n.byId.B.freeFloat === 6, `${n.byId.B.freeFloat} — B is the only user of its slack`);
}

{
  /* A chain hanging off a critical spine: E → F, and F merges into the end.
     E can slip without moving F only by its own free float, which is less than
     the total float the pair shares. */
  const tasks: CpmTask[] = [
    { id: 'SPINE1', duration: 20, start_date: '2026-09-07', predecessors: [] },
    { id: 'END', duration: 1, predecessors: [{ id: 'SPINE1' }, { id: 'F' }] },
    { id: 'E', duration: 3, start_date: '2026-09-07', predecessors: [] },
    { id: 'F', duration: 3, predecessors: [{ id: 'E' }] },
  ];
  const n = computeCpm(tasks);
  check('E and F share total float along their chain',
    n.byId.E.totalFloat === n.byId.F.totalFloat && n.byId.E.totalFloat > 0,
    `${n.byId.E.totalFloat} days each`);
  check('but E has NO free float — slipping it moves F immediately',
    n.byId.E.freeFloat === 0,
    `free ${n.byId.E.freeFloat} vs total ${n.byId.E.totalFloat} — this is the number a superintendent needs`);
  check('F holds the free float at the end of the chain',
    n.byId.F.freeFloat === n.byId.F.totalFloat, `${n.byId.F.freeFloat}`);
  check('free float never exceeds total float',
    n.tasks.every((t) => t.freeFloat <= t.totalFloat), 'invariant holds');
}

/* ── relationship types ──────────────────────────────────────────────────── */

{
  const ss = computeCpm([
    { id: 'A', duration: 10, start_date: '2026-09-07', predecessors: [] },
    { id: 'B', duration: 5, predecessors: [{ id: 'A', type: 'SS', lag: 2 }] },
  ]);
  check('start-to-start with a lag starts alongside, not after',
    ss.byId.B.esDate === '2026-09-09',
    `${ss.byId.B.esDate} — two working days after A started, not after A finished`);

  const ff = computeCpm([
    { id: 'A', duration: 10, start_date: '2026-09-07', predecessors: [] },
    { id: 'B', duration: 4, predecessors: [{ id: 'A', type: 'FF' }] },
  ]);
  check('finish-to-finish lands the finishes together',
    ff.byId.B.efDate === ff.byId.A.efDate, `${ff.byId.B.efDate} = ${ff.byId.A.efDate}`);

  const lag = computeCpm([
    { id: 'A', duration: 5, start_date: '2026-09-07', predecessors: [] },
    { id: 'B', duration: 5, predecessors: [{ id: 'A', type: 'FS', lag: 3 }] },
  ]);
  check('a finish-to-start lag delays the successor',
    lag.byId.B.esDate === '2026-09-17', `${lag.byId.B.esDate} — Fri + 1 + 3 working days`);

  const lead = computeCpm([
    { id: 'A', duration: 10, start_date: '2026-09-07', predecessors: [] },
    { id: 'B', duration: 5, predecessors: [{ id: 'A', type: 'FS', lag: -3 }] },
  ]);
  check('a negative lag pulls the successor forward',
    toDayIndex(lead.byId.B.esDate!)! < toDayIndex(lead.byId.A.efDate!)!,
    `${lead.byId.B.esDate} starts before A finishes on ${lead.byId.A.efDate}`);
}

/* ── negative float: how late you already are ────────────────────────────── */

{
  const n = computeCpm([
    { id: 'A', duration: 10, start_date: '2026-09-07', predecessors: [] },
    { id: 'B', duration: 10, predecessors: [{ id: 'A' }], deadline: '2026-09-25' },
  ]);
  check('an unachievable deadline drives float NEGATIVE',
    n.byId.B.totalFloat < 0,
    `${n.byId.B.totalFloat} days — clamping this to zero would make a late schedule look tight`);
  check('and the number is how late it is',
    n.byId.B.totalFloat === -5, `${n.byId.B.totalFloat} — B finishes 2 Oct against a 25 Sep deadline`);
  check('the late task still reads as critical', n.byId.B.isCritical, 'negative float is critical');
}

/* ── cycles are caught, not recursed ─────────────────────────────────────── */

{
  const n = computeCpm([
    { id: 'A', duration: 5, start_date: '2026-09-07', predecessors: [{ id: 'C' }] },
    { id: 'B', duration: 5, predecessors: [{ id: 'A' }] },
    { id: 'C', duration: 5, predecessors: [{ id: 'B' }] },
  ]);
  check('a logic loop is reported', n.cycles.length === 3, `${n.cycles.join(', ')}`);
  check('and every task still gets dates rather than the stack dying',
    n.tasks.every((t) => t.esDate && t.efDate), 'all dated');
}

/* ── missing predecessors ────────────────────────────────────────────────── */

{
  const n = computeCpm([
    { id: 'A', duration: 5, start_date: '2026-09-07', predecessors: [{ id: 'GHOST' }] },
  ]);
  check('a predecessor that does not exist is reported',
    n.danglingRefs.length === 1 && n.danglingRefs[0].missing === 'GHOST', 'GHOST');
  check('and the task is still scheduled', n.byId.A.esDate === '2026-09-07', n.byId.A.esDate!);
}

/* ── near-critical: the tasks that actually become the problem ───────────── */

{
  const n = computeCpm([
    { id: 'A', duration: 20, start_date: '2026-09-07', predecessors: [] },
    { id: 'B', duration: 18, start_date: '2026-09-07', predecessors: [] },
    { id: 'END', duration: 1, predecessors: [{ id: 'A' }, { id: 'B' }] },
  ]);
  check('a task two days off the path is near-critical, not comfortable',
    n.byId.B.isNearCritical && !n.byId.B.isCritical,
    `${n.byId.B.totalFloat} days float — one bad week and it is the path`);
}

/* ── parsing whatever the database holds ─────────────────────────────────── */

check('bare id strings parse', parseDependencies(['x', 'y']).length === 2, 'two');
check('objects with type and lag parse',
  parseDependencies([{ id: 'x', type: 'SS', lag: 3 }])[0].lag === 3, 'lag 3');
check('a comma string parses', parseDependencies('a, b ,c').length === 3, 'three');
check('an unknown type falls back to FS',
  parseDependencies([{ id: 'x', type: 'ZZ' }])[0].type === 'FS', 'FS');
check('null and empty parse to nothing',
  parseDependencies(null).length === 0 && parseDependencies([]).length === 0, 'empty');

/* ── the live shape: 42 tasks, no logic at all ───────────────────────────── */

{
  /* Every predecessors array on the live project is empty, so this is what the
     engine has to cope with — a list of dates rather than a network. */
  const tasks: CpmTask[] = [
    { id: '1', name: 'Site Mobilization', duration: 19, start_date: '2026-02-01', end_date: '2026-02-20', predecessors: [] },
    { id: '2', name: 'Earthwork & Grading', duration: 54, start_date: '2026-02-15', end_date: '2026-04-10', predecessors: [] },
    { id: '3', name: 'Foundation Pour', duration: 1, start_date: '2026-03-01', end_date: '2026-04-15', predecessors: [] },
  ];
  const n = computeCpm(tasks);
  check('a schedule with no logic still computes dates',
    n.tasks.every((t) => t.esDate && t.efDate), 'every task dated from its own start');
  check('each task keeps its own planned start',
    n.byId['1'].esDate === '2026-02-02' && n.byId['2'].esDate === '2026-02-16',
    `${n.byId['1'].esDate} / ${n.byId['2'].esDate} — the 1st and 15th are Sundays, pulled to Monday`);
  check('with no logic, only the longest task is critical',
    n.byId['2'].isCritical && !n.byId['1'].isCritical,
    'nothing constrains anything else — which is what the health check is for');
}

/* ── edges ───────────────────────────────────────────────────────────────── */

check('an empty schedule is handled',
  computeCpm([]).tasks.length === 0 && computeCpm([]).durationDays === 0, 'no crash');
check('a task with no duration derives one from its dates',
  computeCpm([{ id: 'A', start_date: '2026-09-07', end_date: '2026-09-11', predecessors: [] }]).byId.A.duration === 5,
  '5 working days');
check('a task with neither duration nor dates gets one day',
  computeCpm([{ id: 'A', predecessors: [] }]).byId.A.duration === 1, '1');

console.log(failures === 0 ? '\nALL CPM ASSERTIONS HELD' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
