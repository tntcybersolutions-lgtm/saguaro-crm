/**
 * lib/schedule-logic.ts
 *
 * Proposing the relationships a schedule is missing.
 *
 * Every scheduling tool makes you draw each link by hand, which is why so many
 * schedules have none — the live one on this platform has 42 tasks and not a
 * single relationship between any of them. Drawing 41 links by hand is an
 * afternoon nobody has, so it never happens, and the schedule stays a list of
 * dates forever.
 *
 * This proposes the links from what the schedule already tells us: the WBS
 * numbering somebody took the trouble to enter, the phase each task belongs to,
 * the trade doing the work, and the dates that were planned. Then a human
 * accepts or rejects them. Suggestions, never silent writes — a relationship
 * invented by software and applied without anyone looking is worse than no
 * relationship at all, because now the wrong answer has a critical path behind
 * it and looks authoritative.
 *
 * TWO RULES THAT KEEP IT HONEST.
 *
 * It never proposes a link that contradicts the dates. If the successor was
 * planned to start before the predecessor finishes, that is an overlap, and it
 * is proposed as start-to-start with the real lag rather than as a
 * finish-to-start that would shove the successor months later the moment it is
 * accepted.
 *
 * It never closes a loop. Each proposal is checked against the links already
 * accepted, so the result is always schedulable.
 */

import {
  toDayIndex, parseDependencies, workDaysBetween, FIVE_DAY,
  type CpmTask, type Dependency, type RelType, type Calendar,
} from './schedule-cpm';

/** Canonical construction sequence, for schedules that carry a phase. */
const PHASE_ORDER = [
  'procurement', 'preconstruction', 'sitework', 'site', 'demolition',
  'foundation', 'structure', 'superstructure', 'envelope', 'exterior',
  'roofing', 'mep', 'rough-in', 'interiors', 'finishes', 'commissioning',
  'closeout', 'punch',
];

/**
 * Below this, a gap between two tasks is date-entry rounding rather than a
 * decision anybody made, and carrying it as a lag adds noise a scheduler then
 * has to argue with.
 */
const MIN_LAG_DAYS = 3;

/**
 * The longest gap worth calling a lag.
 *
 * Real construction lags top out around here: concrete cure to 28 calendar
 * days, submittal review a fortnight, most of the rest shorter. Beyond it the
 * gap is almost never waiting — it is a predecessor nobody entered. A link
 * carrying a lag longer than the predecessor's own duration is a placeholder
 * wearing a relationship's clothes, and DCMA counts it against you either way.
 */
const MAX_LAG_DAYS = 20;

/** Calendar days to working days, close enough for choosing a relationship. */
const workDaysApprox = (calendarDays: number): number =>
  Math.max(0, Math.round((calendarDays * 5) / 7));

const phaseRank = (p: unknown): number => {
  const s = String(p ?? '').toLowerCase().trim();
  if (!s) return 999;
  const i = PHASE_ORDER.findIndex((x) => s.includes(x));
  return i < 0 ? 998 : i;
};

/** "2.10" sorts after "2.9", which a string comparison gets wrong. */
const wbsKey = (w: unknown): number[] => {
  const s = String(w ?? '').trim();
  if (!s) return [];
  return s.split('.').map((p) => {
    const n = Number(p.replace(/\D/g, ''));
    return Number.isFinite(n) ? n : 0;
  });
};

const compareWbs = (a: number[], b: number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -1, y = b[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
};

export interface LogicSuggestion {
  taskId: string;
  taskName: string;
  predecessorId: string;
  predecessorName: string;
  type: RelType;
  lag: number;
  /** Why this link is being proposed, in words a scheduler can argue with. */
  reason: string;
  /** How much the dates support it. */
  confidence: 'high' | 'medium' | 'low';
}

export interface LogicPlan {
  suggestions: LogicSuggestion[];
  /** Tasks that would still have no predecessor after applying everything. */
  stillOpen: string[];
  /** Tasks that already had logic and were left alone. */
  untouched: string[];
}

/**
 * Propose the missing relationships.
 *
 * Strategy, in order of how much the schedule is telling us:
 *
 *   1. WBS. If somebody numbered the tasks, that numbering IS the sequence, and
 *      it is the most reliable signal in the file.
 *   2. Phase. Within a phase, chain by date. Across phases, link the last task
 *      of one to the first of the next, following the construction sequence.
 *   3. Dates alone. As a last resort, chain in date order — weak, but a chained
 *      schedule can at least tell you when something slips, and an unchained one
 *      never can.
 */
export function suggestLogic(tasks: CpmTask[]): LogicPlan {
  const withLogic = new Set(
    tasks.filter((t) => parseDependencies(t.predecessors).length > 0).map((t) => String(t.id)),
  );

  const nameOf = (t: CpmTask) => String(t.name ?? t.id);
  const start = (t: CpmTask) => toDayIndex(t.start_date) ?? 0;
  const finish = (t: CpmTask) => toDayIndex(t.end_date) ?? start(t);

  /* Accepted links, so a proposal can be checked for loops before it is made. */
  const links = new Map<string, Set<string>>();
  for (const t of tasks) {
    links.set(String(t.id), new Set(parseDependencies(t.predecessors).map((d) => d.id)));
  }

  /** Would adding pred → task close a loop? */
  const wouldCycle = (taskId: string, predId: string): boolean => {
    if (taskId === predId) return true;
    const seen = new Set<string>();
    const stack = [predId];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === taskId) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const p of links.get(cur) ?? []) stack.push(p);
    }
    return false;
  };

  const suggestions: LogicSuggestion[] = [];

  const propose = (task: CpmTask, pred: CpmTask, reason: string, confidence: LogicSuggestion['confidence']) => {
    const tId = String(task.id), pId = String(pred.id);
    if (tId === pId || wouldCycle(tId, pId)) return false;

    /* Refuse a link that runs backwards against the dates.
     *
     * WBS numbering and the planned dates can disagree — on live data 3.3 was
     * planned to start on 10 September and 4.1 on 1 August, so the numbering
     * says one order and the calendar says the other. Proposing it anyway gave
     * a start-to-start with the lag clamped to zero, which dragged 4.1 five
     * weeks later and pushed the project finish out with it.
     *
     * The rule this file claims to follow is that a proposal never contradicts
     * the dates. So the link is skipped and a later rule — phase order, or plain
     * date sequence — gets the chance to link the task where the calendar
     * actually puts it. */
    if (start(task) < start(pred)) return false;

    /* Choosing the relationship type and lag.
     *
     * The dates on a schedule that never had logic were not produced BY logic —
     * they were typed. So the gaps and overlaps between them are part real
     * intent and part noise, and encoding all of it produces a schedule where
     * every link is start-to-start with a large lag. That passes for logic and
     * is not: the lag is doing all the work, so nothing moves when reality does,
     * which is the exact failure the links were added to cure. DCMA flags it,
     * and DCMA is right to.
     *
     * So overlaps and gaps are only modelled when they are big enough to be
     * deliberate. A two-day overlap between a six-week task and its successor is
     * noise; a six-week overlap is phasing somebody chose.
     */
    const predDuration = Math.max(1, workDaysApprox(finish(pred) - start(pred) + 1));
    const overlapDays = workDaysApprox(finish(pred) - start(task) + 1);
    const gapDays = workDaysApprox(start(task) - finish(pred) - 1);

    let type: RelType = 'FS';
    let lag = 0;

    if (overlapDays > 0) {
      /* A material overlap — a sixth of the predecessor or more, and at least
         a working week — is real phasing and is modelled as start-to-start.
         Anything smaller is treated as the tasks simply running back to back. */
      const material = overlapDays >= Math.max(5, predDuration * 0.15);
      if (material) {
        type = 'SS';
        lag = Math.max(0, workDaysApprox(start(task) - start(pred)));
      }
    } else if (gapDays >= MIN_LAG_DAYS) {
      /* A real planned gap — concrete cure, submittal review — is carried.
         Anything under a few days is rounding in somebody's date entry. */
      lag = gapDays;

      /* But a gap this long is not a lag, it is a missing predecessor.
       *
       * Live data produced "Electrical Rough-in follows Site Mobilization,
       * +115 days" — a link carrying eight times more waiting than working.
       * Nothing about mobilising a site releases electrical rough-in five
       * months later; something in between does, and this link was hiding it.
       * Refusing it lets a nearer rule find the real driver, and if none does,
       * the task is left honestly open for the health check to report. */
      if (lag > Math.max(MAX_LAG_DAYS, predDuration)) return false;
    }

    suggestions.push({
      taskId: tId, taskName: nameOf(task),
      predecessorId: pId, predecessorName: nameOf(pred),
      type, lag,
      reason: type === 'SS'
        ? `${reason}. The dates overlap, so this is start-to-start${lag ? ` with a ${lag}-day lag` : ''} rather than finish-to-start.`
        : lag > 0
          ? `${reason}. ${lag} working days were planned between them, carried as a lag.`
          : reason,
      confidence,
    });
    links.get(tId)!.add(pId);
    return true;
  };

  /* ── 1. WBS ordering ──────────────────────────────────────────────────── */

  const wbsTasks = tasks
    .filter((t) => wbsKey(t.wbs).length > 0 && !withLogic.has(String(t.id)))
    .sort((a, b) => compareWbs(wbsKey(a.wbs), wbsKey(b.wbs)));

  for (let i = 1; i < wbsTasks.length; i++) {
    const task = wbsTasks[i], prev = wbsTasks[i - 1];
    const a = wbsKey(prev.wbs), b = wbsKey(task.wbs);
    /* Same parent — 2.1 → 2.2 — is the strongest signal there is. */
    const sameParent = a.length === b.length && a.length > 1 &&
      a.slice(0, -1).every((x, j) => x === b[j]);
    propose(
      task, prev,
      sameParent
        ? `WBS ${String(prev.wbs)} runs directly before ${String(task.wbs)}`
        : `WBS ordering puts ${String(prev.wbs)} before ${String(task.wbs)}`,
      sameParent ? 'high' : 'medium',
    );
  }

  /* ── 2. Phase sequence, for anything WBS did not cover ────────────────── */

  /* Two different populations, and conflating them was a bug.
   *
   * Only an UNLINKED task needs a proposal — that is `needsPhase`. But the
   * task a phase should hang off is the real last-finishing task of the phase
   * before it, linked or not — that is `allByPhase`. The first version built
   * both from the unlinked leftovers, so by the time MEP was reached the only
   * remaining Sitework task was Site Mobilization, and MEP was hung off it
   * across a five-month gap while Earthwork, Utilities and the entire
   * structure — the work that actually releases rough-in — sat one lookup
   * away. */
  const allByPhase = new Map<number, CpmTask[]>();
  for (const t of tasks) {
    const r = phaseRank(t.phase);
    if (r >= 998) continue;
    const a = allByPhase.get(r) ?? []; a.push(t); allByPhase.set(r, a);
  }

  const needsPhase = tasks.filter(
    (t) => (links.get(String(t.id))?.size ?? 0) === 0 && phaseRank(t.phase) < 998,
  );

  if (needsPhase.length > 0) {
    const byPhase = new Map<number, CpmTask[]>();
    for (const t of needsPhase) {
      const r = phaseRank(t.phase);
      const a = byPhase.get(r) ?? []; a.push(t); byPhase.set(r, a);
    }
    const allRanks = [...allByPhase.keys()].sort((a, b) => a - b);

    for (const rank of [...byPhase.keys()].sort((a, b) => a - b)) {
      const group = byPhase.get(rank)!.sort((a, b) => start(a) - start(b));
      /* Chain within the phase by planned start. */
      for (let i = 1; i < group.length; i++) {
        propose(group[i], group[i - 1], `Both in the ${String(group[i].phase)} phase, and ${nameOf(group[i - 1])} was planned first`, 'medium');
      }
      /* And hang the phase off the one that finishes last in the phase before
         it — walking back past any phase that has no tasks at all. */
      const prevRanks = allRanks.filter((x) => x < rank).reverse();
      for (const pr of prevRanks) {
        const prevGroup = [...allByPhase.get(pr)!].sort((a, b) => finish(a) - finish(b));
        const last = prevGroup[prevGroup.length - 1];
        if (last && propose(group[0], last, `${String(last.phase)} comes before ${String(group[0].phase)} in the construction sequence`, 'medium')) break;
      }
    }
  }

  /* ── 3. Dates alone, for whatever is left ─────────────────────────────── */

  const stillBare = tasks
    .filter((t) => (links.get(String(t.id))?.size ?? 0) === 0)
    .sort((a, b) => start(a) - start(b) || finish(a) - finish(b));

  for (let i = 1; i < stillBare.length; i++) {
    propose(
      stillBare[i], stillBare[i - 1],
      `Planned to start after ${nameOf(stillBare[i - 1])}, and nothing else says how they relate`,
      'low',
    );
  }

  /* ── 4. Close the branches that drive nothing ─────────────────────────── */

  /* Every rule above hands a task a PREDECESSOR. None of them ever asks
   * whether a task has a SUCCESSOR, and a schedule built only forwards
   * dead-ends: the live demo grew a nine-task chain from Site Mobilization
   * through Building Envelope Seal that drove nothing at all. Each task read
   * as linked, so nothing complained, and the whole branch carried five weeks
   * of float purely because no work downstream was waiting on it. Delay the
   * envelope and the project finish would not have moved.
   *
   * So: anything that finishes before the project does and drives nothing gets
   * tied to the next work that could plausibly be waiting on it — the earliest
   * task starting at or after it that does not close a loop. */

  const lastFinish = tasks.length ? Math.max(...tasks.map(finish)) : 0;
  const succCount = new Map<string, number>();
  for (const [tId, preds] of links) {
    if (!succCount.has(tId)) succCount.set(tId, 0);
    for (const p of preds) succCount.set(p, (succCount.get(p) ?? 0) + 1);
  }

  const deadEnds = tasks
    .filter((t) => (succCount.get(String(t.id)) ?? 0) === 0 && finish(t) < lastFinish)
    .sort((a, b) => finish(a) - finish(b));

  const byStart = [...tasks].sort((a, b) => start(a) - start(b) || finish(a) - finish(b));

  for (const t of deadEnds) {
    /* Still a dead end? An earlier iteration may already have closed it. */
    if ((succCount.get(String(t.id)) ?? 0) > 0) continue;

    /* Work that starts after this FINISHES is a genuine successor and is tried
     * first. Work that merely starts later is a fallback: on live data the
     * plain start-order rule tied HVAC rough-in to the roof deck four days
     * behind it, which reads backwards — the deck releases the HVAC, not the
     * reverse. Preferring a true successor found commissioning instead, which
     * is the work that actually cannot begin until the rough-in is done. */
    const genuine = byStart.filter((c) => start(c) >= finish(t));
    let closed = false;
    for (const cand of [...genuine, ...byStart]) {
      if (String(cand.id) === String(t.id)) continue;
      if (start(cand) < start(t)) continue;
      if (!propose(cand, t, `${nameOf(t)} finishes with nothing waiting on it, and ${nameOf(cand)} is the next work that could be`, 'low')) continue;
      succCount.set(String(t.id), (succCount.get(String(t.id)) ?? 0) + 1);
      closed = true;
      break;
    }
    if (closed) continue;

    /* Nothing starts after this, but something may still finish after it.
     *
     * The live shape after splitting into areas: the last zone of Exterior
     * Improvements runs to 20 December while Commissioning runs the whole of
     * December. No work starts later, so every rule above declines — and the
     * zone drives nothing, collecting seven weeks of float it has not earned.
     *
     * The relationship is finish-to-finish, and this is the case it exists for:
     * commissioning may begin over the top of the exterior work, but it cannot
     * COMPLETE until that work does. It constrains nothing's start, so it
     * cannot drag a date; it only stops the branch floating free. */
    const overlapping = [...tasks]
      .filter((c) => String(c.id) !== String(t.id) && finish(c) > finish(t) && start(c) <= finish(t))
      .sort((a, b) => finish(a) - finish(b))[0];

    if (overlapping && !wouldCycle(String(overlapping.id), String(t.id))) {
      const lag = workDaysApprox(finish(overlapping) - finish(t));
      suggestions.push({
        taskId: String(overlapping.id), taskName: nameOf(overlapping),
        predecessorId: String(t.id), predecessorName: nameOf(t),
        type: 'FF', lag,
        reason: `Nothing starts after ${nameOf(t)}, but ${nameOf(overlapping)} runs over the top of it and cannot finish until it does. Finish-to-finish, so it constrains no start and can drag no date.`,
        confidence: 'low',
      });
      links.get(String(overlapping.id))!.add(String(t.id));
      succCount.set(String(t.id), 1);
    }
  }

  const stillOpen = tasks
    .filter((t) => (links.get(String(t.id))?.size ?? 0) === 0)
    .map((t) => String(t.id));

  return { suggestions, stillOpen, untouched: [...withLogic] };
}

/**
 * Fold accepted suggestions into the tasks, ready to save.
 *
 * Existing predecessors are kept. A suggestion is an addition, never a
 * replacement — logic somebody entered by hand outranks anything proposed here.
 */
export function applyLogic(tasks: CpmTask[], suggestions: LogicSuggestion[]): CpmTask[] {
  const byTask = new Map<string, LogicSuggestion[]>();
  for (const s of suggestions) {
    const a = byTask.get(s.taskId) ?? []; a.push(s); byTask.set(s.taskId, a);
  }
  return tasks.map((t) => {
    const add = byTask.get(String(t.id));
    if (!add?.length) return t;
    const existing = parseDependencies(t.predecessors);
    const have = new Set(existing.map((d) => d.id));
    const merged: Dependency[] = [...existing];
    for (const s of add) {
      if (have.has(s.predecessorId)) continue;
      merged.push({ id: s.predecessorId, type: s.type, lag: s.lag });
      have.add(s.predecessorId);
    }
    return { ...t, predecessors: merged };
  });
}

/**
 * The working-day duration a task's own dates imply.
 *
 * Live data carries `duration: 1` against six-week date spans on 40 of 42
 * tasks — the two disagree and any calculation reading the wrong one is wrong.
 * The dates are the thing people actually maintained, so they win.
 *
 * Counted against the real calendar rather than estimated from it. The first
 * version approximated — calendar days times five sevenths, rounded — which is
 * close but not equal: a Monday-to-Friday task came out at four days instead of
 * five. That mattered more than it looks. Rebaselining writes dates from the
 * critical path pass, which counts working days exactly; this then recomputed
 * the duration column approximately from those dates; the next pass used the
 * approximation. Every round trip slid the project a day, and a repair that
 * moves the schedule each time it runs is not a repair.
 */
export function durationFromDates(t: CpmTask, cal: Calendar = FIVE_DAY): number | null {
  const a = toDayIndex(t.start_date), b = toDayIndex(t.end_date);
  if (a == null || b == null || b < a) return null;
  return Math.max(1, workDaysBetween(a, b, cal));
}

/** Exact duplicates — same name, same dates — as an import that ran twice. */
export function findDuplicates(tasks: CpmTask[]): { keep: string; drop: string[]; name: string }[] {
  const groups = new Map<string, CpmTask[]>();
  for (const t of tasks) {
    const key = [
      String(t.name ?? '').trim().toLowerCase(),
      String(t.start_date ?? ''),
      String(t.end_date ?? ''),
    ].join('|');
    if (!key.replace(/\|/g, '')) continue;
    const a = groups.get(key) ?? []; a.push(t); groups.set(key, a);
  }
  const out: { keep: string; drop: string[]; name: string }[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    /* Keep the one carrying the most information — a WBS, a phase, real
       progress — rather than whichever happens to sort first. */
    const scored = [...group].sort((a, b) => {
      const score = (t: CpmTask) =>
        (t.wbs ? 4 : 0) + (t.phase ? 2 : 0) + (Number(t.pct_complete) > 0 ? 1 : 0) +
        (parseDependencies(t.predecessors).length ? 8 : 0);
      return score(b) - score(a);
    });
    out.push({
      keep: String(scored[0].id),
      drop: scored.slice(1).map((t) => String(t.id)),
      name: String(scored[0].name ?? ''),
    });
  }
  return out;
}
