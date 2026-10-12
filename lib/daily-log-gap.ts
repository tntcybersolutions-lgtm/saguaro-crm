/**
 * lib/daily-log-gap.ts — how many workdays went unlogged since the last
 * daily log. One rule for the project register, its New Log banner and the
 * company-wide Daily Logs page (each used to carry its own copy).
 *
 * A closed job stops counting at its closeout date: "11 workdays unlogged"
 * on a job that finished last month is noise, not a gap in the record.
 */
import { isClosedStatus } from './project-lifecycle';

/** Workdays (Mon–Fri) strictly between two YYYY-MM-DD dates — 0 across a plain weekend. Pure. */
export function missedWorkdays(fromIso: string, toIso: string): number {
  let n = 0;
  const end = new Date(toIso.slice(0, 10) + 'T12:00:00').getTime();
  for (let d = new Date(fromIso.slice(0, 10) + 'T12:00:00').getTime() + 86400000; d < end; d += 86400000) {
    const wd = new Date(d).getDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/** A projects row (closeout_date) or the /api/project-context job (closeoutDate). */
export type GapProject = { status?: string | null; closeout_date?: string | null; closeoutDate?: string | null } | null | undefined;

/**
 * Unlogged workdays from the last log to today — or to the closeout date when
 * the job is closed (0 when a closed job has no closeout date on file). Pure.
 */
export function unloggedWorkdays(lastLogIso: string | null | undefined, todayIso: string, project?: GapProject): number {
  if (!lastLogIso) return 0;
  let end = todayIso.slice(0, 10);
  if (project && isClosedStatus(project.status)) {
    const close = String(project.closeoutDate || project.closeout_date || '').slice(0, 10);
    if (!close) return 0;
    if (close < end) end = close;
  }
  return missedWorkdays(lastLogIso, end);
}
