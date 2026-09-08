/**
 * lib/schedule-health.ts
 *
 * Whether the schedule is a schedule, or a list of dates in a nice colour.
 *
 * The industry has an answer to this — the DCMA 14-point assessment, which
 * every serious owner runs against a contractor's programme and which neither
 * Procore nor Buildern ships. It is the schedule equivalent of the bid
 * readiness check: a schedule can print beautifully and still be meaningless,
 * and the failures are all mechanically findable.
 *
 * The one that matters most on live data: LOGIC. A task with no predecessor and
 * no successor is not driven by anything and drives nothing. It cannot slip,
 * because nothing is watching it, and it cannot be late, because nothing
 * depends on it. On this platform's own demo project all 42 tasks have an empty
 * predecessors array — a schedule with no relationships at all, which no
 * critical path can rescue, and which no tool currently says a word about.
 */

import {
  computeCpm, rescheduleFromDataDate, toDayIndex, parseDependencies, workDaysBetween, FIVE_DAY,
  type CpmTask, type CpmNetwork, type Calendar, type ReschedulePlan,
} from './schedule-cpm';

export type CheckSeverity = 'blocker' | 'warn' | 'note';

export interface ScheduleCheck {
  id: string;
  severity: CheckSeverity;
  title: string;
  detail: string;
  /** Share of tasks affected, where the check is proportional. */
  pct?: number;
  count?: number;
  /** The industry threshold this is measured against, when there is one. */
  threshold?: string;
  taskIds?: string[];
  passed: boolean;
}

export interface ScheduleHealth {
  checks: ScheduleCheck[];
  failed: ScheduleCheck[];
  blockers: number;
  warnings: number;
  /** 0-100. How much of the assessment the schedule passes, weighted. */
  score: number;
  /**
   * The logic network, ignoring progress. What the plan says, structurally —
   * the right thing to check loops, dangling references and open ends against,
   * because none of those care what has been built yet.
   */
  network: CpmNetwork;
  /**
   * The same schedule with progress honoured: work that has started pinned at
   * its actuals, everything else rescheduled from the data date.
   *
   * This is the one that answers "when does this finish". The logic network
   * answers "how long would this plan take if it all ran again from the
   * beginning", which stops being the question the moment a shovel goes in the
   * ground. On the demo project the two disagreed by ten weeks — the logic
   * network read 6 November because it was free to schedule September's work
   * back in February, while the honest forecast was 3 February.
   */
  forecast: ReschedulePlan;
  totals: {
    tasks: number;
    complete: number;
    inProgress: number;
    notStarted: number;
    critical: number;
    nearCritical: number;
    withLogic: number;
    openEnds: number;
  };
}

const pctOf = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

/**
 * Assess a schedule.
 *
 * Thresholds follow the DCMA assessment where it has one, because an estimator
 * arguing with an owner's scheduler is better off citing the same standard the
 * scheduler is using than a number we invented.
 */
export function assessSchedule(
  tasks: CpmTask[],
  opts: { calendar?: Calendar; dataDate?: string | null; baselineFinish?: string | null } = {},
): ScheduleHealth {
  const cal = opts.calendar ?? FIVE_DAY;
  const n = tasks.length;
  const checks: ScheduleCheck[] = [];
  const dataDate = toDayIndex(opts.dataDate ?? null) ?? Math.floor(Date.now() / 86_400_000);

  /* Two passes, because two different questions are being asked.
   *
   * `network` ignores progress and answers "what does this plan say" — the
   * right basis for loops, dangling references and open ends, none of which
   * care what has been built.
   *
   * `forecast` honours progress and answers "when does this finish". Float and
   * the critical path belong to it, because float measured on the logic network
   * is float against a plan that is free to reschedule September's work back
   * into February. On the demo project that gap was ten weeks wide, and the
   * flattering half was the one on screen. */
  const network = computeCpm(tasks, { calendar: cal });
  const forecast = rescheduleFromDataDate(tasks, { calendar: cal, dataDate: opts.dataDate });
  const dated = forecast.network;

  const pct = (t: CpmTask) => {
    const v = Number(t.pct_complete);
    return Number.isFinite(v) ? v : 0;
  };
  const idsOf = (pred: (t: CpmTask) => boolean) => tasks.filter(pred).map((t) => String(t.id));
  const taskById = new Map(tasks.map((t) => [String(t.id), t]));

  const add = (c: Omit<ScheduleCheck, 'passed'> & { passed?: boolean }) =>
    checks.push({ ...c, passed: c.passed ?? ((c.count ?? 0) === 0) });

  /* ── 1. Logic. The one that decides whether this is a schedule at all ─── */

  const noPred = new Set(tasks.filter((t) => parseDependencies(t.predecessors).length === 0).map((t) => String(t.id)));
  const hasSucc = new Set<string>();
  for (const t of tasks) for (const d of parseDependencies(t.predecessors)) hasSucc.add(d.id);
  const openEnds = tasks.filter((t) => noPred.has(String(t.id)) && !hasSucc.has(String(t.id)));
  const withLogic = n - openEnds.length;

  if (n > 0 && withLogic === 0) {
    add({
      id: 'no-logic', severity: 'blocker',
      title: 'The schedule has no logic at all',
      detail: `All ${n} tasks are free-floating — no task drives another. Dates on a schedule with no relationships cannot move when reality does, so nothing here will ever tell you a delay has happened. This is a list of dates, not a schedule.`,
      count: n, pct: 100, taskIds: openEnds.slice(0, 40).map((t) => String(t.id)),
    });
  } else {
    add({
      id: 'open-ends', severity: 'blocker',
      title: `${openEnds.length} task${openEnds.length === 1 ? '' : 's'} with no predecessor and no successor`,
      detail: 'A dangling task is driven by nothing and drives nothing. It cannot slip, because nothing is watching it. DCMA allows none.',
      count: openEnds.length, pct: pctOf(openEnds.length, n),
      threshold: 'DCMA: 0 permitted',
      taskIds: openEnds.slice(0, 40).map((t) => String(t.id)),
    });
  }

  /* A task can be fully linked and still be a dead end.
   *
   * The check above only catches a task with NEITHER a predecessor NOR a
   * successor. DCMA counts a task missing EITHER, and the difference is not
   * academic. On this platform's own demo project a nine-task chain ran
   * 1.1 Site Mobilization through 3.3 Building Envelope Seal and then simply
   * stopped, driving nothing. Every task in it was "linked", the schedule
   * reported zero dangling, and the whole branch sat on five weeks of float
   * that existed only because nothing downstream was waiting on it. Delay any
   * of those nine and the project finish would not have moved a day — which is
   * precisely the failure logic is supposed to prevent.
   *
   * The last task to finish is allowed to drive nothing; it is the finish. The
   * first to start is allowed to be driven by nothing. Everything else owes
   * the network a link in both directions. */
  const openEndIds = new Set(openEnds.map((t) => String(t.id)));
  if (n > 0 && withLogic > 0) {
    const efs = network.tasks.map((r) => r.ef);
    const ess = network.tasks.map((r) => r.es);
    const lastFinish = Math.max(...efs);
    const firstStart = Math.min(...ess);

    const deadEnds = tasks.filter((t) => {
      const r = network.byId[String(t.id)];
      return r && r.successors.length === 0 && r.ef < lastFinish && !openEndIds.has(String(t.id));
    });
    add({
      id: 'dead-ends', severity: 'warn',
      title: `${deadEnds.length} task${deadEnds.length === 1 ? ' drives' : 's drive'} nothing downstream`,
      detail: 'A task with no successor cannot push the project finish, so it collects float it has not earned and slips without anyone hearing about it. Only the last task to finish is allowed to drive nothing.',
      count: deadEnds.length, pct: pctOf(deadEnds.length, n),
      threshold: 'DCMA: 0 permitted besides the project finish',
      taskIds: deadEnds.slice(0, 40).map((t) => String(t.id)),
    });

    const orphanStarts = tasks.filter((t) => {
      const r = network.byId[String(t.id)];
      return r && r.predecessors.length === 0 && r.es > firstStart && !openEndIds.has(String(t.id));
    });
    add({
      id: 'orphan-starts', severity: 'warn',
      title: `${orphanStarts.length} task${orphanStarts.length === 1 ? ' is' : 's are'} driven by nothing`,
      detail: 'A task with no predecessor is pinned to the date somebody typed. When the work in front of it slips, this one does not move, and the schedule quietly stops describing the job.',
      count: orphanStarts.length, pct: pctOf(orphanStarts.length, n),
      threshold: 'DCMA: 0 permitted besides the project start',
      taskIds: orphanStarts.slice(0, 40).map((t) => String(t.id)),
    });
  }

  /* Relationship-level counts. These checks are stated as a share OF
     RELATIONSHIPS, so they have to be counted that way — the first version
     counted TASKS carrying a lag and divided by the TASK count, which is a
     different number against a threshold that does not describe it. */
  let totalRels = 0, fsRels = 0, lagRels = 0, leadRels = 0;
  const leadTaskIds: string[] = [];
  const lagTaskIds: string[] = [];
  for (const t of tasks) {
    for (const d of parseDependencies(t.predecessors)) {
      totalRels++;
      if ((d.type ?? 'FS') === 'FS') fsRels++;
      const lag = d.lag ?? 0;
      if (lag < 0) { leadRels++; if (!leadTaskIds.includes(String(t.id))) leadTaskIds.push(String(t.id)); }
      if (lag > 0) { lagRels++; if (!lagTaskIds.includes(String(t.id))) lagTaskIds.push(String(t.id)); }
    }
  }
  const relPct = (x: number) => (totalRels > 0 ? Math.round((x / totalRels) * 1000) / 10 : 0);

  /* ── 2. Leads. Negative lag hides real sequence ───────────────────────── */

  add({
    id: 'leads', severity: 'warn',
    title: `${leadRels} relationship${leadRels === 1 ? ' uses' : 's use'} a negative lag`,
    detail: 'A lead makes a successor start before its predecessor finishes. It usually means the real sequence has not been modelled — break the predecessor into two tasks instead.',
    count: leadRels, pct: relPct(leadRels), threshold: 'DCMA: 0 permitted',
    taskIds: leadTaskIds.slice(0, 20),
  });

  /* ── 3. Lags. Excessive lag substitutes for missing work ──────────────── */

  add({
    id: 'lags', severity: 'note',
    title: `${lagRels} of ${totalRels} relationship${totalRels === 1 ? '' : 's'} carr${lagRels === 1 ? 'ies' : 'y'} a positive lag${totalRels ? ` (${relPct(lagRels)}%)` : ''}`,
    detail: 'A lag is unmodelled time. A few are fine — concrete cure, submittal review. Many usually means work that should be its own task, and a lag doing the sequencing means nothing moves when reality does.',
    count: lagRels, pct: relPct(lagRels), threshold: 'DCMA: under 5% of relationships',
    passed: totalRels === 0 || relPct(lagRels) <= 5,
  });

  /* ── 4. Relationship types. FS should dominate ────────────────────────── */

  const fsPct = totalRels > 0 ? pctOf(fsRels, totalRels) : 0;
  add({
    id: 'rel-types', severity: 'note',
    title: totalRels === 0 ? 'No relationships to classify' : `${fsPct}% of relationships are finish-to-start`,
    detail: 'Finish-to-start is the sequence people actually build in. A schedule leaning on SS and FF is usually modelling overlap it has not thought through.',
    pct: fsPct, threshold: 'DCMA: at least 90%',
    passed: totalRels === 0 || fsPct >= 90,
  });

  /* ── 5. Hard constraints ──────────────────────────────────────────────── */

  const constrained = tasks.filter((t) => !!t.constraint_start || !!t.deadline);
  add({
    id: 'constraints', severity: 'warn',
    title: `${constrained.length} task${constrained.length === 1 ? ' has' : 's have'} a hard date constraint`,
    detail: 'A constraint overrides logic and hides float. Real milestones need them; convenience does not.',
    count: constrained.length, pct: pctOf(constrained.length, n),
    threshold: 'DCMA: under 5% of tasks',
    passed: pctOf(constrained.length, n) <= 5,
    taskIds: constrained.slice(0, 20).map((t) => String(t.id)),
  });

  /* ── 6. High float. Usually a symptom of missing logic ────────────────── */

  /* Float belongs to work that has not happened yet.
   *
   * Measured on the forecast, a task finished in March against a project
   * finishing next February carries eleven months of "float" — which is not a
   * modelling gap, it is the arithmetic of already being done. Counting those
   * took this finding from 3 tasks to 23 the moment the assessment started
   * honouring progress, and every one of the 20 was noise. */
  const remaining = (id: string) => pct(taskById.get(id) ?? { id }) < 100;
  const highFloat = dated.tasks.filter((t) => t.totalFloat > 44 && remaining(t.id));
  add({
    id: 'high-float', severity: 'warn',
    title: `${highFloat.length} task${highFloat.length === 1 ? ' has' : 's have'} more than 44 days of float`,
    detail: 'Two months of slack usually means a missing successor rather than genuine freedom. Float that large is a modelling gap, not an opportunity.',
    count: highFloat.length, pct: pctOf(highFloat.length, n),
    threshold: 'DCMA: under 5% of tasks',
    passed: pctOf(highFloat.length, n) <= 5,
    taskIds: highFloat.slice(0, 20).map((t) => t.id),
  });

  /* ── 7. Negative float. Already late ──────────────────────────────────── */

  /* Same reasoning: work that is finished cannot be running late. */
  const negFloat = dated.tasks.filter((t) => t.totalFloat < 0 && remaining(t.id));
  const worst = negFloat.length ? Math.min(...negFloat.map((t) => t.totalFloat)) : 0;
  add({
    id: 'negative-float', severity: 'blocker',
    title: `${negFloat.length} task${negFloat.length === 1 ? ' is' : 's are'} behind their required dates`,
    detail: negFloat.length
      ? `The worst is ${Math.abs(worst)} working days late. Negative float is not a warning about the future — it is a statement that the current plan cannot meet a date it has already committed to.`
      : 'No task finishes later than the date it has to.',
    count: negFloat.length, pct: pctOf(negFloat.length, n),
    threshold: 'DCMA: 0 permitted',
    taskIds: negFloat.slice(0, 20).map((t) => t.id),
  });

  /* ── 8. High duration. Too coarse to manage ───────────────────────────── */

  const longTasks = network.tasks.filter((t) => t.duration > 44);
  add({
    id: 'high-duration', severity: 'note',
    title: `${longTasks.length} task${longTasks.length === 1 ? ' runs' : 's run'} longer than 44 working days`,
    detail: 'A task longer than two months cannot be measured. Nobody can tell you whether a 60-day task is on track at day 30, which is exactly when it matters.',
    count: longTasks.length, pct: pctOf(longTasks.length, n),
    threshold: 'DCMA: under 5% of tasks',
    passed: pctOf(longTasks.length, n) <= 5,
    taskIds: longTasks.slice(0, 20).map((t) => t.id),
  });

  /* ── 9. Invalid progress against the data date ────────────────────────── */

  const shouldHaveStarted = tasks.filter((t) => {
    const s = toDayIndex(t.start_date);
    return s != null && s < dataDate && pct(t) === 0;
  });
  add({
    id: 'not-started', severity: 'warn',
    title: `${shouldHaveStarted.length} task${shouldHaveStarted.length === 1 ? ' was' : 's were'} due to start and show no progress`,
    detail: 'Their planned start has passed and they are still at zero. Either the work is late or the schedule has not been updated — both are worth knowing before someone asks.',
    count: shouldHaveStarted.length, pct: pctOf(shouldHaveStarted.length, n),
    taskIds: shouldHaveStarted.slice(0, 20).map((t) => String(t.id)),
  });

  const completeButFuture = tasks.filter((t) => {
    const e = toDayIndex(t.end_date);
    return pct(t) >= 100 && e != null && e > dataDate;
  });
  add({
    id: 'complete-future', severity: 'warn',
    title: `${completeButFuture.length} task${completeButFuture.length === 1 ? ' is' : 's are'} complete but finish in the future`,
    detail: 'A task cannot be finished before its own finish date. Usually the finish was never pulled back when the work actually landed.',
    count: completeButFuture.length,
    taskIds: completeButFuture.slice(0, 20).map((t) => String(t.id)),
  });

  const overdue = tasks.filter((t) => {
    const e = toDayIndex(t.end_date);
    return e != null && e < dataDate && pct(t) < 100;
  });
  add({
    id: 'missed', severity: 'warn',
    title: `${overdue.length} task${overdue.length === 1 ? ' has' : 's have'} passed their finish date unfinished`,
    detail: 'Work that should be done and is not. Every one of these is pushing something downstream that the dates no longer show.',
    count: overdue.length, pct: pctOf(overdue.length, n),
    taskIds: overdue.slice(0, 20).map((t) => String(t.id)),
  });

  /* ── 10. Duration contradicts the dates ───────────────────────────────── */

  const mismatch = tasks.filter((t) => {
    const d = Number(t.duration);
    const a = toDayIndex(t.start_date), b = toDayIndex(t.end_date);
    if (!Number.isFinite(d) || d <= 0 || a == null || b == null || b < a) return false;
    /* Against the span the DATES imply, not against what the network used —
       the network takes the declared duration when it has one, so comparing to
       that could only ever compare a number with itself. */
    const spanned = workDaysBetween(a, b, cal);
    /* A day either way is how the ends were counted, not a disagreement. */
    return Math.abs(spanned - d) > Math.max(1, d * 0.25);
  });
  add({
    id: 'duration-mismatch', severity: 'warn',
    title: `${mismatch.length} task${mismatch.length === 1 ? "'s duration disagrees" : "s' durations disagree"} with their own dates`,
    detail: 'A one-day duration against a six-week date span means one of the two was never maintained, and any calculation reading the other one is wrong.',
    count: mismatch.length, pct: pctOf(mismatch.length, n),
    taskIds: mismatch.slice(0, 20).map((t) => String(t.id)),
  });

  /* ── 11. Loops and broken references ──────────────────────────────────── */

  add({
    id: 'cycles', severity: 'blocker',
    title: `${network.cycles.length} task${network.cycles.length === 1 ? ' sits' : 's sit'} in a logic loop`,
    detail: 'Circular logic cannot be scheduled. The tasks in the loop have no defensible dates until it is broken.',
    count: network.cycles.length, taskIds: network.cycles.slice(0, 20),
  });

  add({
    id: 'dangling-refs', severity: 'warn',
    title: `${network.danglingRefs.length} relationship${network.danglingRefs.length === 1 ? ' points' : 's point'} at a task that does not exist`,
    detail: 'A predecessor that was deleted leaves the successor unconstrained without saying so.',
    count: network.danglingRefs.length,
    taskIds: network.danglingRefs.slice(0, 20).map((d) => d.taskId),
  });

  /* ── 12. Duplicate names ──────────────────────────────────────────────── */

  const byName = new Map<string, string[]>();
  for (const t of tasks) {
    const k = String(t.name ?? '').trim().toLowerCase();
    if (!k) continue;
    const a = byName.get(k) ?? []; a.push(String(t.id)); byName.set(k, a);
  }
  const dupes = [...byName.entries()].filter(([, a]) => a.length > 1);
  add({
    id: 'duplicate-names', severity: 'note',
    title: `${dupes.length} task name${dupes.length === 1 ? ' appears' : 's appear'} more than once`,
    detail: 'Sometimes correct — the same activity in two areas. Often an import that ran twice, and then nobody knows which one to update.',
    count: dupes.length, taskIds: dupes.flatMap(([, a]) => a).slice(0, 20),
  });

  /* ── 13. Critical path test ───────────────────────────────────────────── */

  const critical = dated.tasks.filter((t) => t.isCritical);
  add({
    id: 'critical-path', severity: 'blocker',
    title: critical.length === 0
      ? 'No critical path'
      : `${critical.length} task${critical.length === 1 ? '' : 's'} on the critical path`,
    detail: critical.length === 0
      ? 'Without a continuous chain of zero-float work there is no answer to "what makes the project late", which is the only question a schedule exists to answer.'
      : `A continuous chain of ${dated.criticalPath.length} tasks drives the finish date.`,
    count: critical.length === 0 ? 1 : 0,
    passed: critical.length > 0,
    taskIds: dated.criticalPath.slice(0, 40),
  });

  /* ── scoring ──────────────────────────────────────────────────────────── */

  const failed = checks.filter((c) => !c.passed);
  const blockers = failed.filter((c) => c.severity === 'blocker').length;
  const warnings = failed.filter((c) => c.severity === 'warn').length;

  const weight: Record<CheckSeverity, number> = { blocker: 3, warn: 2, note: 1 };
  const totalWeight = checks.reduce((s, c) => s + weight[c.severity], 0);
  const lostWeight = failed.reduce((s, c) => s + weight[c.severity], 0);
  let score = totalWeight > 0 ? Math.round(((totalWeight - lostWeight) / totalWeight) * 100) : 100;
  if (blockers > 0) score = Math.min(score, 45);
  if (n === 0) score = 100;

  return {
    checks, failed, blockers, warnings, score, network, forecast,
    totals: {
      tasks: n,
      complete: tasks.filter((t) => pct(t) >= 100).length,
      inProgress: tasks.filter((t) => pct(t) > 0 && pct(t) < 100).length,
      notStarted: tasks.filter((t) => pct(t) <= 0).length,
      critical: critical.length,
      nearCritical: dated.tasks.filter((t) => t.isNearCritical).length,
      withLogic,
      openEnds: openEnds.length,
    },
  };
}
