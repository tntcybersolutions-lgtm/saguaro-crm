/**
 * lib/my-day.ts — the numbers and groupings behind My Day.
 *
 * My Day is one screen for anyone's workday: what is late, what is due, what
 * the next two weeks look like, which job is hurting, and what you are waiting
 * on other people for. Everything here is pure and computed from the same
 * items /api/my-work returns (lib/my-work), so the board, the tab badge and the
 * list can never disagree. Tested in my-day.sanity.test.ts.
 */
import { addDays } from './time-zone';
import type { MyWorkItem, MyWorkSource } from './my-work';

/* ── What kind of thing a row is ───────────────────────────────────────── */

export type ItemKind =
  | 'bid' | 'rfi' | 'submittal' | 'punch' | 'todo' | 'issue' | 'inspection' | 'task'
  | 'log' | 'coi' | 'payapp' | 'tm' | 'assist' | 'followup' | 'job';

const KIND_OF_SOURCE: Record<MyWorkSource, ItemKind> = {
  bids: 'bid', rfis: 'rfi', submittals: 'submittal', punch: 'punch', todos: 'todo', issues: 'issue',
  inspections: 'inspection', schedule: 'task', daily_logs: 'log', cois: 'coi', pay_apps: 'payapp',
  tm: 'tm', assists: 'assist', followups: 'followup', jobs: 'job',
};

export const KIND_LABEL: Record<ItemKind, string> = {
  bid: 'Bids', rfi: 'RFIs', submittal: 'Submittals', punch: 'Punch', todo: 'To-dos', issue: 'Field issues',
  inspection: 'Inspections', task: 'Schedule', log: 'Daily logs', coi: 'Insurance', payapp: 'Pay apps',
  tm: 'T&M', assist: 'Radio assists', followup: 'Sales', job: 'Job starts',
};

export function kindOf(it: Pick<MyWorkItem, 'source'>): ItemKind {
  return KIND_OF_SOURCE[it.source] ?? 'todo';
}

/* ── Ball in court ─────────────────────────────────────────────────────── */

/**
 * 'others' when the next move belongs to someone else and all you can do is
 * chase it: bidders who haven't answered, a sub's missing COI, an RFI waiting
 * on its answer, an approved pay app waiting on the owner's money.
 */
export function holderOf(it: Pick<MyWorkItem, 'action' | 'title'>): 'me' | 'others' {
  if (it.action?.kind === 'remind' || it.action?.kind === 'ask_coi') return 'others';
  if (/^Get an answer on /i.test(it.title)) return 'others';
  if (/^Collect payment on /i.test(it.title)) return 'others';
  return 'me';
}

/* ── Late / today / later ──────────────────────────────────────────────── */

export type When = 'late' | 'today' | 'week' | 'later';

/** Late = past its day, or flagged red and needing doing now; today = due today or needs doing now. */
export function whenOf(it: Pick<MyWorkItem, 'day' | 'now' | 'tone'>, today: string): When {
  if (it.day && it.day < today) return 'late';
  if (it.now && it.tone === 'red') return 'late';
  if (it.now || it.day === today) return 'today';
  if (it.day && it.day <= addDays(today, 7)) return 'week';
  return 'later';
}

/** Whole days from today to `day` (negative = late). */
export function daysFrom(day: string, today: string): number {
  const a = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  const b = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  return Math.round((a - b) / 86_400_000);
}

/** The countdown chip: '3d late', 'Today', 'Tomorrow', 'in 5d', 'Oct 30', or 'Now' for an undated must-do. */
export function countdown(it: Pick<MyWorkItem, 'day' | 'now'>, today: string): { text: string; tone: 'red' | 'amber' | 'grey' } {
  if (!it.day) return it.now ? { text: 'Now', tone: 'amber' } : { text: 'No date', tone: 'grey' };
  const n = daysFrom(it.day, today);
  if (n < 0) return { text: `${-n}d late`, tone: 'red' };
  if (n === 0) return { text: 'Today', tone: 'amber' };
  if (n === 1) return { text: 'Tomorrow', tone: 'grey' };
  if (n <= 13) return { text: `in ${n}d`, tone: 'grey' };
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+it.day.slice(5, 7) - 1];
  return { text: `${m} ${+it.day.slice(8, 10)}`, tone: 'grey' };
}

/* ── The pressure line ─────────────────────────────────────────────────── */

export interface Pressure {
  total: number;
  late: number;
  today: number;
  week: number;
  later: number;
  /** Money tied to what is late or due today. */
  atStake: number;
  /** Items whose next move is someone else's. */
  waiting: number;
  /** Share of open items that are not late, 0–100 (100 when there is nothing). */
  onTimePct: number;
}

export function pressure(items: MyWorkItem[], today: string): Pressure {
  const p: Pressure = { total: items.length, late: 0, today: 0, week: 0, later: 0, atStake: 0, waiting: 0, onTimePct: 100 };
  for (const it of items) {
    const w = whenOf(it, today);
    p[w] += 1;
    if ((w === 'late' || w === 'today') && it.amount) p.atStake += Math.abs(it.amount);
    if (holderOf(it) === 'others') p.waiting += 1;
  }
  p.onTimePct = p.total ? Math.round(((p.total - p.late) / p.total) * 100) : 100;
  return p;
}

/* ── The runway: the next two weeks, one bar per day ──────────────────── */

export interface RunwayDay {
  /** 'late' for the overdue column, else 'YYYY-MM-DD'. */
  day: string;
  red: number;
  amber: number;
  gold: number;
  grey: number;
  total: number;
  isToday: boolean;
  weekend: boolean;
}

/**
 * Column 0 is everything late; then today and the next `days - 1` days.
 * An undated must-do counts on today. Items further out are not drawn.
 */
export function runway(items: MyWorkItem[], today: string, days = 14): RunwayDay[] {
  const cols: RunwayDay[] = [{ day: 'late', red: 0, amber: 0, gold: 0, grey: 0, total: 0, isToday: false, weekend: false }];
  const idx = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i);
    const wd = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))).getUTCDay();
    idx.set(d, cols.length);
    cols.push({ day: d, red: 0, amber: 0, gold: 0, grey: 0, total: 0, isToday: i === 0, weekend: wd === 0 || wd === 6 });
  }
  for (const it of items) {
    const w = whenOf(it, today);
    const col = w === 'late' ? cols[0] : it.day && idx.has(it.day) ? cols[idx.get(it.day)!] : w === 'today' ? cols[1] : null;
    if (!col) continue;
    const tone = w === 'late' ? 'red' : it.tone;
    col[tone] += 1;
    col.total += 1;
  }
  return cols;
}

/** Does an item belong to a runway column? (The filter a tapped day applies.) */
export function inRunwayDay(it: MyWorkItem, col: string, today: string): boolean {
  const w = whenOf(it, today);
  if (col === 'late') return w === 'late';
  if (w === 'late') return false;
  if (col === today) return it.day === today || (w === 'today' && !it.day) || (w === 'today' && !!it.day && it.day < today);
  return it.day === col;
}

/* ── Job heat ──────────────────────────────────────────────────────────── */

export interface JobHeat {
  projectId: string | null;
  name: string;
  color: string | null;
  open: number;
  late: number;
  amount: number;
}

export function jobHeat(items: MyWorkItem[], jobs: Record<string, { name: string; color: string | null }>, today: string): JobHeat[] {
  const m = new Map<string, JobHeat>();
  for (const it of items) {
    const key = it.projectId ?? '__none';
    const j = it.projectId ? jobs[it.projectId] : null;
    const row = m.get(key) ?? { projectId: it.projectId ?? null, name: j?.name ?? 'Company-wide', color: j?.color ?? null, open: 0, late: 0, amount: 0 };
    row.open += 1;
    if (whenOf(it, today) === 'late') row.late += 1;
    if (it.amount) row.amount += Math.abs(it.amount);
    m.set(key, row);
  }
  return [...m.values()].sort((a, b) => b.late - a.late || b.open - a.open || b.amount - a.amount || a.name.localeCompare(b.name));
}

/* ── Filters and grouping ──────────────────────────────────────────────── */

export interface BoardFilter {
  when?: When | 'waiting' | null;
  day?: string | null;
  projectId?: string | null;
  kind?: ItemKind | null;
  q?: string;
}

export function applyFilter(items: MyWorkItem[], f: BoardFilter, today: string): MyWorkItem[] {
  const q = (f.q || '').trim().toLowerCase();
  return items.filter((it) => {
    if (f.when === 'waiting' && holderOf(it) !== 'others') return false;
    if (f.when && f.when !== 'waiting' && whenOf(it, today) !== f.when) return false;
    if (f.day && !inRunwayDay(it, f.day, today)) return false;
    if (f.projectId !== undefined && f.projectId !== null && (it.projectId ?? '__none') !== f.projectId) return false;
    if (f.kind && kindOf(it) !== f.kind) return false;
    if (q && !`${it.title} ${it.meta}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export type GroupMode = 'urgency' | 'job' | 'type';

export interface Group {
  key: string;
  label: string;
  tone: 'red' | 'amber' | 'grey' | 'gold';
  items: MyWorkItem[];
  amount: number;
}

const WHEN_ORDER: When[] = ['late', 'today', 'week', 'later'];
const WHEN_LABEL: Record<When, string> = { late: 'Late', today: 'Today', week: 'Next 7 days', later: 'Later' };
const WHEN_TONE: Record<When, Group['tone']> = { late: 'red', today: 'amber', week: 'grey', later: 'grey' };
const TONE_RANK = { red: 0, amber: 1, grey: 2, gold: 3 } as const;

/** Loudest first, then soonest, then most money — the order never shuffles between loads. */
export function rank(items: MyWorkItem[], today: string): MyWorkItem[] {
  const wr = (it: MyWorkItem) => WHEN_ORDER.indexOf(whenOf(it, today));
  return [...items].sort((a, b) =>
    wr(a) - wr(b)
    || TONE_RANK[a.tone] - TONE_RANK[b.tone]
    || (a.day ?? '9999-99-99').localeCompare(b.day ?? '9999-99-99')
    || (b.amount ?? 0) - (a.amount ?? 0)
    || a.title.localeCompare(b.title)
    || a.key.localeCompare(b.key));
}

export function groupItems(items: MyWorkItem[], mode: GroupMode, today: string, jobs: Record<string, { name: string; color: string | null }>): Group[] {
  const ranked = rank(items, today);
  const m = new Map<string, Group>();
  const sum = (g: Group, it: MyWorkItem) => { g.items.push(it); if (it.amount) g.amount += Math.abs(it.amount); };
  for (const it of ranked) {
    let key: string, label: string, tone: Group['tone'];
    if (mode === 'urgency') {
      const w = whenOf(it, today);
      key = w; label = WHEN_LABEL[w]; tone = WHEN_TONE[w];
    } else if (mode === 'job') {
      key = it.projectId ?? '__none'; label = it.projectId ? jobs[it.projectId]?.name ?? 'Job' : 'Company-wide'; tone = 'grey';
    } else {
      const k = kindOf(it);
      key = k; label = KIND_LABEL[k]; tone = 'grey';
    }
    const g = m.get(key) ?? { key, label, tone, items: [], amount: 0 };
    sum(g, it);
    m.set(key, g);
  }
  const groups = [...m.values()];
  if (mode === 'urgency') groups.sort((a, b) => WHEN_ORDER.indexOf(a.key as When) - WHEN_ORDER.indexOf(b.key as When));
  else groups.sort((a, b) => {
    const la = a.items.filter((i) => whenOf(i, today) === 'late').length, lb = b.items.filter((i) => whenOf(i, today) === 'late').length;
    return lb - la || b.items.length - a.items.length || a.label.localeCompare(b.label);
  });
  // A group's tone is its loudest item.
  if (mode !== 'urgency') for (const g of groups) g.tone = g.items.some((i) => whenOf(i, today) === 'late') ? 'red' : g.items.some((i) => whenOf(i, today) === 'today') ? 'amber' : 'grey';
  return groups;
}

/** 'Project manager', 'Superintendent' — a role key read as words. */
export function roleLabel(r: string): string {
  const s = String(r || '').replace(/_/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

/* ── Which section a row lands in ──────────────────────────────────────── */

export interface Placed {
  late: MyWorkItem[];
  today: MyWorkItem[];
  waiting: MyWorkItem[];
  wrapup: MyWorkItem[];
  /** Everything after today (next 7 days and later), for the look-ahead list. */
  upcoming: MyWorkItem[];
  /** Due tomorrow — shown in the wrap-up as "first thing tomorrow". */
  tomorrow: MyWorkItem[];
}

/**
 * Every item shows exactly once. Chasing someone else goes to Waiting and
 * today's daily log goes to the wrap-up — when those sections are on;
 * otherwise the item falls back to Late / Today / the look-ahead by its date,
 * so hiding a section never hides work.
 */
export function placeItems(items: MyWorkItem[], visible: { waiting: boolean; wrapup: boolean; late: boolean }, today: string): Placed {
  const p: Placed = { late: [], today: [], waiting: [], wrapup: [], upcoming: [], tomorrow: [] };
  const tomorrow = addDays(today, 1);
  for (const it of rank(items, today)) {
    const w = whenOf(it, today);
    if (visible.waiting && holderOf(it) === 'others') { p.waiting.push(it); continue; }
    if (visible.wrapup && kindOf(it) === 'log' && w !== 'week' && w !== 'later') { p.wrapup.push(it); continue; }
    if (w === 'late') (visible.late ? p.late : p.today).push(it);
    else if (w === 'today') p.today.push(it);
    else {
      p.upcoming.push(it);
      if (it.day === tomorrow) p.tomorrow.push(it);
    }
  }
  return p;
}
