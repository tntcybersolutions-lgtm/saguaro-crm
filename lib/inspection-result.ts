/**
 * One reading of an inspection's outcome for every screen and report.
 *
 * Results arrive in several spellings: the web form writes 'Passed' / 'Failed' /
 * 'Conditional Pass', the wizard and mobile routes write 'passed' /
 * 'conditional_pass' / 'failed', and older rows say 'fail' or 'approved'.
 *
 * The `inspections.result` column also used to DEFAULT to 'pass', so any row
 * inserted without a result (the auto-built QC checkpoints, for one) was saved
 * as passed the moment it was booked. No code writes a bare 'pass' on purpose,
 * so 'pass' on an inspection that is still scheduled / pending is that default,
 * not a result — it reads as pending here.
 */

export type InspectionOutcome = 'passed' | 'failed' | 'conditional' | 'pending';

const BOOKED = /sched|pend|book/;

/** True for a row that only carries the old column default — booked, never held. */
export function isUnheldDefault(result: unknown, status: unknown): boolean {
  const r = String(result ?? '').trim().toLowerCase();
  const s = String(status ?? '').trim().toLowerCase();
  return r === 'pass' && (!s || BOOKED.test(s));
}

/** The result column alone, canonicalised. Blank and unknown values are pending. */
export function canonInspectionResult(result: unknown): InspectionOutcome {
  const r = String(result ?? '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
  if (!r || r === 'pending') return 'pending';
  if (/^cond/.test(r) || r === 'partial' || r === 'partial pass') return 'conditional';
  if (/fail|reject|deficien|not pass/.test(r)) return 'failed';
  if (/pass|approv/.test(r)) return 'passed';
  return 'pending';
}

/**
 * The outcome of a row, using its status when the result column is blank
 * (some flows record only "Passed" / "Failed" / "Completed" as the status).
 */
export function inspectionOutcome(row: { result?: unknown; status?: unknown }): InspectionOutcome {
  if (isUnheldDefault(row.result, row.status)) return 'pending';
  const fromResult = canonInspectionResult(row.result);
  if (fromResult !== 'pending') return fromResult;
  const s = String(row.status ?? '').toLowerCase();
  if (/fail|reject/.test(s)) return 'failed';
  // "Passed" / "Completed" status only stands in for a result when none was written.
  if (!String(row.result ?? '').trim() && /pass|approv|complete/.test(s)) return 'passed';
  return 'pending';
}
