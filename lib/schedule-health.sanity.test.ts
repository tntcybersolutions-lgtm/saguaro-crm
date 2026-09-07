/**
 * Schedule health sanity — the DCMA-style assessment.
 * Run: npx -y tsx lib/schedule-health.sanity.test.ts
 *
 * The first block is the live data. This platform's own demo project carries 42
 * tasks with an empty predecessors array on every one — a schedule with no
 * relationships at all. It prints, it has dates, it has a Gantt chart, and it
 * cannot tell anybody that anything is late. Nothing in the product said a word
 * about it until this check existed.
 */
import { assessSchedule } from './schedule-health';
import type { CpmTask } from './schedule-cpm';

let failures = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
  if (!cond) failures++;
};
const find = (h: ReturnType<typeof assessSchedule>, id: string) => h.checks.find((c) => c.id === id)!;

/* ── the live shape: dates with no logic ─────────────────────────────────── */

{
  const live: CpmTask[] = [
    { id: '1', name: 'Site Mobilization', duration: 19, start_date: '2026-02-01', end_date: '2026-02-20', predecessors: [], pct_complete: 100 },
    { id: '2', name: 'Earthwork & Grading', duration: 54, start_date: '2026-02-15', end_date: '2026-04-10', predecessors: [], pct_complete: 100 },
    { id: '3', name: 'Site Mobilization', duration: 1, start_date: '2026-03-01', end_date: '2026-03-14', predecessors: [], pct_complete: 0 },
    { id: '4', name: 'Foundation Pour', duration: 1, start_date: '2026-03-01', end_date: '2026-04-15', predecessors: [], pct_complete: 0 },
  ];
  const h = assessSchedule(live, { dataDate: '2026-09-07' });

  check('a schedule with no logic at all is a BLOCKER',
    find(h, 'no-logic').severity === 'blocker' && !find(h, 'no-logic').passed,
    'all four tasks free-floating — this is a list of dates, not a schedule');
  check('and it says so in those terms',
    /list of dates, not a schedule/.test(find(h, 'no-logic').detail), 'named plainly');

  check('duplicate task names are caught',
    !find(h, 'duplicate-names').passed && find(h, 'duplicate-names').count === 1,
    '"Site Mobilization" twice');
  check('a 1-day duration against a 46-day span is caught',
    !find(h, 'duration-mismatch').passed && (find(h, 'duration-mismatch').count ?? 0) >= 2,
    `${find(h, 'duration-mismatch').count} tasks whose duration disagrees with their own dates`);
  check('tasks past their finish date and unfinished are flagged',
    (find(h, 'missed').count ?? 0) === 2, `${find(h, 'missed').count} overdue`);
  check('a long task is flagged as unmeasurable',
    (find(h, 'high-duration').count ?? 0) === 1, '54 working days cannot be tracked');

  check('the score is capped hard by the blockers',
    h.score <= 45, `${h.score}`);
  check('totals are reported',
    h.totals.tasks === 4 && h.totals.openEnds === 4 && h.totals.withLogic === 0,
    `${h.totals.openEnds} open ends of ${h.totals.tasks}`);
}

/* ── a properly built schedule passes ────────────────────────────────────── */

{
  const good: CpmTask[] = [
    { id: 'A', name: 'Mobilise', duration: 5, start_date: '2026-09-07', predecessors: [], pct_complete: 0 },
    { id: 'B', name: 'Excavate', duration: 10, predecessors: [{ id: 'A' }], pct_complete: 0 },
    { id: 'C', name: 'Foundations', duration: 15, predecessors: [{ id: 'B' }], pct_complete: 0 },
    { id: 'D', name: 'Steel', duration: 20, predecessors: [{ id: 'C' }], pct_complete: 0 },
  ];
  const h = assessSchedule(good, { dataDate: '2026-09-07' });
  check('a properly linked schedule has no blockers',
    h.blockers === 0, `${h.blockers} blockers, ${h.warnings} warnings`);
  check('it has a critical path',
    find(h, 'critical-path').passed && h.totals.critical === 4, `${h.totals.critical} tasks`);
  check('and no open ends',
    find(h, 'open-ends').passed && h.totals.openEnds === 0, '0');
  check('it scores well', h.score >= 90, `${h.score}`);
}

/* ── each check, provoked deliberately ───────────────────────────────────── */

{
  const h = assessSchedule([
    { id: 'A', name: 'A', duration: 5, start_date: '2026-09-07', predecessors: [] },
    { id: 'B', name: 'B', duration: 5, predecessors: [{ id: 'A', lag: -2 }] },
  ], { dataDate: '2026-09-07' });
  check('a negative lag is flagged as a lead',
    !find(h, 'leads').passed && find(h, 'leads').count === 1,
    'the real sequence has not been modelled');
  check('and cites the DCMA threshold',
    find(h, 'leads').threshold === 'DCMA: 0 permitted', 'arguing with an owner is easier citing their own standard');
}

/* ── a fully linked task can still be a dead end ─────────────────────────── */

{
  /* The live failure this check was written for. Two chains grow from the same
     start; the B branch stops mid-project and drives nothing. Every task has a
     predecessor, so the open-ends check — which only catches the fully
     isolated — reported nothing at all, and the branch sat on float it had not
     earned. Delay B2 by a month and the project finish would not move. */
  const h = assessSchedule([
    { id: 'A1', name: 'A1', duration: 10, start_date: '2026-09-07', predecessors: [] },
    { id: 'A2', name: 'A2', duration: 60, predecessors: [{ id: 'A1' }] },
    { id: 'B1', name: 'B1', duration: 5, predecessors: [{ id: 'A1' }] },
    { id: 'B2', name: 'B2', duration: 5, predecessors: [{ id: 'B1' }] },
  ], { dataDate: '2026-09-07' });

  check('the old open-ends check sees nothing wrong',
    find(h, 'open-ends').passed && h.totals.openEnds === 0,
    'every task has a predecessor, so nothing is isolated');
  check('but the dead-end check catches the branch that drives nothing',
    !find(h, 'dead-ends').passed && find(h, 'dead-ends').count === 1,
    'B2 finishes mid-project with no successor — it cannot push the finish, so it collects float it has not earned');
  check('and the project finish itself is not counted against it',
    !find(h, 'dead-ends').taskIds?.includes('A2'), 'the last task to finish is allowed to drive nothing');
}

{
  /* The mirror: a task pinned to a typed date, driven by nothing, starting
     months after the job began. */
  const h = assessSchedule([
    { id: 'A', name: 'A', duration: 10, start_date: '2026-09-07', predecessors: [] },
    { id: 'B', name: 'B', duration: 10, predecessors: [{ id: 'A' }] },
    { id: 'C', name: 'C', duration: 10, start_date: '2026-11-02', predecessors: [] },
    { id: 'D', name: 'D', duration: 10, predecessors: [{ id: 'B' }, { id: 'C' }] },
  ], { dataDate: '2026-09-07' });
  check('a task driven by nothing is flagged even though it drives something',
    !find(h, 'orphan-starts').passed && find(h, 'orphan-starts').count === 1,
    'C is pinned to a date somebody typed; when the work in front of it slips, it will not move');
  check('the genuine project start is exempt',
    !find(h, 'orphan-starts').taskIds?.includes('A'), 'something has to start the job');
}

{
  const h = assessSchedule([
    { id: 'A', name: 'A', duration: 5, start_date: '2026-09-07', predecessors: [] },
    { id: 'B', name: 'B', duration: 5, predecessors: [{ id: 'A' }] },
    { id: 'C', name: 'C', duration: 5, predecessors: [{ id: 'B' }] },
  ], { dataDate: '2026-09-07' });
  check('a clean chain trips neither new check',
    find(h, 'dead-ends').passed && find(h, 'orphan-starts').passed,
    'one start, one finish, nothing dangling in between');
}

/* ── the lag and lead checks count RELATIONSHIPS, not tasks ──────────────── */

{
  /* One task with three predecessors, two of them lagged. The threshold is
     stated as a share of relationships, so it has to be measured that way —
     counting the one TASK against a task count would report 50% where the
     truth is 67% of relationships, against a threshold that describes neither. */
  const h = assessSchedule([
    { id: 'a', name: 'A', duration: 5, start_date: '2026-09-07', predecessors: [] },
    { id: 'b', name: 'B', duration: 5, start_date: '2026-09-07', predecessors: [] },
    { id: 'c', name: 'C', duration: 5, start_date: '2026-09-07', predecessors: [] },
    { id: 'd', name: 'D', duration: 5, predecessors: [
      { id: 'a', lag: 4 }, { id: 'b', lag: 2 }, { id: 'c' },
    ] },
  ], { dataDate: '2026-09-07' });
  const lags = find(h, 'lags');
  check('lagged RELATIONSHIPS are counted, not tasks carrying one',
    lags.count === 2, `${lags.count} of 3 relationships — one task, two lags`);
  check('and the percentage is of relationships',
    lags.pct === 66.7, `${lags.pct}% against a threshold stated in relationships`);
  check('the title says both numbers so nobody has to guess the denominator',
    /2 of 3 relationships/.test(lags.title), lags.title);
}

{
  const h = assessSchedule([
    { id: 'A', name: 'A', duration: 5, start_date: '2026-09-07', predecessors: [] },
    { id: 'B', name: 'B', duration: 5, predecessors: [{ id: 'A', type: 'SS' }] },
    { id: 'C', name: 'C', duration: 5, predecessors: [{ id: 'B', type: 'FF' }] },
  ], { dataDate: '2026-09-07' });
  check('a schedule leaning on SS and FF fails the relationship-type check',
    !find(h, 'rel-types').passed, `${find(h, 'rel-types').pct}% finish-to-start, against a 90% threshold`);
}

{
  const h = assessSchedule([
    { id: 'A', name: 'A', duration: 10, start_date: '2026-09-07', predecessors: [] },
    { id: 'B', name: 'B', duration: 10, predecessors: [{ id: 'A' }], deadline: '2026-09-25' },
  ], { dataDate: '2026-09-07' });
  check('negative float is a blocker, not a warning',
    !find(h, 'negative-float').passed && find(h, 'negative-float').severity === 'blocker',
    find(h, 'negative-float').detail.slice(0, 60));
  check('and the detail says how late, in days',
    /5 working days late/.test(find(h, 'negative-float').detail), 'a number, not an adjective');
}

{
  const h = assessSchedule([
    { id: 'A', name: 'A', duration: 5, start_date: '2026-09-07', predecessors: [{ id: 'C' }] },
    { id: 'B', name: 'B', duration: 5, predecessors: [{ id: 'A' }] },
    { id: 'C', name: 'C', duration: 5, predecessors: [{ id: 'B' }] },
  ], { dataDate: '2026-09-07' });
  check('a logic loop is a blocker',
    !find(h, 'cycles').passed && find(h, 'cycles').count === 3, 'three tasks in the loop');
}

{
  const h = assessSchedule([
    { id: 'A', name: 'A', duration: 5, start_date: '2026-09-07', predecessors: [{ id: 'GONE' }] },
    { id: 'B', name: 'B', duration: 5, predecessors: [{ id: 'A' }] },
  ], { dataDate: '2026-09-07' });
  check('a predecessor that was deleted is reported',
    !find(h, 'dangling-refs').passed, 'the successor is silently unconstrained otherwise');
}

{
  const h = assessSchedule([
    { id: 'A', name: 'A', duration: 5, start_date: '2026-08-03', end_date: '2026-08-07', predecessors: [], pct_complete: 0 },
    { id: 'B', name: 'B', duration: 5, predecessors: [{ id: 'A' }], pct_complete: 0 },
  ], { dataDate: '2026-09-07' });
  check('a task due to start with no progress is flagged',
    !find(h, 'not-started').passed, 'either late, or the schedule is not being updated');
}

{
  const h = assessSchedule([
    { id: 'A', name: 'A', duration: 5, start_date: '2026-10-05', end_date: '2026-10-09', predecessors: [], pct_complete: 100 },
    { id: 'B', name: 'B', duration: 5, predecessors: [{ id: 'A' }] },
  ], { dataDate: '2026-09-07' });
  check('a task complete before its own finish date is flagged',
    !find(h, 'complete-future').passed, 'the finish was never pulled back');
}

{
  /* Two long parallel chains, one much shorter — the short one collects float
     far beyond anything real. */
  const h = assessSchedule([
    { id: 'LONG', name: 'Long', duration: 120, start_date: '2026-09-07', predecessors: [] },
    { id: 'SHORT', name: 'Short', duration: 3, start_date: '2026-09-07', predecessors: [] },
    { id: 'END', name: 'End', duration: 1, predecessors: [{ id: 'LONG' }, { id: 'SHORT' }] },
  ], { dataDate: '2026-09-07' });
  check('float beyond 44 days is flagged as a modelling gap',
    !find(h, 'high-float').passed, `${find(h, 'high-float').count} task with two months of slack`);
}

/* ── plumbing ────────────────────────────────────────────────────────────── */

check('an empty schedule scores 100 and does not crash',
  assessSchedule([]).score === 100 && assessSchedule([]).totals.tasks === 0, 'no tasks, no findings');
check('every check reports whether it passed',
  assessSchedule([]).checks.every((c) => typeof c.passed === 'boolean'), 'all boolean');
check('failed checks are collected separately',
  (() => { const h = assessSchedule([{ id: 'A', name: 'A', duration: 5, start_date: '2026-09-07', predecessors: [] }]); return h.failed.every((c) => !c.passed); })(),
  'failed list holds only failures');

console.log(failures === 0 ? '\nALL SCHEDULE HEALTH ASSERTIONS HELD' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
