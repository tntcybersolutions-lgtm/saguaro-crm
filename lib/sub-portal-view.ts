/**
 * What the subcontractor portal shows, read from the columns that exist.
 *
 * app/portals/sub/[token]/page.tsx was written against fields the portal
 * tables never had, so most of what a sub saw was blank or "--":
 *
 *   portal_sub_pay_apps          period_from / period_to / amount / retainage / net_amount
 *     (page read period_start, total_requested, retainage_amount, application_number)
 *   portal_sub_pay_app_line_items prev_completed / this_period / total_completed /
 *                                 percent_complete / balance
 *     (page read previous_completed, amount_requested, gc_status, gc_notes)
 *   portal_sub_daily_logs        hours / work_performed / notes (planned, weather and
 *                                 safety are folded into notes by the route)
 *     (page read hours_worked, work_completed, weather, safety_incidents)
 *   portal_sub_rfis              answer / answered_at; no number column
 *     (page read rfi_number, gc_response, priority, reference_drawing)
 *   portal_sub_compliance_docs   file_url / expiry_date
 *     (page read file_name, expires_at — so expiry alerts never fired)
 *   portal_sub_scorecards        created_at / notes; no cleanup_score
 *     (page read rated_at, comments, cleanup_score)
 *   portal_sub_messages          read_at
 *     (page read read — every GC message counted as unread forever)
 *
 * Every helper here is pure so it can be checked without a browser.
 */

type Num = number | string | null | undefined;

function num(v: Num): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "Oct 10, 2026" for a date column or a timestamp, '--' for nothing.
 *
 * A bare 'YYYY-MM-DD' is a calendar day, not an instant. new Date('2026-10-10')
 * is midnight UTC, which every US timezone renders as Oct 9 — so a log dated
 * the 10th used to show the 9th. A day is built in local time instead.
 */
export function fmtDay(d: string | null | undefined): string {
  if (!d) return '--';
  const m = DAY_RE.exec(String(d).trim());
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(String(d));
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Labels in filing order, oldest first: { id → 'RFI-SUB-001' }.
 * portal_sub_rfis has no number column; the RFI route announces
 * RFI-SUB-<count+1> when one is filed, which is this same order.
 */
export function sequenceLabels(
  rows: ReadonlyArray<{ id: string; created_at?: string | null; submitted_at?: string | null }>,
  prefix: string,
  pad = 3,
): Record<string, string> {
  const at = (r: { created_at?: string | null; submitted_at?: string | null }) => {
    const t = new Date(String(r.created_at || r.submitted_at || '')).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  const ordered = [...rows].sort((a, b) => at(a) - at(b) || String(a.id).localeCompare(String(b.id)));
  const out: Record<string, string> = {};
  ordered.forEach((r, i) => { out[r.id] = `${prefix}${String(i + 1).padStart(pad, '0')}`; });
  return out;
}

/* ── Invoices (portal_sub_pay_apps) ─────────────────────────────────────── */

export interface InvoiceLineView {
  id: string;
  description: string;
  scheduled: number;
  previous: number;
  thisPeriod: number;
  completedToDate: number;
  percent: number;
  balance: number;
}

export interface InvoiceView {
  periodFrom: string | null;
  periodTo: string | null;
  requested: number;
  retainage: number;
  net: number;
  lines: InvoiceLineView[];
}

export function invoiceView(pa: {
  period_from?: string | null; period_to?: string | null;
  amount?: Num; retainage?: Num; net_amount?: Num;
  line_items?: ReadonlyArray<Record<string, unknown>> | null;
}): InvoiceView {
  const lines = (pa.line_items || []).map((li, i) => ({
    id: String(li.id ?? i),
    description: String(li.description ?? ''),
    scheduled: num(li.scheduled_value as Num),
    previous: num(li.prev_completed as Num),
    thisPeriod: num(li.this_period as Num),
    completedToDate: num(li.total_completed as Num),
    percent: num(li.percent_complete as Num),
    balance: num(li.balance as Num),
  }));
  return {
    periodFrom: pa.period_from || null,
    periodTo: pa.period_to || null,
    requested: num(pa.amount),
    retainage: num(pa.retainage),
    net: num(pa.net_amount),
    lines,
  };
}

/** percent_complete is stored 0–100 (lib/finance/payapp, 1 decimal). */
export function fmtPercent(p: number): string {
  return `${Math.round((Number.isFinite(p) ? p : 0) * 10) / 10}%`;
}

/* ── Daily logs (portal_sub_daily_logs) ─────────────────────────────────── */

export function dailyLogView(log: {
  crew_count?: Num; hours?: Num; work_performed?: string | null;
  materials_used?: string | null; delays?: string | null; notes?: string | null;
}) {
  return {
    crew: num(log.crew_count),
    hours: num(log.hours),
    workPerformed: (log.work_performed || '').trim(),
    materials: (log.materials_used || '').trim(),
    delays: (log.delays || '').trim(),
    // Planned work, weather and safety notes are folded in here by the route.
    notes: (log.notes || '').trim(),
  };
}

/* ── RFIs (portal_sub_rfis) ──────────────────────────────────────────────── */

/**
 * The question as filed. portal_sub_rfis has no priority / drawing / spec
 * columns, and the route used to drop what the sub typed in those fields. They
 * are kept as plain lines under the question instead, so the sub and the GC
 * both see them. A 'normal' priority says nothing and is left out.
 */
export function rfiQuestionWithRefs(input: {
  question: string; priority?: unknown; reference_drawing?: unknown; reference_spec?: unknown;
}): string {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const priority = s(input.priority).toLowerCase();
  const extras = [
    priority && priority !== 'normal' ? `Priority: ${priority[0].toUpperCase()}${priority.slice(1)}` : '',
    s(input.reference_drawing) ? `Drawing: ${s(input.reference_drawing)}` : '',
    s(input.reference_spec) ? `Spec section: ${s(input.reference_spec)}` : '',
  ].filter(Boolean);
  const q = s(input.question);
  return extras.length ? `${q}\n\n${extras.join('\n')}` : q;
}

/* ── Compliance (portal_sub_compliance_docs) ────────────────────────────── */

/**
 * The file's own name from its storage URL: last path segment, decoded, query
 * dropped, and the "<13-digit upload time>-" prefix the portal adds removed.
 */
export function fileNameFromUrl(url: string | null | undefined): string {
  if (!url) return '';
  const path = String(url).split('?')[0].split('#')[0];
  let last = path.slice(path.lastIndexOf('/') + 1);
  try { last = decodeURIComponent(last); } catch { /* keep the raw segment */ }
  return last.replace(/^\d{13}-/, '');
}

/*
 * The Documents tab files compliance uploads as 'license' and 'safety_cert';
 * the Compliance grid names those slots 'business_license' and
 * 'safety_certification'. Without the aliases a license uploaded from
 * Documents still read "Not uploaded — action required".
 */
const COMPLIANCE_ALIASES: Record<string, readonly string[]> = {
  business_license: ['business_license', 'license'],
  safety_certification: ['safety_certification', 'safety_cert'],
};

/** The newest doc filling a Compliance grid slot (docs arrive newest first). */
export function complianceDocFor<T extends { doc_type?: string | null }>(docs: readonly T[], type: string): T | undefined {
  const names = COMPLIANCE_ALIASES[type] || [type];
  return docs.find((d) => names.includes(String(d.doc_type || '')));
}

export type ExpiryLevel = 'critical' | 'warning' | 'notice';

/** 30 / 60 / 90-day alert tier for a doc's days until expiry, or null for none. */
export function expiryLevel(days: number | null | undefined): ExpiryLevel | null {
  if (days == null || !Number.isFinite(days)) return null;
  if (days <= 30) return 'critical';
  if (days <= 60) return 'warning';
  if (days <= 90) return 'notice';
  return null;
}

/* ── Messages (portal_sub_messages) ─────────────────────────────────────── */

/** A GC message the sub hasn't opened. Read state is read_at (null = unread). */
export function isUnreadForSub(m: { sender_type?: string | null; read_at?: string | null }): boolean {
  return m.sender_type !== 'sub' && !m.read_at;
}

/* ── Scorecard (portal_sub_scorecards + subcontractors.rating) ──────────── */

/** The score categories portal_sub_scorecards actually has. */
export const SCORE_CATEGORIES = [
  { key: 'quality_score', label: 'Quality' },
  { key: 'schedule_score', label: 'Schedule' },
  { key: 'safety_score', label: 'Safety' },
  { key: 'communication_score', label: 'Communication' },
] as const;

/**
 * The rating the sub is shown: the GC's rating on the roster
 * (subcontractors.rating, set on the GC side), else the average of the
 * scorecards, else 0 (nothing to show).
 */
export function overallRating(sc: { overall_rating?: Num; averages?: { overall?: Num } | null } | null | undefined): number {
  const r = num(sc?.overall_rating);
  if (r > 0) return r;
  return num(sc?.averages?.overall);
}
