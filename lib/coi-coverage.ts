/**
 * Is this sub insured today? One answer, read the same way by the compliance
 * scorecard (app/api/compliance) and the award gate (bid-packages/[id]/award).
 *
 * WHY THIS EXISTS. The two readers each got the certificate wrong a different way:
 *
 *  - An ACORD 25 is ONE insurance_certificates row carrying every coverage:
 *    gl_expiry, wc_expiry, auto_expiry, umbrella_expiry. Its policy_type says
 *    "General Liability" because that is the headline line. The scorecard only
 *    read policy_type + expiry_date, so every sub whose COI came in as an ACORD
 *    showed "Workers Comp — Missing" and was told to go get a WC cert they had
 *    already sent. Measured on production 16 Oct 2026: all four active subs.
 *
 *  - The award gate skipped insurance entirely when a sub had NO certificate
 *    rows, and counted a certificate with no expiry date as good. The
 *    certificates compliance-autofile writes are REQUESTS (status 'pending',
 *    no dates) — so asking a sub for a COI was enough to clear the gate, and
 *    never asking was enough too.
 *
 * Rule here: a coverage is current only when it has a real expiry day and that
 * day is today or later (a COI is good through the end of its expiry day —
 * lib/calendar-day). A dated row the carrier or the GC has killed (expired,
 * rejected, void, cancelled) counts for nothing. A request with no dates is a
 * request, not insurance.
 *
 * Leaf module: no server imports, safe anywhere.
 */
import { daysUntilDay } from './calendar-day';

export type CoiCertRow = {
  policy_type?: string | null;
  expiry_date?: string | null;
  gl_expiry?: string | null;
  wc_expiry?: string | null;
  auto_expiry?: string | null;
  umbrella_expiry?: string | null;
  status?: string | null;
};

/** The columns a caller must select for coiStatus() to see every coverage. */
export const COI_CERT_COLUMNS = 'policy_type, expiry_date, gl_expiry, wc_expiry, auto_expiry, umbrella_expiry, status';

const DEAD = new Set(['expired', 'rejected', 'void', 'voided', 'revoked', 'cancelled', 'canceled', 'deleted']);
const GL_RE = /general|commercial liab|(^|[^a-z])c?gl([^a-z]|$)/i;
const WC_RE = /workers|work comp|(^|[^a-z])wc([^a-z]|$)/i;

export type CoiStatus = {
  /** A current General Liability coverage (the cert, else the directory's COI date). */
  hasGL: boolean;
  /** A current Workers Comp coverage. */
  hasWC: boolean;
  /** Certificates with at least one coverage still good today. */
  activeCerts: number;
  /** Active certificates whose soonest current coverage ends within 30 days. */
  expiringCerts: number;
  /** Soonest current expiry across everything counted (YYYY-MM-DD), for display. */
  soonestExpiry: string | null;
};

function current(day: string | null | undefined, today: string): number | null {
  if (!day) return null;
  const n = daysUntilDay(day, today);
  return n !== null && n >= 0 ? n : null;
}

/**
 * Coverage for one sub on `today` (the company's or the device's day).
 * `directoryExpiry` is subcontractors.insurance_expiry — the COI date a GC
 * types on the directory record. It stands in for General Liability when no
 * certificate row says otherwise, the same way the Subs & Vendors list reads it.
 */
export function coiStatus(certs: CoiCertRow[] | null | undefined, today: string, directoryExpiry?: string | null): CoiStatus {
  let hasGL = false;
  let hasWC = false;
  let activeCerts = 0;
  let expiringCerts = 0;
  let soonest: string | null = null;
  const note = (day: string) => { if (!soonest || day < soonest) soonest = day; };

  for (const c of certs || []) {
    if (DEAD.has(String(c.status || '').trim().toLowerCase())) continue;
    const pt = String(c.policy_type || '');
    const gl = c.gl_expiry || (GL_RE.test(pt) ? c.expiry_date : null) || null;
    const wc = c.wc_expiry || (WC_RE.test(pt) ? c.expiry_date : null) || null;
    /* Anything else on the row (auto, umbrella, or a policy_type neither
       pattern names) still makes the certificate a live document. */
    const others = [c.auto_expiry, c.umbrella_expiry, (!GL_RE.test(pt) && !WC_RE.test(pt)) ? c.expiry_date : null];

    const daysLeft: number[] = [];
    const g = current(gl, today); if (g !== null) { hasGL = true; daysLeft.push(g); note(String(gl).slice(0, 10)); }
    const w = current(wc, today); if (w !== null) { hasWC = true; daysLeft.push(w); note(String(wc).slice(0, 10)); }
    for (const o of others) { const n = current(o, today); if (n !== null) { daysLeft.push(n); note(String(o).slice(0, 10)); } }

    if (daysLeft.length > 0) {
      activeCerts++;
      if (Math.min(...daysLeft) <= 30) expiringCerts++;
    }
  }

  if (!hasGL) {
    const d = current(directoryExpiry, today);
    if (d !== null) { hasGL = true; note(String(directoryExpiry).slice(0, 10)); }
  }

  return { hasGL, hasWC, activeCerts, expiringCerts, soonestExpiry: soonest };
}
