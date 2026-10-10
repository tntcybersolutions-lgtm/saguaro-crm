'use client';
/**
 * A company's time zone, recorded without anyone having to set it.
 *
 * The first time an owner or admin of a company with no tenants.time_zone
 * uses the app, the app shell records the zone their device is in — an Iowa
 * GC's company becomes America/Chicago on their first visit, so crons, emails
 * and anyone whose device doesn't say still work on Central days. Once per
 * browser session, silently (no status box: nobody asked for it), never for a
 * non-admin (the server checks the role again), and never over a zone someone
 * chose in Settings (the PATCH only fills an empty zone).
 */
import { deviceTimeZone } from '@/lib/time-zone';

export const TZ_CHECKED_KEY = 'sag_company_tz_checked';
const QUIET = { 'x-saguaro-status': 'off' } as const;

export type RecordOutcome = 'recorded' | 'already-set' | 'not-admin' | 'skipped' | 'failed';

function checked(): boolean {
  try { return sessionStorage.getItem(TZ_CHECKED_KEY) === '1'; } catch { return false; }
}
function markChecked(): void {
  try { sessionStorage.setItem(TZ_CHECKED_KEY, '1'); } catch { /* private mode — the next load asks again; harmless */ }
}

/**
 * Record this device's zone as the company's when the company has none and
 * the person may change it. Resolves to what happened; never throws.
 */
export async function recordCompanyTimeZoneOnce(fetchImpl: typeof fetch = fetch): Promise<RecordOutcome> {
  if (checked()) return 'skipped';
  const zone = deviceTimeZone();
  if (!zone) return 'skipped';
  try {
    const res = await fetchImpl('/api/settings/time-zone', { headers: { ...QUIET }, cache: 'no-store' });
    if (!res.ok) return 'failed'; // signed out, or the server had a problem: ask again next load
    const cur = (await res.json()) as { timeZone?: string | null; canEdit?: boolean };
    if (cur.timeZone) { markChecked(); return 'already-set'; }
    if (!cur.canEdit) { markChecked(); return 'not-admin'; }
    const put = await fetchImpl('/api/settings/time-zone', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...QUIET },
      body: JSON.stringify({ timeZone: zone, onlyIfUnset: true }),
    });
    if (!put.ok) return 'failed';
    markChecked();
    const saved = (await put.json().catch(() => ({}))) as { changed?: boolean };
    return saved.changed ? 'recorded' : 'already-set';
  } catch {
    return 'failed'; // no signal — the next page load asks again
  }
}
