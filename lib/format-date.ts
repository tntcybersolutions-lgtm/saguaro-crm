/**
 * format-date — one safe way to render a date.
 *
 * THE BUG THIS EXISTS TO KILL.
 *
 *   new Date('2026-09-25')              // → 2026-09-25T00:00:00 UTC
 *   .toLocaleDateString('en-US', …)     // → "Sep 24, 2026" in Arizona
 *
 * A bare `YYYY-MM-DD` is parsed by the ECMAScript spec as UTC midnight. Every
 * timezone west of Greenwich then renders it as the day before. Postgres
 * `date` columns arrive exactly like that, so every due date, start date,
 * completion date and follow-up date in the product read one day early for
 * every user in the Americas.
 *
 * A timestamp that carries its own offset ('2026-09-25T14:30:00+00:00') is
 * unambiguous and must NOT be shifted — so the date-only case is detected
 * rather than applied blindly.
 *
 * app/app/my-work/page.tsx worked this out and fixed it locally. Nothing else
 * got the benefit, because the fix lived inside one component instead of in a
 * module anyone could import.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a value that may be a date-only string, a full timestamp, or a Date.
 * Date-only strings become LOCAL midnight so they render as the day written.
 * Returns null for anything unparseable, never an Invalid Date.
 */
export function parseDateSafe(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  const s = String(value).trim();
  const m = DATE_ONLY.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  /* A timestamp whose date part is all we will show, and which carries no
     offset, has the same hazard — treat the leading date as local. */
  const lead = /^(\d{4})-(\d{2})-(\d{2})T00:00:00(?:\.000)?Z?$/.exec(s);
  if (lead) return new Date(Number(lead[1]), Number(lead[2]) - 1, Number(lead[3]));

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const DEFAULT_OPTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

/** "Sep 25, 2026" — and it is the 25th for everybody. */
export function fmtDate(
  value: unknown,
  opts: Intl.DateTimeFormatOptions = DEFAULT_OPTS,
  fallback = '—',
): string {
  const d = parseDateSafe(value);
  return d ? d.toLocaleDateString('en-US', opts) : fallback;
}

/** "Sep 25, 2026, 2:30 PM" — for values that really do carry a time. */
export function fmtDateTime(value: unknown, fallback = '—'): string {
  const d = parseDateSafe(value);
  if (!d) return fallback;
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

/** Midnight today, local — the line overdue is measured against. */
export function startOfToday(): number {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
}

/** True when the value is a date strictly before today. */
export function isPastDue(value: unknown): boolean {
  const d = parseDateSafe(value);
  return !!d && d.getTime() < startOfToday();
}

/** Whole days from today; negative is in the past. Null when unparseable. */
export function daysFromToday(value: unknown): number | null {
  const d = parseDateSafe(value);
  if (!d) return null;
  const at = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((at - startOfToday()) / 86_400_000);
}
