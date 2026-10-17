/**
 * lib/schedule-cascade.ts — when a task's dates move, its followers move too.
 *
 * Every link is finish-to-start (lib/schedule-cpm reads the same links). When
 * a task is saved with new dates, each task that follows it is re-placed so it
 * keeps the spacing it had behind each of its predecessors:
 *
 *   new start = max over its predecessors ( predecessor's finish + 1 + gap )
 *   gap       = the days it used to sit after the predecessor that held it
 *               back (the smallest gap, never < 0); 0 for the others
 *
 * Its own length is kept. A one-predecessor follower therefore slides by
 * exactly as many days as its predecessor's finish moved — later or earlier —
 * and a follower with two predecessors waits for whichever now finishes last.
 * The move then ripples down the chain.
 *
 * Finished tasks are history and never move. Undated tasks are skipped. A loop
 * in the links cannot ripple forever: each task is re-placed at most once per
 * pass over the network. Dates are 'YYYY-MM-DD', counted in UTC calendar days
 * so no time zone shifts them; durations are inclusive (Mon→Fri = 5 days),
 * the same as the CPM. Pure — no I/O.
 */
import { predecessorIds, type CpmTaskInput } from './schedule-cpm';
import { isScheduleDone } from './schedule-status';

export type CascadeTask = CpmTaskInput & { status?: string | null; pct_complete?: number | string | null };
export type CascadeMove = { id: string; start_date: string; end_date: string; from_start: string; from_end: string };

const DAY = 86_400_000;
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(`${v.slice(0, 10)}T00:00:00Z`));
const toNum = (v: string) => Math.round(Date.parse(`${v.slice(0, 10)}T00:00:00Z`) / DAY);
const toDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

/** Inclusive length of a task in calendar days (a one-day task is 1). */
export function spanDays(start: string, end: string): number {
  if (!isDay(start) || !isDay(end)) return 0;
  return Math.max(1, toNum(end) - toNum(start) + 1);
}

/** The finish date of a task that starts on `start` and lasts `days` (inclusive). */
export function finishFor(start: string, days: number): string {
  if (!isDay(start)) return start;
  return toDay(toNum(start) + Math.max(1, Math.round(days)) - 1);
}

/**
 * The followers that must move after `movedId` is saved with `after` dates.
 * `tasks` is the job's schedule as it was BEFORE the save (so the spacing each
 * follower kept is measured against the old dates).
 */
export function cascadeSuccessors(
  tasks: CascadeTask[],
  movedId: string,
  after: { start_date?: string | null; end_date?: string | null },
): CascadeMove[] {
  const byId = new Map(tasks.map((t) => [String(t.id), t]));
  const old = new Map<string, { s: number; e: number }>();
  for (const t of tasks) if (isDay(t.start_date) && isDay(t.end_date)) old.set(String(t.id), { s: toNum(t.start_date), e: toNum(t.end_date) });

  const cur = new Map(old);
  const mid = String(movedId);
  if (!byId.has(mid) || !isDay(after.start_date) || !isDay(after.end_date)) return [];
  cur.set(mid, { s: toNum(after.start_date), e: toNum(after.end_date) });

  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const t of tasks) {
    const id = String(t.id);
    const ps = predecessorIds(t).filter((p) => byId.has(p) && p !== id);
    preds.set(id, ps);
    for (const p of ps) { if (!succs.has(p)) succs.set(p, []); succs.get(p)!.push(id); }
  }

  const moved = new Map<string, number>(); // id → times re-placed
  const queue: string[] = [mid];
  const maxSteps = (tasks.length + 1) * (tasks.length + 1);
  let steps = 0;
  while (queue.length && steps++ < maxSteps) {
    const from = queue.shift()!;
    for (const sid of succs.get(from) || []) {
      if (sid === mid) continue; // never move the task the person just placed
      const s = byId.get(sid)!;
      const o = old.get(sid);
      if (!o || isScheduleDone(s.status, s.pct_complete)) continue;
      // The spacing is kept behind the predecessor(s) that held it back (the
      // smallest gap); any other predecessor is only a "not before" floor.
      const gaps = (preds.get(sid) || []).filter((p) => old.has(p) && cur.has(p)).map((p) => ({ p, gap: Math.max(0, o.s - (old.get(p)!.e + 1)) }));
      const binding = Math.min(...gaps.map((g) => g.gap));
      let start = -Infinity;
      for (const { p, gap } of gaps) start = Math.max(start, cur.get(p)!.e + 1 + (gap === binding ? gap : 0));
      if (!Number.isFinite(start)) continue;
      const now = cur.get(sid)!;
      if (start === now.s) continue;
      if ((moved.get(sid) || 0) >= 2) continue; // a loop — stop rippling
      moved.set(sid, (moved.get(sid) || 0) + 1);
      cur.set(sid, { s: start, e: start + (o.e - o.s) });
      queue.push(sid);
    }
  }

  const out: CascadeMove[] = [];
  for (const [id, c] of cur) {
    if (id === mid) continue;
    const o = old.get(id)!;
    if (c.s !== o.s || c.e !== o.e) out.push({ id, start_date: toDay(c.s), end_date: toDay(c.e), from_start: toDay(o.s), from_end: toDay(o.e) });
  }
  return out;
}
