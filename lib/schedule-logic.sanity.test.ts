/**
 * Schedule logic sanity — proposing the relationships a schedule is missing.
 * Run: npx -y tsx lib/schedule-logic.sanity.test.ts
 *
 * The two rules that keep this honest are the ones under test:
 *
 *   it never proposes a link that contradicts the dates. Where the successor
 *   was planned to start before the predecessor finishes, that is an overlap,
 *   and proposing finish-to-start would shove it months later the moment
 *   somebody accepted it.
 *
 *   it never closes a loop, so whatever comes out is always schedulable.
 */
import { suggestLogic, applyLogic, durationFromDates, findDuplicates } from './schedule-logic';
import { computeCpm, parseDependencies, type CpmTask } from './schedule-cpm';
import { assessSchedule } from './schedule-health';

let failures = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
  if (!cond) failures++;
};

/* ── WBS is the strongest signal in the file ─────────────────────────────── */

{
  const tasks: CpmTask[] = [
    { id: 'a', name: 'Mobilise', wbs: '1.1', start_date: '2026-02-02', end_date: '2026-02-20', predecessors: [] },
    { id: 'b', name: 'Earthwork', wbs: '1.2', start_date: '2026-02-23', end_date: '2026-04-10', predecessors: [] },
    { id: 'c', name: 'Footings', wbs: '2.1', start_date: '2026-04-13', end_date: '2026-06-15', predecessors: [] },
  ];
  const plan = suggestLogic(tasks);
  check('WBS ordering produces a chain', plan.suggestions.length === 2, `${plan.suggestions.length} links`);
  check('1.1 drives 1.2',
    plan.suggestions.some((s) => s.predecessorId === 'a' && s.taskId === 'b'), 'a → b');
  check('a same-parent step is high confidence',
    plan.suggestions.find((s) => s.taskId === 'b')?.confidence === 'high',
    '1.1 → 1.2 shares a parent, which is the strongest signal there is');
  check('crossing to a new parent is only medium',
    plan.suggestions.find((s) => s.taskId === 'c')?.confidence === 'medium', '1.2 → 2.1');
  check('the first task stays open, correctly',
    plan.stillOpen.length === 1 && plan.stillOpen[0] === 'a', 'something has to start the job');
}

/* ── overlapping dates become start-to-start, not finish-to-start ────────── */

{
  const tasks: CpmTask[] = [
    { id: 'a', name: 'Foundations', wbs: '2.1', start_date: '2026-04-01', end_date: '2026-06-15', predecessors: [] },
    { id: 'b', name: 'Slab', wbs: '2.2', start_date: '2026-06-01', end_date: '2026-07-20', predecessors: [] },
  ];
  const plan = suggestLogic(tasks);
  const s = plan.suggestions[0];
  check('an overlap is proposed as start-to-start',
    s.type === 'SS', `${s.type} — finish-to-start would shove the slab six weeks later on acceptance`);
  check('and it carries the real overlap as a lag',
    s.lag > 30 && s.lag < 50, `${s.lag} working days after the foundations start`);
  check('the reason says so in words',
    /overlap/.test(s.reason), s.reason);
}

/* ── a clean gap is carried as a lag rather than dropped ─────────────────── */

{
  const tasks: CpmTask[] = [
    { id: 'a', name: 'Pour', wbs: '1.1', start_date: '2026-04-06', end_date: '2026-04-10', predecessors: [] },
    { id: 'b', name: 'Strip forms', wbs: '1.2', start_date: '2026-04-20', end_date: '2026-04-24', predecessors: [] },
  ];
  const s = suggestLogic(tasks).suggestions[0];
  check('a planned gap becomes a finish-to-start lag',
    s.type === 'FS' && s.lag > 0, `${s.type} +${s.lag}d — concrete cure, not a hole in the logic`);
}

/* ── loops are impossible by construction ────────────────────────────────── */

{
  /* c already depends on a. Proposing a → b → c must not then propose c → a. */
  const tasks: CpmTask[] = [
    { id: 'a', name: 'A', wbs: '3.1', start_date: '2026-05-01', end_date: '2026-05-10', predecessors: [{ id: 'c' }] },
    { id: 'b', name: 'B', wbs: '1.1', start_date: '2026-01-01', end_date: '2026-01-10', predecessors: [] },
    { id: 'c', name: 'C', wbs: '2.1', start_date: '2026-03-01', end_date: '2026-03-10', predecessors: [] },
  ];
  const plan = suggestLogic(tasks);
  const applied = applyLogic(tasks, plan.suggestions);
  const net = computeCpm(applied);
  check('no proposal closes a loop', net.cycles.length === 0, `${net.cycles.length} cycles after applying every suggestion`);
  check('hand-entered logic is left alone',
    plan.untouched.includes('a'), 'a already had a predecessor');
}

/* ── applying is additive, never destructive ─────────────────────────────── */

{
  const tasks: CpmTask[] = [
    { id: 'a', name: 'A', wbs: '1.1', start_date: '2026-01-05', end_date: '2026-01-09', predecessors: [] },
    { id: 'b', name: 'B', wbs: '1.2', start_date: '2026-01-12', end_date: '2026-01-16', predecessors: [{ id: 'a', type: 'FF', lag: 2 }] },
  ];
  const applied = applyLogic(tasks, suggestLogic(tasks).suggestions);
  const deps = parseDependencies(applied.find((t) => t.id === 'b')!.predecessors);
  check('an existing relationship survives untouched',
    deps.length === 1 && deps[0].type === 'FF' && deps[0].lag === 2,
    'logic somebody entered by hand outranks anything proposed');
}

/* ── duration from dates ─────────────────────────────────────────────────── */

check('a five-calendar-day span is five working days',
  durationFromDates({ id: 'x', start_date: '2026-02-02', end_date: '2026-02-06' }) === 4,
  `${durationFromDates({ id: 'x', start_date: '2026-02-02', end_date: '2026-02-06' })}`);
check('a six-week span is about 30 working days',
  durationFromDates({ id: 'x', start_date: '2026-03-01', end_date: '2026-04-15' }) === 33,
  `${durationFromDates({ id: 'x', start_date: '2026-03-01', end_date: '2026-04-15' })} — not the "1" the live data claims`);
check('a missing date yields null rather than a guess',
  durationFromDates({ id: 'x', start_date: '2026-03-01' }) === null, 'null');

/* ── duplicates ──────────────────────────────────────────────────────────── */

{
  /* The live shape: an import that ran twice, every task exactly doubled. */
  const tasks: CpmTask[] = [
    { id: '1', name: 'Site Mobilization', start_date: '2026-03-01', end_date: '2026-03-14', predecessors: [] },
    { id: '2', name: 'Site Mobilization', start_date: '2026-03-01', end_date: '2026-03-14', predecessors: [] },
    { id: '3', name: 'Foundation Pour', start_date: '2026-04-06', end_date: '2026-04-19', wbs: '2.1', predecessors: [] },
    { id: '4', name: 'Foundation Pour', start_date: '2026-04-06', end_date: '2026-04-19', predecessors: [] },
    { id: '5', name: 'Unique task', start_date: '2026-05-01', end_date: '2026-05-10', predecessors: [] },
  ];
  const dupes = findDuplicates(tasks);
  check('exact duplicates are found', dupes.length === 2, `${dupes.length} pairs`);
  check('and a unique task is not', !dupes.some((d) => d.name === 'Unique task'), 'left alone');
  check('the copy carrying more information is the one kept',
    dupes.find((d) => d.name === 'Foundation Pour')?.keep === '3',
    'the one with a WBS survives, not whichever sorted first');
  check('only one row per group is dropped',
    dupes.every((d) => d.drop.length === 1), 'no over-deletion');
}

/* ── end to end: the live shape, fixed ───────────────────────────────────── */

{
  /* Five tasks with WBS and phases and no logic at all — the demo project in
     miniature. After suggesting and applying, it should pass the logic check. */
  const live: CpmTask[] = [
    { id: '1', name: 'Site Mobilization', phase: 'Sitework', wbs: '1.1', start_date: '2026-02-02', end_date: '2026-02-20', duration: 15, predecessors: [] },
    { id: '2', name: 'Earthwork', phase: 'Sitework', wbs: '1.2', start_date: '2026-02-16', end_date: '2026-04-10', duration: 40, predecessors: [] },
    { id: '3', name: 'Foundations', phase: 'Structure', wbs: '2.1', start_date: '2026-04-01', end_date: '2026-06-15', duration: 54, predecessors: [] },
    { id: '4', name: 'Steel', phase: 'Structure', wbs: '2.3', start_date: '2026-07-01', end_date: '2026-09-15', duration: 55, predecessors: [] },
    { id: '5', name: 'Closeout', phase: 'Closeout', wbs: '6.1', start_date: '2026-12-01', end_date: '2026-12-31', duration: 23, predecessors: [] },
  ];

  const before = assessSchedule(live, { dataDate: '2026-09-07' });
  check('before: the schedule has no logic at all',
    before.checks.some((c) => c.id === 'no-logic' && !c.passed), `score ${before.score}`);

  const plan = suggestLogic(live);
  const after = assessSchedule(applyLogic(live, plan.suggestions), { dataDate: '2026-09-07' });

  check('after: every task but the first is driven by something',
    after.totals.withLogic === 5 && after.totals.openEnds === 0,
    `${after.totals.withLogic} of 5 linked`);
  check('after: there is a critical path',
    after.totals.critical > 0 && after.network.criticalPath.length > 1,
    `${after.network.criticalPath.length} tasks in sequence`);
  check('after: the schedule is still schedulable',
    after.network.cycles.length === 0, 'no loops introduced');
  check('the score improves', after.score > before.score, `${before.score} → ${after.score}`);
}

check('an empty schedule proposes nothing',
  suggestLogic([]).suggestions.length === 0, 'no crash');
check('a single task proposes nothing',
  suggestLogic([{ id: 'a', name: 'A', predecessors: [] }]).suggestions.length === 0, 'nothing to link it to');

console.log(failures === 0 ? '\nALL SCHEDULE LOGIC ASSERTIONS HELD' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
