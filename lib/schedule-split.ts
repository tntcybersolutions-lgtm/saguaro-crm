/**
 * Breaking long activities into areas so they sequence finish-to-start.
 *
 * The problem this exists for, stated exactly. The demo project carries eight
 * tasks longer than 44 working days — "Structural Steel Erection, 55 days",
 * "Electrical Rough-in, 66 days" — each covering the whole building. Because
 * they cover the whole building they necessarily overlap each other, so the
 * logic between them can only be start-to-start with a large lag: 87.5% of
 * relationships carrying a lag, 19% finish-to-start, against DCMA thresholds of
 * 5% and 90%. Every one of those findings has the same root, and none of them
 * can be fixed by editing a relationship. A whole-building activity is not
 * wrong logic, it is a task list too coarse to carry logic at all.
 *
 * A 55-day task also cannot be tracked. Ask a superintendent how steel is going
 * and the answer is "about half"; ask which half and there is no answer,
 * because "half of the steel" is not a place. Split it into Zone A, B and C and
 * the same question has a real answer — A is done, B is framing, C has not
 * started — which is both a schedule and a status report.
 *
 * What splitting buys, in order of how much it matters:
 *
 *   The relationships become finish-to-start. Steel Zone A finishes, Steel Zone
 *   B starts. No lag, no overlap, no judgement — the crew moved.
 *
 *   The trades flow. Deck Zone A does not wait for all the steel; it waits for
 *   the steel in Zone A. That is the compression, and it is real construction
 *   rather than a modelling trick: it is how every building actually gets
 *   built, and it is what location-based scheduling and takt planning are for.
 *   Neither Procore nor Buildern will do it for you.
 *
 *   The schedule becomes measurable. Every task lands inside a takt window a
 *   foreman can commit to and a PM can verify by walking it.
 *
 * A split never changes how long the work takes. Three zones of 18 days run
 * back to back in the same 55 days one zone of 55 took. The duration only
 * compresses where the takt links let a following trade start early, and that
 * compression was always available — it was just invisible.
 */
import {
  toDayIndex, fromDayIndex, addWorkDays, shiftWorkDays, nextWorkDay,
  workDaysBetween, parseDependencies, FIVE_DAY,
  type Calendar, type CpmTask, type Dependency, type RelType,
} from './schedule-cpm';

/* ── what an area is ─────────────────────────────────────────────────────── */

export interface AreaSpec {
  /** "Zone A", "Level 2", "Building 1" — what a foreman would call it. */
  name: string;
  /**
   * Relative size. Areas are rarely equal: a ground floor with the lobby and
   * the loading dock is more work than the floor above it. Defaults to 1.
   */
  weight?: number;
}

export type AreaStyle = 'zone' | 'level' | 'area' | 'building' | 'phase';

const STYLE_LABELS: Record<AreaStyle, (i: number) => string> = {
  zone: (i) => `Zone ${String.fromCharCode(65 + i)}`,
  area: (i) => `Area ${i + 1}`,
  level: (i) => `Level ${i + 1}`,
  building: (i) => `Building ${String.fromCharCode(65 + i)}`,
  phase: (i) => `Phase ${i + 1}`,
};

/** Generic area names in the shape a scheduler would type them. */
export function defaultAreas(count: number, style: AreaStyle = 'zone'): AreaSpec[] {
  const n = Math.max(1, Math.min(26, Math.round(count || 1)));
  const label = STYLE_LABELS[style] ?? STYLE_LABELS.zone;
  return Array.from({ length: n }, (_, i) => ({ name: label(i), weight: 1 }));
}

/* ── options ─────────────────────────────────────────────────────────────── */

/**
 * The longest a split piece should run.
 *
 * DCMA draws its line at 44 working days, but that is the point at which a task
 * becomes indefensible, not the point at which it becomes good. Takt planning
 * works in windows of one to four weeks, because that is the horizon a foreman
 * can actually commit to and a PM can verify by walking the floor. Twenty
 * working days is a month of work — the long end of that range, chosen so this
 * does not shatter a schedule into pieces nobody will maintain.
 */
export const DEFAULT_TARGET_DAYS = 20;

/** Past this, the pieces stop being places and start being paperwork. */
export const MAX_AREAS = 8;

/** Below this there is nothing to gain — one area is the task you started with. */
export const MIN_SPLIT_DAYS = 10;

export interface SplitOptions {
  calendar?: Calendar;
  /** Target length for each piece, in working days. */
  targetDays?: number;
  /** Only consider tasks at least this long. Defaults to `targetDays` × 1.5. */
  minDuration?: number;
  /** Cap on pieces per task. */
  maxAreas?: number;
  /** The areas to use. Defaults to generic zones sized to each task. */
  areas?: AreaSpec[];
  areaStyle?: AreaStyle;
  /** Mint an id for a piece. Defaults to a derived string id. */
  idFor?: (parentId: string, index: number, areaName: string) => string;
}

/* ── the plan ────────────────────────────────────────────────────────────── */

export interface SplitPiece {
  id: string;
  name: string;
  area: string;
  areaIndex: number;
  duration: number;
  startDate: string | null;
  endDate: string | null;
  wbs: string | null;
}

export interface SplitPlan {
  taskId: string;
  taskName: string;
  originalDuration: number;
  pieces: SplitPiece[];
  reason: string;
}

export interface SplitSkip {
  taskId: string;
  taskName: string;
  reason: string;
}

export interface SplitProposal {
  plans: SplitPlan[];
  skipped: SplitSkip[];
  /** How many relationships the split will add, all of them finish-to-start. */
  newRelationships: number;
  /** How many existing relationships become finish-to-start through takt. */
  taktLinks: number;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

const nameOf = (t: CpmTask) => String(t.name ?? t.id);

/**
 * A task's length in working days, preferring what its dates actually say.
 *
 * The stored `duration` column is not reliable — live rows carry 1 against a
 * 46-day span. When the dates disagree with the column the dates win, because
 * the dates are what the Gantt drew and what somebody looked at.
 */
export function durationOf(t: CpmTask, cal: Calendar = FIVE_DAY): number {
  const s = toDayIndex(t.start_date);
  const e = toDayIndex(t.end_date);
  if (s !== null && e !== null && e >= s) return workDaysBetween(s, e, cal);
  const d = Number(t.duration);
  return Number.isFinite(d) && d > 0 ? Math.round(d) : 0;
}

/**
 * Split `total` working days across weighted areas, losing none of them.
 *
 * Rounding each share independently loses or gains days, and a schedule that
 * grows a day every time somebody splits a task is worse than one that never
 * splits. The remainder is handed out largest-share-first, so the pieces sum to
 * exactly what the task was.
 */
export function allocateDays(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (n === 1) return [Math.max(1, total)];

  const sum = weights.reduce((a, b) => a + (b > 0 ? b : 0), 0) || n;
  const exact = weights.map((w) => (Math.max(0, w) / sum) * total);
  const floors = exact.map((x) => Math.max(1, Math.floor(x)));

  let short = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);

  /* Hand out what rounding dropped, then claw back what it over-gave — never
     below one day, because a zero-day area is not a place, it is a milestone. */
  for (let k = 0; short > 0 && k < order.length * 4; k++) { floors[order[k % order.length].i]++; short--; }
  for (let k = 0; short < 0 && k < order.length * 4; k++) {
    const i = order[order.length - 1 - (k % order.length)].i;
    if (floors[i] > 1) { floors[i]--; short++; }
  }
  return floors;
}

/** How many pieces a task of this length wants. */
export function areasNeeded(duration: number, targetDays: number, maxAreas: number): number {
  if (duration <= 0 || targetDays <= 0) return 1;
  return Math.max(1, Math.min(maxAreas, Math.ceil(duration / targetDays)));
}

const defaultIdFor = (parentId: string, index: number) => `${parentId}::a${index + 1}`;

/* ── proposing ───────────────────────────────────────────────────────────── */

/**
 * Which tasks are too long to carry logic, and how they should come apart.
 *
 * Read-only: it proposes and explains, it changes nothing. A scheduler accepts
 * or rejects each plan, because which areas a building actually breaks into is
 * a judgement about the job — level by level for a hotel, zone by zone for a
 * warehouse, building by building for a campus — and no library knows that.
 * What a library does know is which tasks cannot be scheduled or tracked as
 * they stand, and roughly how many pieces would fix it.
 */
export function suggestSplits(tasks: CpmTask[], opts: SplitOptions = {}): SplitProposal {
  const cal = opts.calendar ?? FIVE_DAY;
  const targetDays = Math.max(1, opts.targetDays ?? DEFAULT_TARGET_DAYS);
  const maxAreas = Math.max(2, opts.maxAreas ?? MAX_AREAS);
  const minDuration = Math.max(MIN_SPLIT_DAYS, opts.minDuration ?? Math.round(targetDays * 1.5));
  const idFor = opts.idFor ?? defaultIdFor;

  const plans: SplitPlan[] = [];
  const skipped: SplitSkip[] = [];

  const candidates = tasks.filter((t) => durationOf(t, cal) >= minDuration);

  /* One breakdown for the whole project, not one per task.
   *
   * This is the difference between splitting a schedule and planning it. A
   * building is divided into areas ONCE; every trade then walks the same areas,
   * taking however long its own work takes in each. Sizing the areas per task
   * instead — three zones of steel because steel is long, two of deck because
   * deck is shorter — gives two trades two different buildings, and the takt
   * links that are the entire point of this file cannot be made: Deck Zone B is
   * not a place Steel Zone B ever was.
   *
   * So the count is set by the longest task, which is the one that needs the
   * most pieces to fit inside a takt window. Everything else uses the same
   * areas and simply moves through them faster. */
  const count = opts.areas?.length ?? Math.max(
    1,
    ...candidates.map((t) => areasNeeded(durationOf(t, cal), targetDays, maxAreas)),
  );
  if (count < 2) return { plans, skipped, newRelationships: 0, taktLinks: 0 };

  const areas = opts.areas ?? defaultAreas(count, opts.areaStyle ?? 'zone');

  for (const t of candidates) {
    const id = String(t.id);
    const duration = durationOf(t, cal);

    const start = toDayIndex(t.start_date);
    if (start === null) {
      /* Without a start there is nowhere to put the pieces. Splitting on the
         duration column alone would invent dates the Gantt never drew. */
      skipped.push({ taskId: id, taskName: nameOf(t), reason: `${duration} working days, but no start date — nowhere to put the pieces` });
      continue;
    }

    const days = allocateDays(duration, areas.map((a) => a.weight ?? 1));

    /* Walk the pieces forward through working days from the original start, so
       the last one finishes where the task always finished. */
    const pieces: SplitPiece[] = [];
    let cursor = nextWorkDay(start, cal);
    for (let i = 0; i < areas.length; i++) {
      const s = cursor;
      const e = addWorkDays(s, days[i], cal);
      pieces.push({
        id: idFor(id, i, areas[i].name),
        name: `${nameOf(t)} — ${areas[i].name}`,
        area: areas[i].name,
        areaIndex: i,
        duration: days[i],
        startDate: fromDayIndex(s),
        endDate: fromDayIndex(e),
        wbs: t.wbs ? `${String(t.wbs)}.${i + 1}` : null,
      });
      cursor = shiftWorkDays(e, 1, cal);
    }

    plans.push({
      taskId: id,
      taskName: nameOf(t),
      originalDuration: duration,
      pieces,
      reason:
        `${duration} working days across the whole job is too coarse to sequence or to track — ` +
        `"how is it going" has no answer more precise than "about half". ` +
        `${areas.length} areas of about ${Math.round(duration / areas.length)} days each run back to back, ` +
        `finish-to-start, and each one is a place somebody can walk.`,
    });
  }

  /* What the plan buys, counted rather than claimed. Inside a split task each
     piece follows the last: n areas make n−1 finish-to-start relationships. */
  const newRelationships = plans.reduce((a, p) => a + p.pieces.length - 1, 0);

  /* And where a split task's predecessor is split into the SAME areas, the old
     overlap relationship becomes one finish-to-start link per area. */
  const planById = new Map(plans.map((p) => [p.taskId, p]));
  let taktLinks = 0;
  for (const t of tasks) {
    const mine = planById.get(String(t.id));
    if (!mine) continue;
    for (const d of parseDependencies(t.predecessors)) {
      const theirs = planById.get(d.id);
      if (theirs && sameAreas(mine, theirs)) taktLinks += mine.pieces.length;
    }
  }

  return { plans, skipped, newRelationships, taktLinks };
}

const sameAreas = (a: SplitPlan, b: SplitPlan): boolean =>
  a.pieces.length === b.pieces.length &&
  a.pieces.every((p, i) => p.area === b.pieces[i].area);

/**
 * Spread the parent's progress across its pieces, in the order they run.
 *
 * The first version discarded it: which zone the 40% was in looked like a
 * question only a status report could answer, and inventing one is the worst
 * thing this file could do. But splitting a live schedule then wiped every
 * percentage on it — 29 tasks suddenly "due to start with no progress", 23
 * "past their finish date unfinished" — which is not caution, it is a worse
 * lie than the one being avoided.
 *
 * And the question was already answered. The pieces run strictly one after
 * another; that is what the split just established. So 40% of the work done
 * means the first 40% of the sequence is done — Zone A finished, Zone B part
 * way through, C and D not started. That is a consequence of the sequencing,
 * not a guess about it.
 *
 * The one thing it cannot survive is a schedule where the crew skipped a zone.
 * Nothing in the data records that, and a percentage against a whole-building
 * task never could.
 */
export function allocateProgress(task: CpmTask, plan: SplitPlan): number[] {
  const raw = Number(task.pct_complete);
  const pct = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
  const total = plan.pieces.reduce((a, p) => a + p.duration, 0) || 1;
  let doneDays = (pct / 100) * total;

  return plan.pieces.map((p) => {
    if (doneDays <= 0) return 0;
    if (doneDays >= p.duration) { doneDays -= p.duration; return 100; }
    const share = Math.round((doneDays / p.duration) * 100);
    doneDays = 0;
    return share;
  });
}

/* ── applying ────────────────────────────────────────────────────────────── */

/**
 * Fold accepted plans into the task list and rewire every relationship.
 *
 * Three rewirings, and getting any of them wrong silently moves the project:
 *
 *   Inside a split task, each piece follows the one before it, finish-to-start.
 *
 *   Where a split task's predecessor is split into the same areas, the trades
 *   flow: piece i follows the predecessor's piece i. Deck Zone A waits on Steel
 *   Zone A, not on all the steel. The old whole-task relationship is dropped,
 *   because keeping it would make the first zone wait for the last one and give
 *   back everything the split was for.
 *
 *   Everywhere else the relationship is redirected to the piece that carries
 *   the end it referred to. Finish-to-start and finish-to-finish care about the
 *   predecessor's finish, so they point at the last piece; start-to-start and
 *   start-to-finish care about its start, so they point at the first. Pointing
 *   a start-to-start at the last piece is the one that quietly adds months.
 */
export function applySplits(tasks: CpmTask[], plans: SplitPlan[], opts: SplitOptions = {}): CpmTask[] {
  const planById = new Map(plans.map((p) => [p.taskId, p]));
  if (planById.size === 0) return tasks;

  const firstPiece = (p: SplitPlan) => p.pieces[0].id;
  const lastPiece = (p: SplitPlan) => p.pieces[p.pieces.length - 1].id;

  /** The piece a relationship should point at, given what end it cares about. */
  const redirect = (p: SplitPlan, type: RelType): string =>
    type === 'SS' || type === 'SF' ? firstPiece(p) : lastPiece(p);

  const out: CpmTask[] = [];

  for (const t of tasks) {
    const id = String(t.id);
    const deps = parseDependencies(t.predecessors);
    const mine = planById.get(id);

    if (!mine) {
      /* Not split. Only its predecessors may have moved. */
      const rewired: Dependency[] = deps.map((d) => {
        const theirs = planById.get(d.id);
        return theirs ? { ...d, id: redirect(theirs, d.type ?? 'FS') } : d;
      });
      out.push({ ...t, predecessors: rewired });
      continue;
    }

    /* Split. Which predecessors flow area by area, and which do not. */
    const taktFrom = deps.filter((d) => {
      const theirs = planById.get(d.id);
      return theirs && sameAreas(mine, theirs);
    });
    const carried = deps.filter((d) => !taktFrom.includes(d));
    const progress = allocateProgress(t, mine);

    mine.pieces.forEach((piece, i) => {
      const preds: Dependency[] = [];

      /* The crew moves from one area to the next. */
      if (i > 0) preds.push({ id: mine.pieces[i - 1].id, type: 'FS', lag: 0 });

      /* The trade in front of us, one area ahead. */
      for (const d of taktFrom) {
        preds.push({ id: planById.get(d.id)!.pieces[i].id, type: 'FS', lag: 0 });
      }

      /* Everything else drives the first area only — the rest are already
         driven by the area before them, and hanging the outside world on all of
         them would pin every piece to the same date and undo the sequence. */
      if (i === 0) {
        for (const d of carried) {
          const theirs = planById.get(d.id);
          preds.push({ ...d, id: theirs ? redirect(theirs, d.type ?? 'FS') : d.id });
        }
      }

      const done = progress[i];

      out.push({
        ...t,
        id: piece.id,
        name: piece.name,
        duration: piece.duration,
        start_date: piece.startDate,
        end_date: piece.endDate,
        wbs: piece.wbs ?? t.wbs ?? null,
        predecessors: preds,
        area: piece.area,
        area_index: piece.areaIndex,
        parent_task_id: id,
        pct_complete: done,
        status: done >= 100 ? 'complete' : done > 0 ? 'in_progress' : 'not_started',
      });
    });
  }

  return out;
}

/**
 * The reverse: gather split pieces back into the task they came from.
 *
 * A split is a judgement about the job, and judgements get reversed. Without
 * this, accepting a proposal is a one-way door and nobody will risk it.
 */
export function mergeSplits(tasks: CpmTask[], parentId: string): CpmTask[] {
  const pieces = tasks
    .filter((t) => String(t.parent_task_id ?? '') === parentId)
    .sort((a, b) => Number(a.area_index ?? 0) - Number(b.area_index ?? 0));
  if (pieces.length === 0) return tasks;

  const pieceIds = new Set(pieces.map((t) => String(t.id)));
  const first = pieces[0], last = pieces[pieces.length - 1];

  /* The rebuilt task keeps whatever drove the first piece from outside the
     split, and hands its own id back to whatever the last piece drove. */
  const outsidePreds = parseDependencies(first.predecessors).filter((d) => !pieceIds.has(d.id));

  const restored: CpmTask = {
    ...first,
    id: parentId,
    name: String(first.name ?? '').split(' — ')[0] || String(first.name ?? parentId),
    start_date: first.start_date ?? null,
    end_date: last.end_date ?? null,
    duration: pieces.reduce((a, p) => a + (Number(p.duration) || 0), 0),
    predecessors: outsidePreds,
    wbs: String(first.wbs ?? '').replace(/\.\d+$/, '') || null,
    area: null,
    area_index: null,
    parent_task_id: null,
  };

  return [
    ...tasks
      .filter((t) => !pieceIds.has(String(t.id)))
      .map((t) => ({
        ...t,
        predecessors: parseDependencies(t.predecessors).map((d) =>
          pieceIds.has(d.id) ? { ...d, id: parentId } : d,
        ),
      })),
    restored,
  ];
}
