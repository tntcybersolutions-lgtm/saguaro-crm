/**
 * lib/schedule-cpm.ts
 *
 * Critical path method — forward pass, backward pass, float, critical path.
 *
 * `schedule_tasks` has carried es, ef, ls, lf, total_float and is_critical
 * since it was created, and nothing has ever computed them. On live data es is
 * null on all 42 tasks, total_float is set on 15, and is_critical on 5 — a
 * critical path that was decoration, right once and wrong ever since. Same
 * failure as the proposal lines nobody read and the selection variance nobody
 * recomputed.
 *
 * FOUR THINGS THIS GETS RIGHT THAT SIMPLE SCHEDULERS DO NOT.
 *
 * WORKING DAYS. A ten-day task starting Friday finishes a week on Thursday, not
 * on Sunday. Adding calendar days is the single most common scheduling error in
 * software, and it under-runs every duration by two days a week — five weeks of
 * work lands a fortnight early on paper and never in reality.
 *
 * FREE FLOAT IS NOT TOTAL FLOAT. Total float is how far a task can slip before
 * the PROJECT moves. Free float is how far before the NEXT TASK moves. Tools
 * show total float, superintendents read it as free float, and the third task
 * downstream is the one that gets hurt. Both are computed here and named
 * separately.
 *
 * NEGATIVE FLOAT IS REPORTED, NOT CLAMPED. When a deadline is already
 * unachievable the float goes negative, and that number is exactly how late you
 * are. Clamping it to zero — which plenty of tools do — makes a schedule that
 * is three weeks late look merely tight.
 *
 * CYCLES ARE CAUGHT. Logic that loops back on itself is reported rather than
 * recursed until the stack dies.
 */

/* ── calendar ────────────────────────────────────────────────────────────── */

/** Day index: whole days since the epoch, in UTC. No timezone, no drift. */
export type DayIndex = number;

const MS_PER_DAY = 86_400_000;

export function toDayIndex(iso: string | Date | null | undefined): DayIndex | null {
  if (!iso) return null;
  if (iso instanceof Date) return Math.floor(iso.getTime() / MS_PER_DAY);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso).trim());
  if (m) return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / MS_PER_DAY);
  const t = Date.parse(String(iso));
  return Number.isFinite(t) ? Math.floor(t / MS_PER_DAY) : null;
}

export function fromDayIndex(d: DayIndex | null): string | null {
  if (d == null || !Number.isFinite(d)) return null;
  return new Date(d * MS_PER_DAY).toISOString().slice(0, 10);
}

export interface Calendar {
  /** Which weekdays are worked. 0 = Sunday … 6 = Saturday. */
  workDays: boolean[];
  /** Non-working dates, as ISO strings. */
  holidays: Set<string>;
}

/** Monday to Friday, no holidays. */
export const FIVE_DAY: Calendar = {
  workDays: [false, true, true, true, true, true, false],
  holidays: new Set(),
};

/** Every day worked — for schedules genuinely run on calendar days. */
export const SEVEN_DAY: Calendar = {
  workDays: [true, true, true, true, true, true, true],
  holidays: new Set(),
};

export function makeCalendar(workDays: number[] = [1, 2, 3, 4, 5], holidays: string[] = []): Calendar {
  const w = [false, false, false, false, false, false, false];
  for (const d of workDays) if (d >= 0 && d <= 6) w[d] = true;
  return { workDays: w, holidays: new Set(holidays) };
}

export function isWorkDay(d: DayIndex, cal: Calendar): boolean {
  /* 1970-01-01 was a Thursday, so (d + 4) mod 7 gives the weekday. */
  const dow = (((d % 7) + 7) % 7 + 4) % 7;
  if (!cal.workDays[dow]) return false;
  const iso = fromDayIndex(d);
  return !(iso && cal.holidays.has(iso));
}

const anyWorkDay = (cal: Calendar) => cal.workDays.some(Boolean);

/** The first working day on or after `d`. */
export function nextWorkDay(d: DayIndex, cal: Calendar): DayIndex {
  if (!anyWorkDay(cal)) return d;
  let x = d;
  for (let i = 0; i < 400 && !isWorkDay(x, cal); i++) x++;
  return x;
}

/** The last working day on or before `d`. */
export function prevWorkDay(d: DayIndex, cal: Calendar): DayIndex {
  if (!anyWorkDay(cal)) return d;
  let x = d;
  for (let i = 0; i < 400 && !isWorkDay(x, cal); i++) x--;
  return x;
}

/**
 * The finish of a task of `duration` working days that starts on `start`.
 *
 * Inclusive: a one-day task starts and finishes the same day. A ten-day task
 * starting Friday finishes a week on Thursday — the two weekends are skipped,
 * which is the whole point.
 */
export function addWorkDays(start: DayIndex, duration: number, cal: Calendar): DayIndex {
  const d = Math.max(1, Math.round(duration || 1));
  if (!anyWorkDay(cal)) return start + d - 1;
  let cur = nextWorkDay(start, cal);
  let counted = 1;
  let guard = 0;
  while (counted < d && guard++ < 100_000) {
    cur++;
    if (isWorkDay(cur, cal)) counted++;
  }
  return cur;
}

/** Working days between two dates, inclusive of both. */
export function workDaysBetween(a: DayIndex, b: DayIndex, cal: Calendar): number {
  if (b < a) return -workDaysBetween(b, a, cal);
  if (!anyWorkDay(cal)) return b - a + 1;
  let n = 0;
  for (let d = a; d <= b && n < 100_000; d++) if (isWorkDay(d, cal)) n++;
  return n;
}

/** Move `n` working days forward (or back) from a date. */
export function shiftWorkDays(d: DayIndex, n: number, cal: Calendar): DayIndex {
  if (n === 0) return d;
  if (!anyWorkDay(cal)) return d + n;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let cur = d;
  let guard = 0;
  while (left > 0 && guard++ < 100_000) {
    cur += step;
    if (isWorkDay(cur, cal)) left--;
  }
  return cur;
}

/* ── the network ─────────────────────────────────────────────────────────── */

export type RelType = 'FS' | 'SS' | 'FF' | 'SF';

export interface Dependency {
  /** Id of the predecessor task. */
  id: string;
  type?: RelType;
  /** Working days. Positive delays the successor; negative is a lead. */
  lag?: number;
}

export interface CpmTask {
  id: string;
  name?: string | null;
  /** Working days. */
  duration?: unknown;
  start_date?: string | null;
  end_date?: string | null;
  /** Either dependency objects or bare predecessor ids. */
  predecessors?: unknown;
  pct_complete?: unknown;
  /** A hard constraint: the task may not start before this date. */
  constraint_start?: string | null;
  /** A deadline the schedule is measured against. */
  deadline?: string | null;
  wbs?: string | null;
  [k: string]: unknown;
}

export interface CpmResult {
  id: string;
  es: DayIndex; ef: DayIndex; ls: DayIndex; lf: DayIndex;
  esDate: string | null; efDate: string | null; lsDate: string | null; lfDate: string | null;
  duration: number;
  /** Slip before the PROJECT finish moves. Negative means already late. */
  totalFloat: number;
  /** Slip before the NEXT TASK moves. Never more than total float. */
  freeFloat: number;
  isCritical: boolean;
  /** Float small enough to become critical on one bad week. */
  isNearCritical: boolean;
  predecessors: Dependency[];
  successors: string[];
}

export interface CpmNetwork {
  tasks: CpmResult[];
  byId: Record<string, CpmResult>;
  /** Ids on the critical path, in order. */
  criticalPath: string[];
  projectStart: string | null;
  projectFinish: string | null;
  /** Working days from project start to finish. */
  durationDays: number;
  /** Ids involved in a logic loop — excluded from the passes. */
  cycles: string[];
  /** Dependencies naming a task that does not exist. */
  danglingRefs: { taskId: string; missing: string }[];
}

/** Accepts ["id"], [{id,type,lag}], a comma string, or null. */
export function parseDependencies(raw: unknown): Dependency[] {
  if (!raw) return [];
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  const out: Dependency[] = [];
  for (const item of list) {
    if (typeof item === 'string') { out.push({ id: item, type: 'FS', lag: 0 }); continue; }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const id = String(o.id ?? o.task_id ?? o.predecessor_id ?? '').trim();
      if (!id) continue;
      const t = String(o.type ?? o.rel ?? 'FS').toUpperCase();
      out.push({
        id,
        type: (['FS', 'SS', 'FF', 'SF'].includes(t) ? t : 'FS') as RelType,
        lag: Number.isFinite(Number(o.lag)) ? Number(o.lag) : 0,
      });
    }
  }
  return out;
}

const durationOf = (t: CpmTask, cal: Calendar): number => {
  const d = Number(t.duration);
  if (Number.isFinite(d) && d > 0) return Math.round(d);
  /* No duration: derive it from the dates, which is better than assuming one
     day and silently compressing the schedule. */
  const a = toDayIndex(t.start_date), b = toDayIndex(t.end_date);
  if (a != null && b != null && b >= a) return Math.max(1, workDaysBetween(a, b, cal));
  return 1;
};

/**
 * Run the critical path method over a set of tasks.
 *
 * Tasks with no logic still get dates — from their own start_date if they have
 * one, otherwise from the project start. A schedule with no relationships is
 * still worth computing; it just has no critical path worth the name, which is
 * what the health check is for.
 */
export function computeCpm(
  tasks: CpmTask[],
  opts: { calendar?: Calendar; projectStart?: string | null; nearCriticalDays?: number } = {},
): CpmNetwork {
  const cal = opts.calendar ?? FIVE_DAY;
  const near = opts.nearCriticalDays ?? 5;

  const ids = new Set(tasks.map((t) => String(t.id)));
  const deps = new Map<string, Dependency[]>();
  const danglingRefs: { taskId: string; missing: string }[] = [];

  for (const t of tasks) {
    const parsed = parseDependencies(t.predecessors).filter((d) => {
      if (ids.has(d.id)) return true;
      danglingRefs.push({ taskId: String(t.id), missing: d.id });
      return false;
    });
    deps.set(String(t.id), parsed);
  }

  /* Successor index, built once. */
  const succ = new Map<string, string[]>();
  for (const t of tasks) succ.set(String(t.id), []);
  for (const t of tasks) {
    for (const d of deps.get(String(t.id))!) succ.get(d.id)!.push(String(t.id));
  }

  /* ── topological order, with cycle detection ──────────────────────────── */

  const order: string[] = [];
  const cycles: string[] = [];
  {
    const state = new Map<string, 0 | 1 | 2>(); // unvisited / visiting / done
    for (const t of tasks) state.set(String(t.id), 0);

    const visit = (id: string, stack: Set<string>) => {
      const s = state.get(id);
      if (s === 2) return;
      if (s === 1) {
        /* A loop. Every id on the stack is part of it. */
        for (const x of stack) if (!cycles.includes(x)) cycles.push(x);
        return;
      }
      state.set(id, 1);
      stack.add(id);
      for (const d of deps.get(id) ?? []) visit(d.id, stack);
      stack.delete(id);
      state.set(id, 2);
      order.push(id);
    };
    for (const t of tasks) visit(String(t.id), new Set());
  }

  const taskById = new Map(tasks.map((t) => [String(t.id), t]));
  const dur = new Map<string, number>();
  for (const t of tasks) dur.set(String(t.id), durationOf(t, cal));

  /* Project start: the earliest given start, else today. */
  const givenStarts = tasks.map((t) => toDayIndex(t.start_date)).filter((d): d is number => d != null);
  const projectStartIdx = opts.projectStart != null
    ? (toDayIndex(opts.projectStart) ?? Math.min(...givenStarts, Math.floor(Date.now() / MS_PER_DAY)))
    : givenStarts.length ? Math.min(...givenStarts) : Math.floor(Date.now() / MS_PER_DAY);

  /* ── forward pass ─────────────────────────────────────────────────────── */

  const ES = new Map<string, DayIndex>();
  const EF = new Map<string, DayIndex>();
  const inCycle = new Set(cycles);

  for (const id of order) {
    const t = taskById.get(id)!;
    const d = dur.get(id)!;
    let es = nextWorkDay(projectStartIdx, cal);

    /* A task's own start_date acts as an early-start constraint when it is
       later than the logic allows — that is what a planned start means. */
    const own = toDayIndex(t.start_date);
    const hard = toDayIndex(t.constraint_start ?? null);
    if (own != null && (deps.get(id) ?? []).length === 0) es = nextWorkDay(own, cal);
    if (hard != null) es = Math.max(es, nextWorkDay(hard, cal));

    for (const dep of deps.get(id) ?? []) {
      if (inCycle.has(dep.id)) continue;
      const pEs = ES.get(dep.id), pEf = EF.get(dep.id);
      if (pEs == null || pEf == null) continue;
      const lag = dep.lag ?? 0;
      let candidate: DayIndex;
      switch (dep.type ?? 'FS') {
        /* FS: start the working day after the predecessor finishes. */
        case 'FS': candidate = shiftWorkDays(pEf, 1 + lag, cal); break;
        /* SS: start no earlier than the predecessor started, plus lag. */
        case 'SS': candidate = shiftWorkDays(pEs, lag, cal); break;
        /* FF: finish no earlier than the predecessor finishes — so back the
           duration out to get the start. */
        case 'FF': candidate = shiftWorkDays(shiftWorkDays(pEf, lag, cal), -(d - 1), cal); break;
        /* SF: finish no earlier than the predecessor starts. */
        case 'SF': candidate = shiftWorkDays(shiftWorkDays(pEs, lag, cal), -(d - 1), cal); break;
        default: candidate = shiftWorkDays(pEf, 1 + lag, cal);
      }
      es = Math.max(es, nextWorkDay(candidate, cal));
    }

    ES.set(id, es);
    EF.set(id, addWorkDays(es, d, cal));
  }

  /* Anything caught in a cycle still needs dates so the UI can draw it. */
  for (const t of tasks) {
    const id = String(t.id);
    if (ES.has(id)) continue;
    const es = nextWorkDay(toDayIndex(t.start_date) ?? projectStartIdx, cal);
    ES.set(id, es);
    EF.set(id, addWorkDays(es, dur.get(id)!, cal));
  }

  const projectFinishIdx = tasks.length ? Math.max(...tasks.map((t) => EF.get(String(t.id))!)) : projectStartIdx;

  /* ── backward pass ────────────────────────────────────────────────────── */

  const LS = new Map<string, DayIndex>();
  const LF = new Map<string, DayIndex>();

  /* A deadline earlier than the computed finish drives float negative, which is
     the point — that number is how late the schedule already is. */
  const deadlines = tasks.map((t) => toDayIndex(t.deadline ?? null)).filter((d): d is number => d != null);
  const projectLateFinish = deadlines.length ? Math.min(projectFinishIdx, ...deadlines) : projectFinishIdx;

  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const d = dur.get(id)!;
    const t = taskById.get(id)!;
    const ownDeadline = toDayIndex(t.deadline ?? null);
    let lf = ownDeadline != null ? ownDeadline : projectLateFinish;

    const successors = succ.get(id) ?? [];
    if (successors.length) {
      lf = Number.POSITIVE_INFINITY;
      for (const sId of successors) {
        if (inCycle.has(sId)) continue;
        const sLs = LS.get(sId), sLf = LF.get(sId);
        if (sLs == null || sLf == null) continue;
        const rel = (deps.get(sId) ?? []).find((x) => x.id === id);
        const lag = rel?.lag ?? 0;
        let candidate: DayIndex;
        switch (rel?.type ?? 'FS') {
          case 'FS': candidate = shiftWorkDays(sLs, -(1 + lag), cal); break;
          case 'SS': candidate = addWorkDays(shiftWorkDays(sLs, -lag, cal), d, cal); break;
          case 'FF': candidate = shiftWorkDays(sLf, -lag, cal); break;
          case 'SF': candidate = addWorkDays(shiftWorkDays(sLf, -lag, cal), d, cal); break;
          default: candidate = shiftWorkDays(sLs, -(1 + lag), cal);
        }
        lf = Math.min(lf, candidate);
      }
      if (!Number.isFinite(lf)) lf = ownDeadline ?? projectLateFinish;
      if (ownDeadline != null) lf = Math.min(lf, ownDeadline);
    }

    lf = prevWorkDay(lf, cal);
    LF.set(id, lf);
    /* A task of d working days finishing on lf STARTS d−1 working days earlier,
       because both ends are inclusive: a one-day task starts and finishes the
       same day. Counting back a full d puts every late start one day early and
       drags float negative across the whole schedule. */
    LS.set(id, shiftWorkDays(lf, -(d - 1), cal));
  }

  for (const t of tasks) {
    const id = String(t.id);
    if (LF.has(id)) continue;
    LF.set(id, EF.get(id)!);
    LS.set(id, ES.get(id)!);
  }

  /* ── float ────────────────────────────────────────────────────────────── */

  const results: CpmResult[] = tasks.map((t) => {
    const id = String(t.id);
    const es = ES.get(id)!, ef = EF.get(id)!, ls = LS.get(id)!, lf = LF.get(id)!;
    const d = dur.get(id)!;
    const totalFloat = workDaysBetween(ef, lf, cal) - (lf >= ef ? 1 : -1);

    /* Free float: how far this can slip before the EARLIEST successor moves.
       Different from total float, and the one a superintendent actually needs —
       total float is shared along a chain, so spending it hurts somebody
       downstream who thinks they have it too. */
    const successors = succ.get(id) ?? [];
    let freeFloat = totalFloat;
    if (successors.length) {
      let minSlack = Number.POSITIVE_INFINITY;
      for (const sId of successors) {
        const sEs = ES.get(sId);
        if (sEs == null) continue;
        const rel = (deps.get(sId) ?? []).find((x) => x.id === id);
        const lag = rel?.lag ?? 0;
        let slack: number;
        switch (rel?.type ?? 'FS') {
          case 'FS': slack = workDaysBetween(ef, sEs, cal) - 2 - lag; break;
          case 'SS': slack = workDaysBetween(es, sEs, cal) - 1 - lag; break;
          case 'FF': slack = workDaysBetween(ef, ES.get(sId)! + (dur.get(sId)! - 1), cal) - 1 - lag; break;
          default: slack = workDaysBetween(ef, sEs, cal) - 2 - lag;
        }
        minSlack = Math.min(minSlack, slack);
      }
      if (Number.isFinite(minSlack)) freeFloat = Math.max(0, Math.min(totalFloat, minSlack));
    }

    return {
      id,
      es, ef, ls, lf,
      esDate: fromDayIndex(es), efDate: fromDayIndex(ef),
      lsDate: fromDayIndex(ls), lfDate: fromDayIndex(lf),
      duration: d,
      totalFloat,
      freeFloat,
      isCritical: totalFloat <= 0,
      isNearCritical: totalFloat > 0 && totalFloat <= near,
      predecessors: deps.get(id) ?? [],
      successors,
    };
  });

  const byId: Record<string, CpmResult> = {};
  for (const r of results) byId[r.id] = r;

  /* The critical path, walked from the earliest critical task through critical
     successors — an ordered chain rather than an unordered set. */
  const criticalPath: string[] = [];
  {
    const crit = results.filter((r) => r.isCritical).sort((a, b) => a.es - b.es);
    const seen = new Set<string>();
    let cursor = crit[0];
    while (cursor && !seen.has(cursor.id)) {
      criticalPath.push(cursor.id);
      seen.add(cursor.id);
      const nextId = cursor.successors
        .map((s) => byId[s])
        .filter((s) => s && s.isCritical && !seen.has(s.id))
        .sort((a, b) => a.es - b.es)[0]?.id;
      cursor = nextId ? byId[nextId] : crit.find((c) => !seen.has(c.id))!;
      if (cursor && seen.has(cursor.id)) break;
    }
  }

  return {
    tasks: results,
    byId,
    criticalPath,
    projectStart: fromDayIndex(tasks.length ? Math.min(...results.map((r) => r.es)) : projectStartIdx),
    projectFinish: fromDayIndex(projectFinishIdx),
    durationDays: tasks.length ? workDaysBetween(Math.min(...results.map((r) => r.es)), projectFinishIdx, cal) : 0,
    cycles,
    danglingRefs,
  };
}
