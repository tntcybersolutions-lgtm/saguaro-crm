/**
 * meetings — the pure rules behind job meetings and their minutes.
 *
 * A meeting series (every OAC meeting on a job, every sub coordination meeting)
 * is numbered 1, 2, 3… per type. Items are numbered "<meeting>.<n>" when they
 * are raised, and an item that is still open when the next meeting starts is
 * copied forward KEEPING ITS NUMBER — so "3.2" is the same question at meeting
 * 4, 5 and 6 until somebody closes it. Each copy points at the one before it
 * (carried_from_item_id), which keeps every meeting's minutes exactly as they
 * were distributed while the job only counts the newest copy as live.
 *
 * No I/O here. The routes and pages import these so the numbers on screen and
 * the rows written by "Start next meeting" come from one definition.
 */

export const MEETING_TYPES = ['oac', 'subcontractor', 'safety', 'preconstruction', 'internal'] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const MEETING_STATUSES = ['scheduled', 'in_progress', 'minutes_draft', 'distributed'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const ITEM_STATUSES = ['open', 'closed'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

const TYPE_LABEL: Record<MeetingType, string> = {
  oac: 'OAC',
  subcontractor: 'Subcontractor',
  safety: 'Safety',
  preconstruction: 'Preconstruction',
  internal: 'Internal',
};

const STATUS_LABEL: Record<MeetingStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  minutes_draft: 'Minutes draft',
  distributed: 'Distributed',
};

/** Postgres "relation does not exist" (42P01) or PostgREST's schema-cache miss (PGRST205). */
export const TABLE_MISSING_CODE = 'MEETINGS_TABLE_MISSING';
export const TABLE_MISSING_MESSAGE = 'Meetings needs its database table — run the migration';

export function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code === '42P01' || e.code === 'PGRST205') return true;
  const m = typeof e.message === 'string' ? e.message : '';
  return /relation .* does not exist|could not find the table/i.test(m);
}

export function normalizeType(v: unknown): MeetingType {
  const s = String(v ?? '').toLowerCase().trim();
  if ((MEETING_TYPES as readonly string[]).includes(s)) return s as MeetingType;
  if (s === 'sub' || s === 'coordination') return 'subcontractor';
  if (s === 'precon') return 'preconstruction';
  return 'internal';
}

/** Rows written before this tool used completed/cancelled; map them onto the four states. */
export function normalizeStatus(v: unknown): MeetingStatus {
  const s = String(v ?? '').toLowerCase().trim();
  if ((MEETING_STATUSES as readonly string[]).includes(s)) return s as MeetingStatus;
  if (s === 'completed' || s === 'complete') return 'minutes_draft';
  return 'scheduled';
}

export const typeLabel = (v: unknown) => TYPE_LABEL[normalizeType(v)];
export const statusLabel = (v: unknown) => STATUS_LABEL[normalizeStatus(v)];

export type ItemLike = {
  id: string;
  number: string | null;
  status: string | null;
  due_date: string | null;
  carried_from_item_id?: string | null;
  position?: number | null;
  meeting_id?: string;
};

/** "3.10" sorts after "3.2"; unnumbered items go last. */
export function compareItemNumbers(a: string | null | undefined, b: string | null | undefined): number {
  const pa = String(a ?? '').split('.').map((x) => Number.parseInt(x, 10));
  const pb = String(b ?? '').split('.').map((x) => Number.parseInt(x, 10));
  const aBad = !a || pa.some((n) => Number.isNaN(n));
  const bBad = !b || pb.some((n) => Number.isNaN(n));
  if (aBad || bBad) return aBad === bBad ? 0 : aBad ? 1 : -1;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function sortItems<T extends ItemLike>(items: T[]): T[] {
  return [...items].sort((x, y) => compareItemNumbers(x.number, y.number) || (x.position ?? 0) - (y.position ?? 0));
}

/** The number a NEW item raised in meeting `meetingNumber` gets: "<meeting>.<next>". */
export function nextItemNumber(meetingNumber: number | null | undefined, existing: (string | null | undefined)[]): string {
  const m = meetingNumber && meetingNumber > 0 ? Math.floor(meetingNumber) : 1;
  let max = 0;
  for (const n of existing) {
    const [head, tail] = String(n ?? '').split('.');
    if (Number.parseInt(head, 10) === m) {
      const t = Number.parseInt(tail, 10);
      if (!Number.isNaN(t) && t > max) max = t;
    }
  }
  return `${m}.${max + 1}`;
}

/** Next meeting number in a series = highest number of that type on the job + 1. */
export function nextMeetingNumber(meetings: { meeting_type: string | null; meeting_number: number | null }[], type: unknown): number {
  const t = normalizeType(type);
  let max = 0;
  for (const m of meetings) if (normalizeType(m.meeting_type) === t && (m.meeting_number ?? 0) > max) max = m.meeting_number ?? 0;
  return max + 1;
}

/** YYYY-MM-DD. `today` is a YYYY-MM-DD string from the caller (company day). */
export function isItemOverdue(item: Pick<ItemLike, 'status' | 'due_date'>, today: string): boolean {
  if (item.status === 'closed' || !item.due_date) return false;
  return item.due_date.slice(0, 10) < today;
}

/** Items that a later copy has replaced (an open item carried into the next meeting). */
export function supersededIds(items: Pick<ItemLike, 'carried_from_item_id'>[]): Set<string> {
  const s = new Set<string>();
  for (const i of items) if (i.carried_from_item_id) s.add(i.carried_from_item_id);
  return s;
}

/** Open items on the job, counting only the newest copy of a carried item. */
export function liveOpenItems<T extends ItemLike>(items: T[]): T[] {
  const gone = supersededIds(items);
  return items.filter((i) => i.status !== 'closed' && !gone.has(i.id));
}

export type CarryRow = {
  tenant_id: string;
  project_id: string;
  meeting_id: string;
  number: string | null;
  topic: string;
  discussion: string | null;
  status: 'open';
  assignee_name: string | null;
  due_date: string | null;
  carried_from_item_id: string;
  position: number;
};

/** The rows "Start next meeting" inserts: every open item, same number, linked back. */
export function carryForwardRows(
  items: (ItemLike & { topic: string | null; discussion: string | null; assignee_name: string | null })[],
  target: { tenantId: string; projectId: string; meetingId: string },
): CarryRow[] {
  return sortItems(items.filter((i) => i.status !== 'closed')).map((i, idx) => ({
    tenant_id: target.tenantId,
    project_id: target.projectId,
    meeting_id: target.meetingId,
    number: i.number,
    topic: i.topic || 'Untitled item',
    discussion: i.discussion,
    status: 'open',
    assignee_name: i.assignee_name,
    due_date: i.due_date,
    carried_from_item_id: i.id,
    position: idx,
  }));
}

/** Default date for the next meeting: same weekday one week on. */
export function nextMeetingDate(date: string | null | undefined, todayStr: string): string {
  const base = date && /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : todayStr;
  const d = new Date(`${base}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  const next = d.toISOString().slice(0, 10);
  return next < todayStr ? todayStr : next;
}

export type MeetingLike = { id: string; meeting_date: string | null; status: string | null };

export function meetingStats(meetings: MeetingLike[], items: ItemLike[], today: string) {
  const live = liveOpenItems(items);
  return {
    upcoming: meetings.filter((m) => normalizeStatus(m.status) === 'scheduled' && (m.meeting_date || '').slice(0, 10) >= today).length,
    openItems: live.length,
    overdueItems: live.filter((i) => isItemOverdue(i, today)).length,
    distributed: meetings.filter((m) => normalizeStatus(m.status) === 'distributed').length,
  };
}

/** Per-meeting counts for the list: open / overdue items on THAT meeting's minutes. */
export function itemCountsByMeeting(items: ItemLike[], today: string): Record<string, { open: number; overdue: number; total: number }> {
  const out: Record<string, { open: number; overdue: number; total: number }> = {};
  for (const i of items) {
    if (!i.meeting_id) continue;
    const c = (out[i.meeting_id] ||= { open: 0, overdue: 0, total: 0 });
    c.total++;
    if (i.status !== 'closed') c.open++;
    if (isItemOverdue(i, today)) c.overdue++;
  }
  return out;
}
