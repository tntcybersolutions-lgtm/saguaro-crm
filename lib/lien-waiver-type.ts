/**
 * Lien waiver types — the two vocabularies the app speaks.
 *
 * The database (lien_waivers_waiver_type_check) takes
 *   conditional_progress · unconditional_progress · conditional_final · unconditional_final
 * while the GC's Lien Waivers screen and the PDF engine say "partial" for a
 * progress payment (conditional_partial …). The generate route wrote the
 * screen's word straight into the table, the CHECK refused every row, the
 * error was never read, and "Generate" reported success with nothing saved.
 *
 * waiverTypes() accepts either word and returns both: `db` for the row, `pdf`
 * for lib/pdf-engine generateLienWaiver.
 */

export type DbWaiverType = 'conditional_progress' | 'unconditional_progress' | 'conditional_final' | 'unconditional_final';
export type PdfWaiverType = 'conditional_partial' | 'unconditional_partial' | 'conditional_final' | 'unconditional_final';

const TO_DB: Record<string, DbWaiverType> = {
  conditional_progress: 'conditional_progress',
  conditional_partial: 'conditional_progress',
  unconditional_progress: 'unconditional_progress',
  unconditional_partial: 'unconditional_progress',
  conditional_final: 'conditional_final',
  unconditional_final: 'unconditional_final',
};

const TO_PDF: Record<DbWaiverType, PdfWaiverType> = {
  conditional_progress: 'conditional_partial',
  unconditional_progress: 'unconditional_partial',
  conditional_final: 'conditional_final',
  unconditional_final: 'unconditional_final',
};

/** Both names for a waiver type, or null when it is not one. */
export function waiverTypes(t: unknown): { db: DbWaiverType; pdf: PdfWaiverType } | null {
  if (typeof t !== 'string') return null;
  const db = TO_DB[t.trim().toLowerCase()];
  return db ? { db, pdf: TO_PDF[db] } : null;
}

/** 'YYYY-MM-DD' that is a real calendar day. */
export function isCalendarDay(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** A dollar amount: a finite number ≥ 0 (a numeric string is accepted). Null when it isn't. */
export function waiverAmount(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}
