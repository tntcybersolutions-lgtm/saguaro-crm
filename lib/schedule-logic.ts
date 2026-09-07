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

import { toDayIndex, parseDependencies, type CpmTask, type Dependency, type RelType } from './schedule-cpm';

/** Canonical construction sequence, for schedules that carry a phase. */
const PHASE_ORDER = [
  'procurement', 'preconstruction', 'sitework', 'site', 'demolition',
  'foundation', 'structure', 'superstructure', 'envelope', 'exterior',
  'roofing', 'mep', 'rough-in', 'interiors', 'finishes', 'commissioning',
  'closeout', 'punch',
];

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

    /* If the successor was planned to start before the predecessor finishes,
       that is a real overlap. Proposing finish-to-start would shove it months
       later the moment somebody accepts — so it becomes start-to-start with the
       lag the dates actually describe. */
    let type: RelType = 'FS';
    let lag = 0;
    const gapFromFinish = start(task) - finish(pred);
    if (gapFromFinish < 1) {
      type = 'SS';
      lag = Math.max(0, Math.round((start(task) - start(pred)) * 5 / 7));
    } else if (gapFromFinish > 1) {
      /* A real planned gap is carried as a lag rather than quietly dropped. */
      lag = Math.round((gapFromFinish - 1) * 5 / 7);
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

  const remaining = tasks.filter((t) => (links.get(String(t.id))?.size ?? 0) === 0);
  const phased = remaining.filter((t) => phaseRank(t.phase) < 998);

  if (phased.length > 1) {
    const byPhase = new Map<number, CpmTask[]>();
    for (const t of phased) {
      const r = phaseRank(t.phase);
      const a = byPhase.get(r) ?? []; a.push(t); byPhase.set(r, a);
    }
    const ranks = [...byPhase.keys()].sort((a, b) => a - b);

    for (let r = 0; r < ranks.length; r++) {
      const group = byPhase.get(ranks[r])!.sort((a, b) => start(a) - start(b));
      /* Chain within the phase by planned start. */
      for (let i = 1; i < group.length; i++) {
        propose(group[i], group[i - 1], `Both in the ${String(group[i].phase)} phase, and ${nameOf(group[i - 1])} was planned first`, 'medium');
      }
      /* And hang the phase off the one before it. */
      if (r > 0 && group.length) {
        const prevGroup = byPhase.get(ranks[r - 1])!.sort((a, b) => finish(a) - finish(b));
        const last = prevGroup[prevGroup.length - 1];
        propose(group[0], last, `${String(last.phase)} comes before ${String(group[0].phase)} in the construction sequence`, 'medium');
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
 */
export function durationFromDates(t: CpmTask, workDaysPerWeek = 5): number | null {
  const a = toDayIndex(t.start_date), b = toDayIndex(t.end_date);
  if (a == null || b == null || b < a) return null;
  const calendarDays = b - a + 1;
  return Math.max(1, Math.round((calendarDays * workDaysPerWeek) / 7));
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
