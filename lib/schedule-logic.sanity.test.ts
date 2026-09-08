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
import { computeCpm, parseDependencies, addWorkDays, toDayIndex, fromDayIndex, FIVE_DAY, type CpmTask } from './schedule-cpm';
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

/* ── a link that runs backwards against the dates is refused ─────────────── */

{
  /* The live shape: WBS numbering and the calendar disagree. 3.3 was planned to
     start on 10 September and 4.1 on 1 August. Following the numbering blindly
     produced a start-to-start with the lag clamped to zero, which dragged 4.1
     five weeks later and pushed the project finish out with it. */
  const tasks: CpmTask[] = [
    { id: 'a', name: 'Envelope seal', wbs: '3.3', phase: 'Envelope', start_date: '2026-09-10', end_date: '2026-11-05', predecessors: [] },
    { id: 'b', name: 'Plumbing rough', wbs: '4.1', phase: 'MEP', start_date: '2026-08-03', end_date: '2026-10-15', predecessors: [] },
  ];
  const plan = suggestLogic(tasks);
  check('a predecessor that starts AFTER its successor is refused',
    !plan.suggestions.some((s) => s.predecessorId === 'a' && s.taskId === 'b'),
    'WBS says one order, the calendar says the other — the calendar wins');
  check('and the link is made the way the dates run instead',
    plan.suggestions.some((s) => s.predecessorId === 'b' && s.taskId === 'a'),
    'b starts first, so b drives a');

  const net = computeCpm(applyLogic(tasks, plan.suggestions));
  check('so neither task is dragged later than it was planned',
    net.byId.b.esDate === '2026-08-03', `${net.byId.b.esDate} — unchanged`);
}

/* ── a gap too long to be a lag is refused ───────────────────────────────── */

{
  /* The live shape: the phase rule hung Electrical Rough-in off Site
     Mobilization across five months and called the wait a lag. A link carrying
     eight times more waiting than working is a missing predecessor wearing a
     relationship's clothes. */
  const tasks: CpmTask[] = [
    { id: 'a', name: 'Site Mobilization', wbs: '1.1', start_date: '2026-02-01', end_date: '2026-02-20', predecessors: [] },
    { id: 'b', name: 'Electrical Rough-in', wbs: '1.2', start_date: '2026-08-01', end_date: '2026-11-01', predecessors: [] },
  ];
  const plan = suggestLogic(tasks);
  check('a gap far longer than the predecessor is not carried as a lag',
    plan.suggestions.length === 0,
    '115 days of waiting against 14 days of work is a predecessor nobody entered');
  check('and the task is left honestly open rather than falsely linked',
    plan.stillOpen.includes('b'), 'the health check can report an open end; it cannot report a lie');
}

{
  /* A cure period is a real lag and must survive the ceiling. */
  const tasks: CpmTask[] = [
    { id: 'a', name: 'Slab pour', wbs: '1.1', start_date: '2026-04-01', end_date: '2026-04-24', predecessors: [] },
    { id: 'b', name: 'Set steel', wbs: '1.2', start_date: '2026-05-11', end_date: '2026-06-05', predecessors: [] },
  ];
  const s = suggestLogic(tasks).suggestions[0];
  check('a genuine cure period is still carried',
    s && s.type === 'FS' && s.lag >= 10 && s.lag <= 20, `FS +${s?.lag}d — under the ceiling, so it survives`);
}

/* ── a phase hangs off the real end of the phase before it ───────────────── */

{
  /* The predecessor for a phase boundary is the last-finishing task of the
     previous phase, LINKED OR NOT. Building that lookup from the unlinked
     leftovers meant that by the time MEP was reached the only Sitework task
     left was the mobilisation, and MEP was hung off it across the whole job. */
  const tasks: CpmTask[] = [
    { id: 'm', name: 'Mobilise', phase: 'Sitework', wbs: '1.1', start_date: '2026-02-02', end_date: '2026-02-20', predecessors: [] },
    { id: 'e', name: 'Earthwork', phase: 'Sitework', wbs: '1.2', start_date: '2026-02-23', end_date: '2026-04-10', predecessors: [] },
    { id: 'p', name: 'Plumbing rough', phase: 'MEP', start_date: '2026-04-13', end_date: '2026-06-05', predecessors: [] },
  ];
  const plan = suggestLogic(tasks);
  const mep = plan.suggestions.find((s) => s.taskId === 'p');
  check('the phase boundary uses the last task of the previous phase',
    mep?.predecessorId === 'e', `${mep?.predecessorName} — not the mobilisation five weeks earlier`);
}

/* ── branches that drive nothing get closed ──────────────────────────────── */

{
  /* The live failure. Two chains grow forwards from the same start; one of
     them ends mid-project and drives nothing, so it collects float it has not
     earned and cannot push the finish no matter how late it runs. */
  const tasks: CpmTask[] = [
    { id: 'a', name: 'Mobilise', phase: 'Sitework', wbs: '1.1', start_date: '2026-02-02', end_date: '2026-02-20', predecessors: [] },
    { id: 'b', name: 'Envelope', phase: 'Envelope', wbs: '3.1', start_date: '2026-03-02', end_date: '2026-04-24', predecessors: [] },
    { id: 'c', name: 'Rough-in', phase: 'MEP', wbs: '4.1', start_date: '2026-05-04', end_date: '2026-06-26', predecessors: [] },
    { id: 'd', name: 'Closeout', phase: 'Closeout', wbs: '6.1', start_date: '2026-07-01', end_date: '2026-07-31', predecessors: [] },
  ];
  const applied = applyLogic(tasks, suggestLogic(tasks).suggestions);
  const net = computeCpm(applied);

  const drivesNothing = net.tasks.filter((r) => r.successors.length === 0);
  check('only the project finish drives nothing',
    drivesNothing.length === 1 && drivesNothing[0].id === 'd',
    `${drivesNothing.map((r) => r.id).join(', ')} — every other branch is tied into the network`);
  check('and no branch is left holding phantom float',
    net.tasks.every((r) => r.totalFloat < 44), `max float ${Math.max(...net.tasks.map((r) => r.totalFloat))} working days`);
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
  durationFromDates({ id: 'x', start_date: '2026-02-02', end_date: '2026-02-06' }) === 5,
  `${durationFromDates({ id: 'x', start_date: '2026-02-02', end_date: '2026-02-06' })} — Monday to Friday, counted against the calendar rather than estimated at five sevenths of the span`);

/* The reason exactness matters. Rebaselining writes dates from the critical
   path pass, which counts working days exactly. If this recomputed the duration
   column approximately from those dates, the next pass would use a number one
   day out and the project would slide every time the repair ran. */
{
  const round = (start: string, days: number) => {
    const end = fromDayIndex(addWorkDays(toDayIndex(start)!, days, FIVE_DAY));
    return durationFromDates({ id: 'x', start_date: start, end_date: end });
  };
  check('a duration survives a round trip through dates and back',
    [1, 5, 9, 20, 33, 64].every((d) => round('2026-09-07', d) === d),
    [1, 5, 9, 20, 33, 64].map((d) => `${d}→${round('2026-09-07', d)}`).join(' '));
  check('and it survives starting on a weekend',
    round('2026-03-01', 33) === 33, `${round('2026-03-01', 33)} — 1 March 2026 is a Sunday`);
}
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
