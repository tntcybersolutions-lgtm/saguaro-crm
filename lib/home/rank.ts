/**
 * Home dashboard — shared types and the deterministic action-queue ranking.
 *
 * Pure (no I/O) so the API route, tests and any future report use the SAME
 * ordering. Spec: docs/SPEC-dashboard-2026-10-03.md §9.
 *
 * Tiers, most urgent first:
 *   0 critical   safety / active service breach / failed inspection
 *   1 blocking   blocks work scheduled today (e.g. inspection today, not passed)
 *   2 overdue    past its due date
 *   3 today      due today
 *   4 soon       due within 7 days
 *   5 info       everything else worth knowing
 * Within a tier: earliest due first, then oldest update.
 */

export type HomeView = 'operations' | 'sales' | 'service' | 'owner' | 'field';
export const HOME_VIEWS: HomeView[] = ['operations', 'sales', 'service', 'owner', 'field'];
export const VIEW_LABEL: Record<HomeView, string> = {
  operations: 'Operations',
  sales: 'Sales',
  service: 'Service',
  owner: 'Owner',
  field: 'Field',
};

export type Tier = 0 | 1 | 2 | 3 | 4 | 5;
export const TIER_LABEL: Record<Tier, string> = {
  0: 'Critical', 1: 'Blocking Today', 2: 'Overdue', 3: 'Due Today', 4: 'This Week', 5: 'Info',
};

export type DataState = 'ok' | 'empty' | 'unavailable' | 'restricted' | 'failed';

export interface QueueItem {
  /** Stable: `${sourceType}:${sourceId}` (or `group:<kind>` for grouped rows). */
  id: string;
  sourceType: string;
  sourceId: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  /** Accountable person, or null = Unassigned. */
  owner: string | null;
  /** YYYY-MM-DD or ISO timestamp; null = "Deadline not set". */
  dueAt: string | null;
  tier: Tier;
  /** Why it matters, in our words. Never an invented impact. */
  reason: string;
  actionLabel: string;
  /** Where the real record lives. */
  href: string;
  updatedAt: string | null;
  /** Grouped compliance rows: how many records the row stands for. */
  count?: number;
}

export interface Metric {
  key: string;
  label: string;
  /** Formatted value, or null when state is not 'ok'/'empty'. */
  value: string | null;
  /** Scope / time basis, e.g. "Mine · open, past due". */
  basis: string;
  href: string | null;
  state: DataState;
  /** Shown when state is unavailable/failed/restricted. */
  note?: string;
}

export interface ScheduleEntry {
  id: string;
  kind: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  time: string | null;
  projectId: string | null;
  projectName: string | null;
  who: string | null;
  href: string;
}

/** YYYY-MM-DD for `d` in `timeZone`. */
export function ymdIn(timeZone: string, d: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Whole days from `fromYmd` to `toYmd` (negative = past). */
export function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.parse(fromYmd + 'T00:00:00Z');
  const b = Date.parse(toYmd + 'T00:00:00Z');
  return Math.round((b - a) / 86_400_000);
}

/**
 * Tier from a due date. Date-only deadlines become overdue the day AFTER the
 * due date in the tenant's timezone (a thing due today is "due today" all day).
 */
export function tierForDue(dueAt: string | null, today: string, opts: { critical?: boolean; blocking?: boolean } = {}): Tier {
  if (opts.critical) return 0;
  if (opts.blocking) return 1;
  if (!dueAt) return 5;
  const due = dueAt.slice(0, 10);
  if (due < today) return 2;
  if (due === today) return 3;
  if (due <= addDays(today, 7)) return 4;
  return 5;
}

export function dueReason(dueAt: string | null, today: string): string {
  if (!dueAt) return 'Deadline not set';
  const n = daysBetween(today, dueAt.slice(0, 10));
  if (n < 0) return `${-n} day${n === -1 ? '' : 's'} overdue`;
  if (n === 0) return 'Due today';
  return `Due in ${n} day${n === 1 ? '' : 's'}`;
}

/** Deterministic order: tier, then earliest due, then oldest update. */
export function rankQueue(items: QueueItem[]): QueueItem[] {
  const seen = new Set<string>();
  const unique = items.filter(i => (seen.has(i.id) ? false : (seen.add(i.id), true)));
  return unique.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const ad = a.dueAt ? a.dueAt.slice(0, 10) : '9999-12-31';
    const bd = b.dueAt ? b.dueAt.slice(0, 10) : '9999-12-31';
    if (ad !== bd) return ad < bd ? -1 : 1;
    const au = a.updatedAt || '';
    const bu = b.updatedAt || '';
    return au < bu ? -1 : au > bu ? 1 : 0;
  });
}

/** Does a free-form assignee field point at this user? (uuid, email or name.) */
export function isMine(values: Array<string | null | undefined>, me: { id: string; email: string; name: string | null }): boolean {
  const email = me.email.toLowerCase();
  const name = (me.name || '').trim().toLowerCase();
  return values.some(v => {
    if (!v) return false;
    const s = String(v).trim().toLowerCase();
    return s === me.id.toLowerCase() || s === email || (!!name && s === name);
  });
}
