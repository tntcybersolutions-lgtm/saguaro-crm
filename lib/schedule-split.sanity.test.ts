/**
 * Schedule split sanity — breaking long activities into areas.
 * Run: npx -y tsx lib/schedule-split.sanity.test.ts
 *
 * The claim under test is the one that justifies the whole file: that splitting
 * a whole-building activity into areas turns overlap relationships into
 * finish-to-start ones, without inventing time and without losing any.
 *
 * The three ways this can silently go wrong, all covered below:
 *
 *   the pieces sum to something other than the task, so splitting moves the
 *   project a day at a time;
 *
 *   a start-to-start relationship is redirected to the LAST piece instead of
 *   the first, which pins a successor to a date months later than the one it
 *   referred to;
 *
 *   the old whole-task relationship is kept alongside the takt links, so the
 *   first zone waits for the last zone of its predecessor and the split buys
 *   nothing at all.
 */
import {
  suggestSplits, applySplits, mergeSplits, allocateDays, areasNeeded,
  defaultAreas, durationOf, allocateProgress, DEFAULT_TARGET_DAYS,
} from './schedule-split';
import { computeCpm, parseDependencies, workDaysBetween, toDayIndex, FIVE_DAY, type CpmTask } from './schedule-cpm';
import { assessSchedule } from './schedule-health';

let failures = 0;
const check = (name: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
  if (!cond) failures++;
};
const depsOf = (tasks: CpmTask[], id: string) =>
  parseDependencies(tasks.find((t) => String(t.id) === id)?.predecessors);

/* ── the days are conserved ──────────────────────────────────────────────── */

{
  check('a clean division is clean', allocateDays(60, [1, 1, 1]).join(',') === '20,20,20', '60 → 20,20,20');

  const awkward = allocateDays(55, [1, 1, 1]);
  check('an awkward one still sums to the task',
    awkward.reduce((a, b) => a + b, 0) === 55, `${awkward.join(',')} = 55 — a schedule that grows a day per split is worse than one that never splits`);

  const weighted = allocateDays(60, [2, 1, 1]);
  check('weights are honoured',
    weighted[0] === 30 && weighted.reduce((a, b) => a + b, 0) === 60,
    `${weighted.join(',')} — a ground floor with the lobby is more work than the floor above it`);

  check('no area is ever zero days',
    allocateDays(4, [1, 1, 1, 1, 1]).every((d) => d >= 1), 'a zero-day area is a milestone, not a place');
  check('one area is the task you started with', allocateDays(30, [1]).join(',') === '30', '30');
}

check('a 55-day task at a 20-day target wants three areas', areasNeeded(55, 20, 8) === 3, '3');
check('a 66-day task wants four', areasNeeded(66, 20, 8) === 4, '4');
check('the cap holds', areasNeeded(400, 20, 8) === 8, 'past eight the pieces stop being places');
check('zone naming reads like a scheduler typed it',
  defaultAreas(3).map((a) => a.name).join(', ') === 'Zone A, Zone B, Zone C', 'Zone A, Zone B, Zone C');
check('levels too', defaultAreas(2, 'level').map((a) => a.name).join(', ') === 'Level 1, Level 2', 'Level 1, Level 2');

/* ── duration is read from the dates, not the column ─────────────────────── */

check('the dates outrank a duration column that disagrees',
  durationOf({ id: 'x', duration: 1, start_date: '2026-03-01', end_date: '2026-04-15' }) === 33,
  '33 working days — the live rows carry 1 against a 46-day span, and the Gantt drew the span');

/* ── a split preserves the span it came from ─────────────────────────────── */

{
  const t: CpmTask = { id: 's', name: 'Structural Steel Erection', wbs: '2.3', start_date: '2026-07-01', end_date: '2026-09-15', predecessors: [] };
  const { plans } = suggestSplits([t]);
  const p = plans[0];

  check('a 55-day whole-building task is proposed for splitting',
    plans.length === 1 && p.pieces.length === 3, `${p?.pieces.length} areas of about ${Math.round(p?.originalDuration / 3)} days`);
  check('the pieces sum to the original duration',
    p.pieces.reduce((a, x) => a + x.duration, 0) === p.originalDuration,
    `${p.pieces.map((x) => x.duration).join('+')} = ${p.originalDuration}`);
  check('the first piece starts where the task started',
    p.pieces[0].startDate === '2026-07-01', p.pieces[0].startDate!);
  check('and the last finishes where the task finished',
    p.pieces[2].endDate === '2026-09-15', `${p.pieces[2].endDate} — splitting does not change how long the work takes`);
  check('each piece is under the DCMA duration threshold',
    p.pieces.every((x) => x.duration <= 44), `longest ${Math.max(...p.pieces.map((x) => x.duration))} working days`);
  check('the WBS nests under the parent',
    p.pieces.map((x) => x.wbs).join(', ') === '2.3.1, 2.3.2, 2.3.3', p.pieces.map((x) => x.wbs).join(', '));
  check('the pieces are named for places somebody can walk',
    p.pieces[1].name === 'Structural Steel Erection — Zone B', p.pieces[1].name);
}

/* ── short tasks are left alone ──────────────────────────────────────────── */

{
  const { plans, skipped } = suggestSplits([
    { id: 'a', name: 'Mobilise', start_date: '2026-02-02', end_date: '2026-02-20', predecessors: [] },
    { id: 'b', name: 'Closeout', start_date: '2026-12-01', end_date: '2026-12-31', predecessors: [] },
  ]);
  check('a task short enough to track is not touched',
    plans.length === 0 && skipped.length === 0, 'nothing to gain — one area is the task you started with');
}

{
  const { plans, skipped } = suggestSplits([
    { id: 'a', name: 'Long thing, no dates', duration: 60, predecessors: [] },
  ]);
  check('a long task with no start date is skipped, not guessed at',
    plans.length === 0 && skipped.length === 1 && /no start date/.test(skipped[0].reason),
    skipped[0]?.reason ?? '');
}

/* ── inside a split, the pieces sequence finish-to-start ─────────────────── */

{
  const tasks: CpmTask[] = [
    { id: 'p', name: 'Foundations', start_date: '2026-04-01', end_date: '2026-05-01', predecessors: [] },
    { id: 's', name: 'Steel', start_date: '2026-07-01', end_date: '2026-09-15', predecessors: [{ id: 'p', type: 'FS', lag: 0 }] },
  ];
  const { plans } = suggestSplits(tasks);
  const out = applySplits(tasks, plans);

  check('the original task is gone, replaced by its areas',
    !out.some((t) => String(t.id) === 's') && out.filter((t) => t.parent_task_id === 's').length === 3,
    `${out.length} tasks out`);

  const b = depsOf(out, 's::a2');
  check('each area follows the one before it, finish-to-start with no lag',
    b.length === 1 && b[0].id === 's::a1' && (b[0].type ?? 'FS') === 'FS' && (b[0].lag ?? 0) === 0,
    'the crew moved from Zone A to Zone B — no judgement, no overlap');

  const a = depsOf(out, 's::a1');
  check('the outside world drives the first area only',
    a.length === 1 && a[0].id === 'p',
    'hanging it on every piece would pin them all to the same date and undo the sequence');
  check('and the later areas are not also pinned to it',
    !depsOf(out, 's::a3').some((d) => d.id === 'p'), 'Zone C waits on Zone B, which waits on the foundations');
}

/* ── a relationship is redirected to the end it referred to ──────────────── */

{
  /* The quiet one. A start-to-start pointed at the LAST piece waits for work it
     never referred to, and the successor moves months. */
  const tasks: CpmTask[] = [
    { id: 's', name: 'Steel', start_date: '2026-07-01', end_date: '2026-09-15', predecessors: [] },
    { id: 'f', name: 'Fireproofing', start_date: '2026-08-01', end_date: '2026-08-20', predecessors: [{ id: 's', type: 'SS', lag: 5 }] },
    { id: 'x', name: 'Inspection', start_date: '2026-09-16', end_date: '2026-09-18', predecessors: [{ id: 's', type: 'FS', lag: 0 }] },
  ];
  const out = applySplits(tasks, suggestSplits(tasks).plans);

  const ss = depsOf(out, 'f')[0];
  check('a start-to-start follows the predecessor to its FIRST area',
    ss.id === 's::a1' && ss.type === 'SS' && ss.lag === 5,
    `${ss.id} — it cared about when the steel started, and the steel still starts there`);

  const fs = depsOf(out, 'x')[0];
  check('a finish-to-start follows it to the LAST',
    fs.id === 's::a3' && fs.type === 'FS',
    `${fs.id} — it cared about when the steel finished`);
}

/* ── the trades flow, and that is the whole point ────────────────────────── */

{
  /* Two whole-building activities overlapping by design: 55 days of steel and
     37 of deck, related start-to-start with a 36-day lag because there is no
     other way to relate two things that both cover the whole building.
     Split into the same zones and the deck follows the steel one zone behind. */
  const tasks: CpmTask[] = [
    { id: 'a', name: 'Mobilise', start_date: '2026-06-01', end_date: '2026-06-30', predecessors: [] },
    { id: 's', name: 'Structural Steel', start_date: '2026-07-01', end_date: '2026-09-15', predecessors: [{ id: 'a', type: 'FS', lag: 0 }] },
    { id: 'd', name: 'Metal Deck', start_date: '2026-08-20', end_date: '2026-10-10', predecessors: [{ id: 's', type: 'SS', lag: 36 }] },
  ];

  const proposal = suggestSplits(tasks);
  check('the plan counts what it buys rather than claiming it',
    proposal.newRelationships === 4 && proposal.taktLinks === 3,
    `${proposal.newRelationships} new finish-to-start links inside the tasks, ${proposal.taktLinks} takt links between them`);

  const out = applySplits(tasks, proposal.plans);

  const dA = depsOf(out, 'd::a1');
  check('Zone A of the deck waits on Zone A of the steel, not on all the steel',
    dA.length === 1 && dA[0].id === 's::a1' && (dA[0].type ?? 'FS') === 'FS' && (dA[0].lag ?? 0) === 0,
    `${dA[0]?.id} FS+0 — this is how buildings actually get built`);

  check('the old whole-task overlap is dropped, not kept alongside',
    !out.some((t) => parseDependencies(t.predecessors).some((x) => x.type === 'SS' && x.lag === 36)),
    'keeping it would make Zone A wait for Zone C and give back everything the split was for');

  const dB = depsOf(out, 'd::a2').map((x) => x.id).sort();
  check('and each later zone waits on both its own trade and the one ahead',
    dB.join(', ') === 'd::a1, s::a2',
    `${dB.join(', ')} — the deck crew finishes Zone A, the steel crew finishes Zone B`);

  /* The payoff, measured. */
  const before = computeCpm(tasks);
  const after = computeCpm(out);
  check('the network is still schedulable', after.cycles.length === 0, '0 cycles');
  check('every relationship after the split is finish-to-start',
    out.every((t) => parseDependencies(t.predecessors).every((d) => (d.type ?? 'FS') === 'FS')),
    'against a DCMA threshold of 90%');
  check('and none of them carries a lag',
    out.every((t) => parseDependencies(t.predecessors).every((d) => (d.lag ?? 0) === 0)),
    'against a DCMA threshold of 5%');
  check('the project does not get longer',
    toDayIndex(after.projectFinish)! <= toDayIndex(before.projectFinish)!,
    `${before.projectFinish} → ${after.projectFinish} — the split found compression that was always there, it did not invent time`);
}

/* ── the DCMA findings the split exists to clear ─────────────────────────── */

{
  /* The live shape in miniature: four whole-building activities, every
     relationship an overlap, every task too long to track. */
  const live: CpmTask[] = [
    { id: '1', name: 'Foundations', wbs: '2.1', start_date: '2026-04-01', end_date: '2026-06-15', predecessors: [] },
    { id: '2', name: 'Structural Steel', wbs: '2.3', start_date: '2026-07-01', end_date: '2026-09-15', predecessors: [{ id: '1', type: 'SS', lag: 44 }] },
    { id: '3', name: 'Metal Deck', wbs: '3.1', start_date: '2026-08-20', end_date: '2026-10-10', predecessors: [{ id: '2', type: 'SS', lag: 36 }] },
    { id: '4', name: 'Interior Finishes', wbs: '5.1', start_date: '2026-10-01', end_date: '2026-12-10', predecessors: [{ id: '3', type: 'SS', lag: 30 }] },
  ];

  const before = assessSchedule(live, { dataDate: '2026-04-01' });
  const after = assessSchedule(applySplits(live, suggestSplits(live).plans), { dataDate: '2026-04-01' });

  const f = (h: typeof before, id: string) => h.checks.find((c) => c.id === id)!;

  check('before: every task is too long to track',
    (f(before, 'high-duration').count ?? 0) === 3, `${f(before, 'high-duration').count} of 4 over 44 working days`);
  check('after: none of them are',
    f(after, 'high-duration').passed, `${f(after, 'high-duration').count} — every piece fits inside a takt window`);

  check('before: the relationships are all overlaps',
    f(before, 'rel-types').pct === 0 && (f(before, 'lags').count ?? 0) === 3,
    `${f(before, 'rel-types').pct}% finish-to-start, 3 of 3 lagged`);
  check('after: they are all finish-to-start with no lag',
    f(after, 'rel-types').pct === 100 && (f(after, 'lags').count ?? 0) === 0,
    '100% finish-to-start, 0 lagged — the three findings had one root, and this is it');

  check('the score improves', after.score > before.score, `${before.score} → ${after.score}`);
  check('and no blockers are introduced', after.blockers === 0, `${after.blockers} blockers`);
}

/* ── progress follows the sequence rather than being thrown away ─────────── */

{
  const tasks: CpmTask[] = [
    { id: 's', name: 'Steel', start_date: '2026-07-01', end_date: '2026-09-15', pct_complete: 40, status: 'in_progress', predecessors: [] },
  ];
  const plan = suggestSplits(tasks).plans[0];
  const share = allocateProgress(tasks[0], plan);

  check('progress is spread across the pieces in the order they run',
    share[0] === 100 && share[1] > 0 && share[1] < 100 && share[2] === 0,
    `${share.join('% / ')}% — 40% of the work done means the first 40% of the sequence is done`);
  check('and it adds back up to what the task claimed',
    Math.abs(plan.pieces.reduce((a, p, i) => a + p.duration * share[i], 0) / plan.originalDuration - 40) < 1.5,
    'no progress invented, none lost');

  const out = applySplits(tasks, [plan]);
  check('status is derived to agree with each piece',
    out.map((t) => t.status).join(', ') === 'complete, in_progress, not_started',
    out.map((t) => t.status).join(', '));

  check('a task nobody has started stays unstarted',
    allocateProgress({ id: 'x' }, plan).every((p) => p === 0), 'all zero');
  check('a finished task is finished in every area',
    allocateProgress({ id: 'x', pct_complete: 100 }, plan).every((p) => p === 100), 'all 100');
}

{
  /* The bug this replaced: nulling progress wiped every percentage on a live
     schedule, and 29 tasks that were being worked read as never started. */
  const live: CpmTask[] = [
    { id: '1', name: 'Foundations', start_date: '2026-04-01', end_date: '2026-06-15', pct_complete: 100, predecessors: [] },
    { id: '2', name: 'Steel', start_date: '2026-07-01', end_date: '2026-09-15', pct_complete: 60, predecessors: [{ id: '1', type: 'SS', lag: 44 }] },
  ];
  const out = applySplits(live, suggestSplits(live).plans);

  check('work already finished is still finished after the split',
    out.filter((t) => Number(t.pct_complete) === 100).length === 4,
    `${out.filter((t) => Number(t.pct_complete) === 100).length} pieces complete — all three zones of the foundations, plus the first zone of steel`);
  check('and work in progress is still in progress',
    out.some((t) => Number(t.pct_complete) > 0 && Number(t.pct_complete) < 100),
    'the zone the crew is standing in');

  /* What the split legitimately exposes. "60% complete" against a task that is
     76% of the way through its own duration is behind, and saying so whole is
     impossible — the number that hides it is the single percentage. Split into
     zones, the zone nobody has started is named. */
  const after = assessSchedule(out, { dataDate: '2026-09-07' });
  check('and the zone nobody has started is named rather than averaged away',
    (after.checks.find((c) => c.id === 'not-started')?.count ?? 0) === 1,
    'Zone C was due to start on 21 August and shows nothing — "60% complete" could never say that');
}

/* ── splitting is reversible ─────────────────────────────────────────────── */

{
  const tasks: CpmTask[] = [
    { id: 'p', name: 'Foundations', start_date: '2026-04-01', end_date: '2026-05-01', predecessors: [] },
    { id: 's', name: 'Steel', wbs: '2.3', start_date: '2026-07-01', end_date: '2026-09-15', predecessors: [{ id: 'p', type: 'FS', lag: 0 }] },
    { id: 'x', name: 'Inspection', start_date: '2026-09-16', end_date: '2026-09-18', predecessors: [{ id: 's', type: 'FS', lag: 0 }] },
  ];
  const split = applySplits(tasks, suggestSplits(tasks).plans);
  const back = mergeSplits(split, 's');
  const restored = back.find((t) => String(t.id) === 's')!;

  check('a split can be undone', !!restored && back.length === tasks.length, `${back.length} tasks, as it started`);
  check('the rebuilt task spans what it always spanned',
    restored.start_date === '2026-07-01' && restored.end_date === '2026-09-15',
    `${restored.start_date} → ${restored.end_date}`);
  check('its name loses the area suffix', restored.name === 'Steel', String(restored.name));
  check('its WBS comes back', restored.wbs === '2.3', String(restored.wbs));
  check('what drove it still drives it',
    parseDependencies(restored.predecessors).length === 1 && parseDependencies(restored.predecessors)[0].id === 'p',
    'the foundations');
  check('and what it drove still points at it',
    depsOf(back, 'x')[0]?.id === 's', 'the inspection follows the steel again, not a piece that no longer exists');
}

/* ── plumbing ────────────────────────────────────────────────────────────── */

check('an empty schedule proposes nothing',
  suggestSplits([]).plans.length === 0, 'no crash');
check('applying nothing changes nothing',
  applySplits([{ id: 'a', name: 'A', predecessors: [] }], []).length === 1, 'the same list back');
check('merging a task that was never split changes nothing',
  mergeSplits([{ id: 'a', name: 'A', predecessors: [] }], 'a').length === 1, 'no-op');
check('the target window is a takt window, not the DCMA ceiling',
  DEFAULT_TARGET_DAYS === 20 && DEFAULT_TARGET_DAYS < 44,
  '20 working days — 44 is where a task becomes indefensible, not where it becomes good');

console.log(failures === 0 ? '\nALL SCHEDULE SPLIT ASSERTIONS HELD' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
