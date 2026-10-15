/**
 * lib/schedule-cpm.ts — Critical Path Method over a job's schedule tasks.
 *
 * Network: every task with a valid start and end date is an activity; its
 * duration is its calendar span, inclusive (Mon→Fri = 5 days). Links are
 * finish-to-start, read from `predecessor_id` (the single link the composer
 * writes) plus any ids in the `predecessors` JSON list (imported schedules).
 *
 *   Forward pass   ES = max(planned start, latest EF of its predecessors)
 *                  EF = ES + duration
 *   Backward pass  LF = min(LS of its successors), or the project finish
 *                  LS = LF − duration
 *   Total float    LS − ES   (days)      critical ⇔ float ≤ 0
 *
 * Day offsets count UTC calendar days on 'YYYY-MM-DD' strings, so no time
 * zone can move them. EF/LF are exclusive offsets; the returned finish dates
 * are the last working day (inclusive), matching how end_date is stored.
 *
 * Bad data never throws: a link that closes a loop is dropped and reported
 * in `cycles`, a link to a task that is not on the job is reported in
 * `missing`, and a task without usable dates sits outside the network
 * (reported in `undated`, no float). Pure — no I/O.
 */

export type CpmTaskInput = {
  id: string;
  start_date?: string | null;
  end_date?: string | null;
  predecessor_id?: string | null;
  predecessors?: unknown;
};

export type CpmResult = {
  es: string; ef: string; ls: string; lf: string; // calendar days, finish dates inclusive
  duration: number; // days, inclusive
  float: number;    // total float, days
  critical: boolean;
};

export type CpmLink = { from: string; to: string; critical: boolean };

export type CpmOutput = {
  byId: Record<string, CpmResult>;
  links: CpmLink[];                              // valid, acyclic FS links between dated tasks
  cycles: { from: string; to: string }[];        // links dropped because they close a loop
  missing: { task: string; predecessor: string }[]; // links to a task that does not exist
  undated: string[];                             // tasks outside the network (no usable dates)
  criticalIds: string[];
  projectStart: string | null;
  projectFinish: string | null;                  // inclusive
};

const DAY = 86_400_000;
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(`${v.slice(0, 10)}T00:00:00Z`));
const toNum = (v: string) => Math.round(Date.parse(`${v.slice(0, 10)}T00:00:00Z`) / DAY);
const toDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

/** Every predecessor id a task names: the single column plus the JSON list. */
export function predecessorIds(t: CpmTaskInput): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    const id = typeof v === 'string' ? v : v && typeof v === 'object' ? ((v as any).id ?? (v as any).task_id ?? (v as any).predecessor_id) : null;
    if (typeof id === 'string' && id.trim() && !out.includes(id.trim())) out.push(id.trim());
  };
  push(t.predecessor_id);
  let list = t.predecessors;
  if (typeof list === 'string') { const raw = list; try { list = JSON.parse(raw); } catch { list = raw.split(','); } }
  if (Array.isArray(list)) list.forEach(push);
  return out;
}

export function computeCpm(tasks: CpmTaskInput[]): CpmOutput {
  const all = new Map(tasks.map((t) => [String(t.id), t]));
  const dated = new Map<string, { start: number; dur: number }>();
  const undated: string[] = [];
  for (const t of tasks) {
    const id = String(t.id);
    if (!isDay(t.start_date) || !isDay(t.end_date)) { undated.push(id); continue; }
    const s = toNum(t.start_date), e = toNum(t.end_date);
    dated.set(id, { start: s, dur: Math.max(1, e - s + 1) });
  }

  // Raw links; drop the ones we cannot use and say why.
  const missing: CpmOutput['missing'] = [];
  const preds = new Map<string, string[]>();
  for (const t of tasks) {
    const id = String(t.id);
    const list: string[] = [];
    for (const p of predecessorIds(t)) {
      if (!all.has(p)) { missing.push({ task: id, predecessor: p }); continue; }
      if (dated.has(id) && dated.has(p)) list.push(p);
    }
    preds.set(id, list);
  }

  // Depth-first walk: a back edge (to a task still on the stack) closes a loop.
  const cycles: CpmOutput['cycles'] = [];
  const state = new Map<string, 1 | 2>(); // 1 = on stack, 2 = done
  const order: string[] = [];
  const kept = new Map<string, string[]>();
  const visit = (root: string) => {
    const stack: { id: string; i: number }[] = [{ id: root, i: 0 }];
    state.set(root, 1);
    kept.set(root, []);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const ps = preds.get(top.id) || [];
      if (top.i < ps.length) {
        const p = ps[top.i++];
        const st = state.get(p);
        if (st === 1) { cycles.push({ from: p, to: top.id }); continue; }
        kept.get(top.id)!.push(p);
        if (!st) { state.set(p, 1); kept.set(p, []); stack.push({ id: p, i: 0 }); }
      } else {
        state.set(top.id, 2);
        order.push(top.id);
        stack.pop();
      }
    }
  };
  for (const id of Array.from(dated.keys())) if (!state.has(id)) visit(id);

  // Forward pass (order is predecessors-first).
  const ES = new Map<string, number>(), EF = new Map<string, number>();
  for (const id of order) {
    const d = dated.get(id)!;
    let es = d.start;
    for (const p of kept.get(id) || []) es = Math.max(es, EF.get(p)!);
    ES.set(id, es); EF.set(id, es + d.dur);
  }
  const efs = Array.from(EF.values());
  const finish = efs.length ? Math.max(...efs) : null;
  const starts = Array.from(ES.values());
  const start = starts.length ? Math.min(...starts) : null;

  // Backward pass.
  const succ = new Map<string, string[]>();
  for (const [id, ps] of Array.from(kept.entries())) for (const p of ps) succ.set(p, [...(succ.get(p) || []), id]);
  const LS = new Map<string, number>(), LF = new Map<string, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    let lf = finish!;
    for (const s of succ.get(id) || []) lf = Math.min(lf, LS.get(s)!);
    LF.set(id, lf); LS.set(id, lf - dated.get(id)!.dur);
  }

  const byId: Record<string, CpmResult> = {};
  const criticalIds: string[] = [];
  for (const id of Array.from(dated.keys())) {
    const float = LS.get(id)! - ES.get(id)!;
    const critical = float <= 0;
    if (critical) criticalIds.push(id);
    byId[id] = {
      es: toDay(ES.get(id)!), ef: toDay(EF.get(id)! - 1),
      ls: toDay(LS.get(id)!), lf: toDay(LF.get(id)! - 1),
      duration: dated.get(id)!.dur, float, critical,
    };
  }
  const links: CpmLink[] = [];
  for (const [to, ps] of Array.from(kept.entries())) for (const from of ps) {
    // A critical link is a driving one: both ends critical and no gap between them.
    links.push({ from, to, critical: byId[from].critical && byId[to].critical && ES.get(to) === EF.get(from) });
  }

  return {
    byId, links, cycles, missing, undated, criticalIds,
    projectStart: start === null ? null : toDay(start),
    projectFinish: finish === null ? null : toDay(finish - 1),
  };
}

/* ── 3-week lookahead ───────────────────────────────────────────────── */

export type LookaheadTask = { id: string; start_date?: string | null; end_date?: string | null; status?: string | null };
export type LookaheadWeek<T> = { index: number; start: string; end: string; tasks: T[] };

const DONE = new Set(['completed', 'complete']);

/**
 * Tasks active or starting in the `days` from `today` (inclusive), grouped
 * by week from today. A task already underway (started on or before today,
 * not finished) lands in week 1. Finished tasks and undated tasks are out.
 * Inside a week: earliest start first.
 */
export function lookahead<T extends LookaheadTask>(tasks: T[], today: string, days = 21): LookaheadWeek<T>[] {
  const t0 = toNum(today);
  const last = t0 + days - 1;
  const weeks: LookaheadWeek<T>[] = [];
  for (let i = 0; i * 7 < days; i++) weeks.push({ index: i, start: toDay(t0 + i * 7), end: toDay(Math.min(last, t0 + i * 7 + 6)), tasks: [] });
  for (const t of tasks) {
    if (DONE.has(String(t.status || ''))) continue;
    if (!isDay(t.start_date) || !isDay(t.end_date)) continue;
    const s = toNum(t.start_date), e = toNum(t.end_date);
    if (s > last || e < t0) continue;
    weeks[Math.floor(Math.max(0, s - t0) / 7)].tasks.push(t);
  }
  for (const w of weeks) w.tasks.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  return weeks;
}
