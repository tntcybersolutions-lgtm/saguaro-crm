/**
 * Submittal approval chain — pure logic, no React, no network.
 *
 * A submittal row carries: status, ball_in_court (free text: Contractor /
 * Architect / Engineer / Owner, or a name), subcontractor / submitted_by
 * (who made it), submitted_to (the reviewer), created_at, submitted_at,
 * reviewed_at / returned_at / response_date, due_date (required-by) and
 * revision_number. The change-history trigger (audit_logs) adds the exact
 * moment the ball moved and the status changed.
 *
 * From those — and nothing else — this derives the four-step chain:
 *   Submitter (sub) → GC review → Architect / Engineer review → Back to sub
 * Each step: who, state (done / current / waiting), sent and returned dates,
 * days held and overdue against the required-by date. A date the data does
 * not hold stays null; nothing is invented.
 */

import { initialsOf } from './directory-view';
export { initialsOf };

export type WfParty = 'sub' | 'gc' | 'design';
export type WfKey = 'sub' | 'gc' | 'design' | 'return';
export type WfState = 'done' | 'current' | 'waiting';

export type SubmittalLike = {
  status?: string | null;
  ball_in_court?: string | null;
  subcontractor?: string | null;
  submitted_by?: string | null;
  submitted_to?: string | null;
  trade?: string | null;
  created_at?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  returned_at?: string | null;
  response_date?: string | null;
  due_date?: string | null;
  revision_number?: number | null;
  /** From the list API: when the ball last moved (audit_logs), if recorded. */
  bic_since?: string | null;
};

/** One change from the history trigger: `field` went `from` → `to` at `at`. */
export type WfEvent = { at: string; field: 'ball_in_court' | 'status'; from: unknown; to: unknown };

export type WfStep = {
  key: WfKey;
  /** "Submitter", "GC review", "Architect review", "Back to sub". */
  role: string;
  /** The person / company on that step, when the record names one. */
  who: string | null;
  /** Avatar mark: initials of `who`, else the role's short mark. */
  initials: string;
  state: WfState;
  sentAt: string | null;
  returnedAt: string | null;
  /** Calendar days the step held it (to today when current); null when a date is unknown. */
  daysHeld: number | null;
  /** Current and past the required-by date, or returned after it. */
  overdue: boolean;
  /** Days past required-by (current: to today; done: at return). 0 when not late. */
  daysLate: number;
  /** The reviewer's answer, on the step that gave it. */
  verdict: string | null;
};

export type WfChain = {
  steps: WfStep[];
  current: WfKey | null;
  complete: boolean;
  revision: number;
};

/** Statuses that mean "with the reviewer" — moving into one emails the reviewer (lib/triggers onSubmittalSentForReview). */
export const SUBMITTAL_REVIEW_STATUSES: ReadonlySet<string> = new Set(['submitted', 'under_review']);

const FINAL_OK = new Set(['approved', 'approved_as_noted', 'closed']);
const FINAL_BACK = new Set(['rejected', 'revise_resubmit', 'resubmit']);
const IN_REVIEW = new Set(['submitted', 'under_review']);
const NOT_SENT = new Set(['', 'draft', 'pending']);

const VERDICT: Record<string, string> = {
  approved: 'Approved', approved_as_noted: 'Approved as noted', closed: 'Closed',
  rejected: 'Rejected', revise_resubmit: 'Revise & resubmit', resubmit: 'Revise & resubmit',
};

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

/** Date-only key (YYYY-MM-DD) for any ISO-ish string; null when unparseable. */
export function dayKey(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole calendar days from a to b (b later → positive). null if either is unknown. */
export function daysBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  const x = dayKey(a); const y = dayKey(b);
  if (!x || !y) return null;
  const ms = new Date(`${y}T12:00:00`).getTime() - new Date(`${x}T12:00:00`).getTime();
  return Math.round(ms / 86400000);
}

/**
 * Which party a ball-in-court value means. The screen's options are
 * Contractor / Architect / Owner / Engineer; free text that matches the
 * record's sub or reviewer resolves to them. Unknown → null.
 */
export function partyOf(bic: string | null | undefined, sub?: SubmittalLike): WfParty | null {
  const b = norm(bic);
  if (!b) return null;
  if (/^(sub|subcontractor|subs|submitter|vendor|supplier)$/.test(b)) return 'sub';
  if (/(^gc$|general contractor|^contractor$|^builder$)/.test(b)) return 'gc';
  if (/(architect|engineer|owner|designer|consultant|a\/e|^ae$)/.test(b)) return 'design';
  if (sub) {
    if (b === norm(sub.subcontractor) || b === norm(sub.submitted_by)) return 'sub';
    if (b === norm(sub.submitted_to)) return 'design';
  }
  return null;
}

/** "Architect review" / "Engineer review" / "Owner review" / "A/E review". */
function designRole(sub: SubmittalLike): string {
  const pick = [sub.ball_in_court, sub.submitted_to].map(norm).find((v) => /(architect|engineer|owner)/.test(v)) || '';
  if (pick.includes('engineer')) return 'Engineer review';
  if (pick.includes('owner')) return 'Owner review';
  if (pick.includes('architect')) return 'Architect review';
  return 'A/E review';
}

/** The generic party words are roles, not names — never shown as a "who". */
const GENERIC = /^(contractor|general contractor|gc|architect|engineer|owner|sub|subcontractor|reviewer)$/i;
const named = (v: string | null | undefined) => {
  const s = String(v || '').trim();
  return s && !GENERIC.test(s) ? s : null;
};

/** Latest event where the ball moved to `party`. */
function lastBallTo(events: WfEvent[], party: WfParty, sub: SubmittalLike): string | null {
  let at: string | null = null;
  for (const e of events) {
    if (e.field !== 'ball_in_court') continue;
    if (partyOf(e.to == null ? '' : String(e.to), sub) !== party) continue;
    if (!at || e.at > at) at = e.at;
  }
  return at;
}
/** Latest event where the status became one of `set`. */
function lastStatusIn(events: WfEvent[], set: Set<string>): string | null {
  let at: string | null = null;
  for (const e of events) {
    if (e.field !== 'status' || !set.has(norm(e.to))) continue;
    if (!at || e.at > at) at = e.at;
  }
  return at;
}

/** Audit rows (`changes` / `previous_values`) → workflow events, oldest first. */
export function eventsFromHistory(rows: { created_at: string; changes?: Record<string, unknown> | null; previous_values?: Record<string, unknown> | null }[] | null | undefined): WfEvent[] {
  const out: WfEvent[] = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const ch = r?.changes || null;
    if (!ch || !r.created_at) continue;
    for (const f of ['ball_in_court', 'status'] as const) {
      if (Object.prototype.hasOwnProperty.call(ch, f)) out.push({ at: r.created_at, field: f, from: r.previous_values?.[f] ?? null, to: ch[f] });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * Build the chain. `today` is a YYYY-MM-DD local day (the caller's device
 * day), `opts.gcName` the GC's company name and `opts.architectName` the
 * job's architect of record, when known.
 */
export function buildChain(sub: SubmittalLike, events: WfEvent[] = [], today: string, opts: { gcName?: string | null; architectName?: string | null } = {}): WfChain {
  const status = norm(sub.status);
  const party = partyOf(sub.ball_in_court, sub);
  const due = dayKey(sub.due_date);
  const revision = Number(sub.revision_number) || 0;

  /* Phase from status first; ball-in-court only splits GC vs A/E during review. */
  let current: WfKey | null;
  if (FINAL_OK.has(status)) current = null;
  else if (FINAL_BACK.has(status)) current = 'return';
  else if (IN_REVIEW.has(status)) current = party === 'design' ? 'design' : party === 'sub' ? 'return' : 'gc';
  else if (NOT_SENT.has(status) && !sub.submitted_at) current = 'sub';
  else if (NOT_SENT.has(status)) current = party === 'design' ? 'design' : 'gc';
  else current = party === 'design' ? 'design' : party === 'sub' ? 'sub' : 'gc';

  const order: WfKey[] = ['sub', 'gc', 'design', 'return'];
  const curIdx = current ? order.indexOf(current) : order.length;
  const stateOf = (k: WfKey): WfState => {
    const i = order.indexOf(k);
    return i < curIdx ? 'done' : i === curIdx ? 'current' : 'waiting';
  };

  /* Dates — each from a real column or a recorded handoff. */
  const created = sub.created_at || null;
  const submitted = sub.submitted_at || lastStatusIn(events, IN_REVIEW) || null;
  const toDesign = lastBallTo(events, 'design', sub);
  const designSent = toDesign || (stateOf('design') !== 'waiting' ? submitted : null);
  const answeredAt = sub.reviewed_at || sub.returned_at || sub.response_date
    || lastStatusIn(events, new Set([...FINAL_OK, ...FINAL_BACK])) || null;
  const closedAt = lastStatusIn(events, new Set(['closed'])) || (status === 'closed' ? (sub.returned_at || null) : null);

  const verdict = VERDICT[status] || null;
  const subWho = named(sub.subcontractor) || named(sub.submitted_by) || null;
  const dRole = designRole(sub);
  /* The job's architect of record names the architect step when the row only says "Architect". */
  const designWho = named(sub.submitted_to) || (party === 'design' ? named(sub.ball_in_court) : null) || named(sub.reviewed_by)
    || (dRole === 'Architect review' || dRole === 'A/E review' ? named(opts.architectName) : null);
  const gcWho = named(opts.gcName) || (party === 'gc' ? named(sub.ball_in_court) : null);

  const mk = (key: WfKey, role: string, who: string | null, mark: string, sentAt: string | null, returnedAt: string | null, verdictHere: string | null): WfStep => {
    const state = stateOf(key);
    const sent = state === 'waiting' ? null : sentAt;
    const ret = state === 'done' ? returnedAt : null;
    const end = state === 'current' ? today : ret;
    let daysHeld = state === 'waiting' ? null : daysBetween(sent, end);
    if (daysHeld != null && daysHeld < 0) daysHeld = null;
    /* Late is measured on the review steps and the step holding it now. */
    let daysLate = 0;
    if (due && state === 'current') daysLate = Math.max(0, daysBetween(due, today) ?? 0);
    else if (due && state === 'done' && ret && (key === 'gc' || key === 'design')) daysLate = Math.max(0, daysBetween(due, ret) ?? 0);
    return {
      key, role, who, initials: initialsOf(who) || mark, state,
      sentAt: sent, returnedAt: ret, daysHeld, overdue: daysLate > 0, daysLate,
      verdict: state === 'done' || (state === 'current' && key === 'return') ? verdictHere : null,
    };
  };

  const steps: WfStep[] = [
    mk('sub', 'Submitter', subWho, 'SB', created, submitted, null),
    /* GC → A/E handoff time is only known from history; without it the GC's days stay unknown. */
    mk('gc', 'GC review', gcWho, 'GC', submitted, toDesign, null),
    mk('design', dRole, designWho, 'AE', designSent, answeredAt, verdict),
    mk('return', 'Back to sub', subWho, 'SB', answeredAt, closedAt, verdict),
  ];
  /* A finished submittal's last step is done the moment it was answered. */
  if (current === null) {
    const last = steps[3];
    last.returnedAt = closedAt || answeredAt;
    last.daysHeld = daysBetween(last.sentAt, last.returnedAt);
    if (last.daysHeld != null && last.daysHeld < 0) last.daysHeld = null;
  }
  return { steps, current, complete: current === null, revision };
}

export type BallHolder = {
  label: string;
  party: WfParty | null;
  initials: string;
  since: string | null;
  daysHeld: number | null;
  overdue: boolean;
};

/**
 * The list's "Ball in court" cell: who holds it and for how long. `since` is
 * the recorded handoff (bic_since) when there is one, else the date of the
 * phase the record is in (submitted for review, answered, or created).
 */
export function ballHolder(sub: SubmittalLike, today: string): BallHolder | null {
  const label = String(sub.ball_in_court || '').trim();
  if (!label) return null;
  const status = norm(sub.status);
  const party = partyOf(label, sub);
  let since = sub.bic_since || null;
  if (!since) {
    if (FINAL_OK.has(status) || FINAL_BACK.has(status)) since = sub.reviewed_at || sub.returned_at || sub.response_date || null;
    else if (IN_REVIEW.has(status) || sub.submitted_at) since = sub.submitted_at || null;
    else since = sub.created_at || null;
  }
  const open = !FINAL_OK.has(status);
  const daysHeld = open ? daysBetween(since, today) : null;
  const due = dayKey(sub.due_date);
  const overdue = !!(open && !FINAL_BACK.has(status) && due && due < today);
  const mark = party === 'gc' ? 'GC' : party === 'design' ? 'AE' : party === 'sub' ? 'SB' : '';
  return { label, party, initials: initialsOf(GENERIC.test(label) ? '' : label) || mark || initialsOf(label), since, daysHeld: daysHeld != null && daysHeld >= 0 ? daysHeld : null, overdue };
}

/** With the architect / engineer / owner right now (and still open). */
export function isWithDesign(sub: SubmittalLike): boolean {
  const s = norm(sub.status);
  if (FINAL_OK.has(s) || FINAL_BACK.has(s)) return false;
  return partyOf(sub.ball_in_court, sub) === 'design';
}
