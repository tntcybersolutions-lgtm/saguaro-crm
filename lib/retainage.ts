/**
 * lib/retainage.ts — a pay application's retainage, read one way.
 *
 * Two defects lived here:
 *
 *  1. `retainage_percent || 10`. A pay app billed at 0 % — the release
 *     application at closeout — read back as 10 %, so the detail screen, the
 *     G702 PDF and the owner portal re-held retainage the GC had just
 *     released. Pima App #5 (0 %, $108,500 released) showed $253,965 held and
 *     a payment due $145,465 short of what was certified.
 *  2. "Released to Date" was a hard-coded $0. Nothing read the drop in the
 *     held balance from one application to the next.
 *
 * Retainage held on app N (G702 line 5) is a running balance. It only goes
 * down when retainage is released: the rate is cut (10 % → 5 % at half way)
 * or zeroed on the final application. So the amount released through app N
 * is the sum of every drop in that balance across apps 1..N.
 *
 * Pure. Tested in retainage.sanity.test.ts.
 */
import { resolveRetainagePct } from './calc';

const cents = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const dollars = (c: number): number => c / 100;
const present = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== '';

/**
 * The retainage rate, 0-100. A stored or typed 0 is 0 % — it is never
 * replaced by the default. Only a missing or unreadable value falls back.
 * One rule for every screen: @saguaro/core resolveRetainagePct (nullish-safe).
 */
export function retainageRate(v: unknown, fallback = 10): number {
  if (!present(v)) return fallback;
  return resolveRetainagePct(typeof v === 'number' ? v : String(v).replace(/%/g, ''), fallback);
}

export type RetainageApp = {
  id?: string | null;
  app_number?: unknown;
  total_retainage?: unknown;
  retainage_amount?: unknown;
  total_earned_less_retainage?: unknown;
  less_previous_certificates?: unknown;
  deleted_at?: unknown;
};

/** Retainage held on one application (G702 line 5), in dollars. */
export function retainageHeld(a: RetainageApp | null | undefined): number {
  if (!a) return 0;
  return dollars(present(a.total_retainage) ? cents(a.total_retainage) : cents(a.retainage_amount));
}

export type RetainageLedger = {
  /** Held on the application before this one (0 on App #1). */
  heldBefore: number;
  /** Held on this application. */
  heldNow: number;
  /** Released on this application — the drop from heldBefore, never negative. */
  releasedThisApp: number;
  /** Released on every earlier application. */
  releasedBefore: number;
  /** releasedBefore + releasedThisApp. */
  releasedToDate: number;
  /** G702 line 7 of this app = line 6 of the one before it. */
  previousCertificates: number;
  /** Number of the application before this one, when there is one. */
  priorAppNumber: number | null;
};

/**
 * Walk a job's applications in order up to `currentId` and read the retainage
 * ledger at that point. `currentHeld` overrides the stored balance of the
 * current app (a draft being edited on screen). Apps after it are ignored.
 */
export function retainageLedger(
  apps: RetainageApp[] | null | undefined,
  currentId: string,
  currentHeld?: number,
): RetainageLedger {
  const live = (apps || [])
    .filter((a) => !a.deleted_at)
    .map((a) => ({ a, n: Number(a.app_number) || 0 }))
    .sort((x, y) => x.n - y.n);
  const idx = live.findIndex((x) => String(x.a.id) === String(currentId));
  const upTo = idx >= 0 ? live.slice(0, idx + 1) : live;
  const current = idx >= 0 ? live[idx].a : null;
  const prior = idx > 0 ? live[idx - 1].a : null;

  let releasedC = 0;
  let prevC: number | null = null;
  let releasedBeforeC = 0;
  let heldBeforeC = 0;
  let heldNowC = 0;
  upTo.forEach((x, i) => {
    const isCurrent = i === upTo.length - 1 && current !== null;
    const heldC = isCurrent && typeof currentHeld === 'number' && Number.isFinite(currentHeld)
      ? Math.round(currentHeld * 100)
      : cents(retainageHeld(x.a));
    if (prevC !== null && heldC < prevC) releasedC += prevC - heldC;
    if (isCurrent) {
      heldBeforeC = prevC ?? 0;
      heldNowC = heldC;
    } else {
      releasedBeforeC = releasedC;
    }
    prevC = heldC;
  });
  if (current === null) {
    // The current app is not in the list (list failed to load): report what
    // is known for it alone rather than inventing history.
    heldNowC = typeof currentHeld === 'number' && Number.isFinite(currentHeld) ? Math.round(currentHeld * 100) : 0;
    heldBeforeC = 0;
    releasedBeforeC = 0;
  }
  const releasedThisC = Math.max(0, heldBeforeC - heldNowC);

  const previousCertificates = prior
    ? dollars(cents(prior.total_earned_less_retainage))
    : dollars(cents(current?.less_previous_certificates));

  return {
    heldBefore: dollars(heldBeforeC),
    heldNow: dollars(heldNowC),
    releasedThisApp: dollars(prior ? releasedThisC : 0),
    releasedBefore: dollars(releasedBeforeC),
    releasedToDate: dollars(releasedBeforeC + (prior ? releasedThisC : 0)),
    previousCertificates,
    priorAppNumber: prior ? Number(prior.app_number) || null : null,
  };
}
