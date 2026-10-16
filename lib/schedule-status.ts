/**
 * lib/schedule-status.ts — a schedule task's status, one vocabulary.
 *
 * The job schedule (app/app/projects/[projectId]/schedule) and every list,
 * badge and "Tasks Complete" tile there speak `completed`. The write routes
 * (/api/schedule/create, /api/schedule/[id]) and the company schedule
 * (app/app/schedule) spoke `complete`. So a task dragged to 100 % on the job
 * page was saved as `complete`, showed a raw "complete" label and was not
 * counted as finished; the 15 Pima tasks stored as `completed` read as
 * "Not Started" and overdue on the company page.
 *
 * Canonical value: `completed` (what 15 of the 18 finished tasks on file
 * already carry, and what the status colors and punch list use). Every writer
 * normalizes through `normalizeScheduleStatus`; every reader asks
 * `isScheduleDone`, which also accepts the legacy spellings. Pure.
 */

export const SCHEDULE_DONE = 'completed' as const;

/** Every status the schedule screens offer, in display order. */
export const SCHEDULE_STATUSES = ['not_started', 'in_progress', 'completed', 'delayed', 'on_hold', 'blocked'] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

/** What a person reads for each status. */
export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  delayed: 'Delayed',
  on_hold: 'On Hold',
  blocked: 'Blocked',
};

/** The label for any stored value — legacy spellings read as their canonical label. */
export function scheduleStatusLabel(v: unknown): string {
  const k = normalizeScheduleStatus(v);
  if (!k) return SCHEDULE_STATUS_LABELS.not_started;
  return (SCHEDULE_STATUS_LABELS as Record<string, string>)[k] ?? k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const ALIASES: Record<string, ScheduleStatus> = {
  complete: 'completed',
  completed: 'completed',
  done: 'completed',
  finished: 'completed',
  closed: 'completed',
  not_started: 'not_started',
  notstarted: 'not_started',
  pending: 'not_started',
  planned: 'not_started',
  scheduled: 'not_started',
  in_progress: 'in_progress',
  inprogress: 'in_progress',
  started: 'in_progress',
  active: 'in_progress',
  ongoing: 'in_progress',
  delayed: 'delayed',
  late: 'delayed',
  on_hold: 'on_hold',
  onhold: 'on_hold',
  hold: 'on_hold',
  paused: 'on_hold',
  blocked: 'blocked',
};

/**
 * The canonical status for a stored or sent value. Unknown text is kept
 * (lower-cased, spaces/dashes → underscores) rather than silently rewritten.
 * Empty → undefined, so a partial update never invents a status.
 */
export function normalizeScheduleStatus(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const key = String(v).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!key) return undefined;
  return ALIASES[key] ?? ALIASES[key.replace(/_/g, '')] ?? key;
}

/** True when a task is finished — either spelling, or a 100 % bar. */
export function isScheduleDone(status: unknown, pct?: unknown): boolean {
  if (normalizeScheduleStatus(status) === SCHEDULE_DONE) return true;
  if (pct === undefined || pct === null || pct === '') return false;
  const n = Number(pct);
  return Number.isFinite(n) && n >= 100;
}

/**
 * pct_complete and status are two writers of one fact. Given what a request
 * sent (either may be absent), return the columns to write so they agree:
 * 100 % is completed, a started bar is in progress, completed means 100 %,
 * not started means 0 %. When both are sent and disagree, a full bar or an
 * explicit Completed wins (the bar fills), and a started bar moves Not Started
 * to In Progress.
 */
export function reconcileScheduleProgress(input: { status?: unknown; pct?: unknown }): { status?: string; pct_complete?: number } {
  const status = normalizeScheduleStatus(input.status);
  const hasPct = input.pct !== undefined && input.pct !== null && String(input.pct).trim() !== '';
  const pctNum = hasPct ? Number(input.pct) : NaN;
  const out: { status?: string; pct_complete?: number } = {};
  if (status !== undefined) out.status = status;
  if (hasPct && Number.isFinite(pctNum)) out.pct_complete = Math.max(0, Math.min(100, pctNum));

  if (status === undefined && Number.isFinite(pctNum)) {
    out.status = pctNum >= 100 ? SCHEDULE_DONE : pctNum > 0 ? 'in_progress' : 'not_started';
  } else if (status !== undefined && !Number.isFinite(pctNum)) {
    if (status === SCHEDULE_DONE) out.pct_complete = 100;
    else if (status === 'not_started') out.pct_complete = 0;
  } else if (status !== undefined && Number.isFinite(pctNum)) {
    // Both sent and disagreeing (the task form sends both).
    if (pctNum >= 100 && status !== SCHEDULE_DONE) out.status = SCHEDULE_DONE;          // a full bar is done
    else if (status === SCHEDULE_DONE && pctNum < 100) out.pct_complete = 100;           // picking Completed fills the bar
    else if (pctNum > 0 && status === 'not_started') out.status = 'in_progress';         // a started bar has started
  }
  return out;
}
