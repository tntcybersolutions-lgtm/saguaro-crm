/**
 * Leave (PTO / sick / holiday / vacation) on the web Time Clock.
 *
 * Leave is a `time_entries` row beside the worked shifts, so it rolls into the
 * same weekly timesheet (lib/timeclock). Two facts of that table decide the
 * row's shape, both read from the live schema:
 *
 *   • project_id is NOT NULL (FK → projects). A leave row therefore names the
 *     job whose timesheet it is approved on. Without it every insert failed.
 *   • total_hours and labor_cost are GENERATED ALWAYS from regular / overtime /
 *     doubletime hours, and Postgres rejects any value written to them — the
 *     second reason every insert failed.
 *
 * So the leave hours go in hours_worked ONLY, and regular / overtime /
 * doubletime stay 0. That keeps leave out of worked hours everywhere they are
 * summed: labor_cost stays 0, the approval trigger and the approval route post
 * nothing to job cost, and the certified-payroll import adds no worked hours.
 * Reading it back, a leave row's hours come from hours_worked (its total_hours
 * is the generated 0).
 */

/** The leave types the web form offers, in button order. */
export const LEAVE_TYPES = ['pto', 'sick', 'holiday', 'vacation'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_LABEL: Record<string, string> = {
  pto: 'PTO', sick: 'Sick', holiday: 'Holiday', vacation: 'Vacation', bereavement: 'Bereavement', unpaid: 'Unpaid',
};

/** Every entry_type the timesheet engine counts as leave rather than time on site. */
export const NON_WORKED_ENTRY_TYPES = ['pto', 'sick', 'holiday', 'vacation', 'bereavement', 'unpaid'] as const;

/** True for a leave row; false for a worked shift (no type, 'regular' or 'overtime'). */
export function isLeaveEntry(entryType: string | null | undefined): boolean {
  const t = String(entryType ?? '').trim().toLowerCase();
  return t !== '' && t !== 'regular' && t !== 'overtime';
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Hours on a leave row, or null when none were recorded. hours_worked holds
 * them; total_hours is generated from regular + OT + DT and is 0 on a leave
 * row, so it only counts when it is actually positive.
 */
export function leaveHoursOf(row: { hours_worked?: unknown; total_hours?: unknown }): number | null {
  const h = num(row.hours_worked);
  if (h != null) return h;
  const t = num(row.total_hours);
  return t != null && t > 0 ? t : null;
}

/**
 * How a leave row reads in a list of worked time: its label ("PTO", "Sick")
 * and its hours (from hours_worked). Null for a worked shift.
 *
 * Only the NON_WORKED_ENTRY_TYPES count. entry_type is NOT NULL with default
 * 'regular', and this is used to drop rows from certified payroll, so an
 * unknown type is treated as worked rather than silently removed.
 */
export function leaveOf(row: { entry_type?: string | null; hours_worked?: unknown; total_hours?: unknown }): { type: string; label: string; hours: number } | null {
  const t = String(row.entry_type ?? '').trim().toLowerCase();
  if (!(NON_WORKED_ENTRY_TYPES as readonly string[]).includes(t)) return null;
  return { type: t, label: LEAVE_LABEL[t] || t.toUpperCase(), hours: leaveHoursOf(row) ?? 0 };
}

export type LeaveDraft = { type: string; date: string; hours: string; project: string };
export type LeaveField = 'type' | 'project' | 'date' | 'hours';
export type LeaveCheck =
  | { ok: true; type: LeaveType; date: string; hours: number; projectId: string }
  | { ok: false; field: LeaveField; message: string };

/** Validate the Log PTO / Sick form. Every failure names the field and says what to do. */
export function checkLeave(d: LeaveDraft, opts: { hasProjects: boolean }): LeaveCheck {
  const type = String(d.type || '').trim().toLowerCase();
  if (!(LEAVE_TYPES as readonly string[]).includes(type)) {
    return { ok: false, field: 'type', message: 'Pick PTO, Sick, Holiday or Vacation.' };
  }
  const projectId = String(d.project || '').trim();
  if (!projectId) {
    return {
      ok: false,
      field: 'project',
      message: opts.hasProjects
        ? 'Pick the job whose timesheet this leave goes on.'
        : 'Leave is filed on a job’s timesheet, and there are no jobs yet. Add a job first.',
    };
  }
  const date = String(d.date || '').trim();
  const [y, m, day] = date.split('-').map(Number);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(Date.UTC(y, m - 1, day)) : null;
  if (!parsed || parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== day) {
    return { ok: false, field: 'date', message: 'Pick the date of the leave.' };
  }
  const raw = String(d.hours ?? '').trim();
  const hours = raw === '' ? NaN : Number(raw);
  if (!Number.isFinite(hours)) return { ok: false, field: 'hours', message: 'Enter the hours of leave, e.g. 8.' };
  if (hours <= 0) return { ok: false, field: 'hours', message: 'Leave hours must be more than 0.' };
  if (hours > 24) return { ok: false, field: 'hours', message: 'Leave can’t be more than 24 hours in one day.' };
  return { ok: true, type: type as LeaveType, date, hours: Math.round(hours * 100) / 100, projectId };
}

/** The time_entries insert for a checked leave entry. Never writes the generated columns. */
export function leaveInsertRow(args: {
  tenantId: string;
  employeeId: string;
  projectId: string;
  type: LeaveType;
  date: string;
  hours: number;
  timezone: string;
}) {
  return {
    tenant_id: args.tenantId,
    employee_id: args.employeeId,
    project_id: args.projectId,
    work_date: args.date,
    entry_type: args.type,
    hours_worked: args.hours,
    regular_hours: 0,
    overtime_hours: 0,
    doubletime_hours: 0,
    status: 'pending',
    timezone: args.timezone,
  };
}
