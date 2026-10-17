/**
 * lib/change-order-tiers.ts — who may approve a change order of a given size,
 * and whether the approvals on one are enough. Pure: no database, no imports
 * from the server, so the settings screen and the record page use the same
 * rules the server enforces (lib/change-order-status).
 *
 * A company sets tiers by dollar amount (tenant_settings.co_approval_tiers):
 *
 *   up to $10,000   one approver with Change Orders: Full   (the PM)
 *   up to $50,000   two approvers with Change Orders: Full
 *   above that      one company admin
 *
 * Every approver on a tier must hold the tier's level; a company admin is the
 * top of the ladder and approves any tier below Admin alone. The size of a change is
 * its absolute value: a $60,000 credit moves the contract as far as a $60,000
 * add. A company that never set tiers keeps the rule from before tiers: one
 * approver with Change Orders: Full, any amount.
 *
 * Approvals are rows in approval_decisions (entity_type 'change_order'). One
 * counts only when it was given at the CO's current amount, after the latest
 * rejection or reversal on it — re-pricing a change, or sending it back, asks
 * for the approvals again. The owner's signature is recorded there too
 * (approver_role 'owner'); it never stands in for an internal approver.
 */

export type TierLevel = 'Edit' | 'Full' | 'Admin';
export type CoTier = { upTo: number | null; level: TierLevel; approvers: number };

export const TIER_LEVELS: readonly TierLevel[] = ['Edit', 'Full', 'Admin'];
const RANK: Record<TierLevel, number> = { Edit: 1, Full: 2, Admin: 3 };

/** What each level means, in the words the settings screen and the errors use. */
export const LEVEL_LABEL: Record<TierLevel, string> = {
  Edit: 'Change Orders: Edit',
  Full: 'Change Orders: Full',
  Admin: 'a company admin',
};

/** Not set up: the rule before tiers. */
export const DEFAULT_TIERS: CoTier[] = [{ upTo: null, level: 'Full', approvers: 1 }];

/** The ladder the settings screen offers in one tap. */
export const SUGGESTED_TIERS: CoTier[] = [
  { upTo: 10000, level: 'Full', approvers: 1 },
  { upTo: 50000, level: 'Full', approvers: 2 },
  { upTo: null, level: 'Admin', approvers: 1 },
];

export const MAX_APPROVERS = 5;

const cents = (n: number) => Math.round((Number(n) || 0) * 100);

/**
 * Check and order tiers written by a person. Ascending by limit, the open-ended
 * tier last; exactly one open-ended tier; limits distinct and positive; 1–5
 * approvers. Returns the clean list or the first thing wrong with it.
 */
export function validateTiers(raw: unknown): { ok: true; tiers: CoTier[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'Add at least one approval tier.' };
  if (raw.length > 8) return { ok: false, error: 'Use eight tiers or fewer.' };
  const out: CoTier[] = [];
  for (const t of raw) {
    const r = (t || {}) as Record<string, unknown>;
    const level = r.level as TierLevel;
    if (!TIER_LEVELS.includes(level)) return { ok: false, error: 'Each tier needs who can approve: Edit, Full or Admin.' };
    const approvers = Number(r.approvers);
    if (!Number.isInteger(approvers) || approvers < 1 || approvers > MAX_APPROVERS) {
      return { ok: false, error: `Each tier needs 1 to ${MAX_APPROVERS} approvers.` };
    }
    let upTo: number | null = null;
    if (r.upTo !== null && r.upTo !== undefined && r.upTo !== '') {
      const n = Number(r.upTo);
      if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'A tier limit must be a dollar amount above $0.' };
      upTo = Math.round(n * 100) / 100;
    }
    out.push({ upTo, level, approvers });
  }
  const open = out.filter((t) => t.upTo === null);
  if (open.length !== 1) return { ok: false, error: 'Exactly one tier covers everything above the last limit.' };
  const capped = out.filter((t) => t.upTo !== null).sort((a, b) => (a.upTo as number) - (b.upTo as number));
  for (let i = 1; i < capped.length; i++) {
    if (capped[i].upTo === capped[i - 1].upTo) return { ok: false, error: 'Two tiers have the same limit.' };
  }
  return { ok: true, tiers: [...capped, open[0]] };
}

/** Tiers as stored, made safe to use: anything malformed falls back to the default rule. */
export function normalizeTiers(raw: unknown): CoTier[] {
  if (raw === null || raw === undefined) return DEFAULT_TIERS;
  const v = validateTiers(raw);
  return v.ok ? v.tiers : DEFAULT_TIERS;
}

/** The tier a change of `amount` falls in (by absolute value), and its position. */
export function tierFor(amount: number, tiers: CoTier[]): { tier: CoTier; index: number } {
  const size = Math.abs(cents(amount));
  const list = tiers.length ? tiers : DEFAULT_TIERS;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.upTo === null || size <= cents(t.upTo)) return { tier: t, index: i };
  }
  return { tier: list[list.length - 1], index: list.length - 1 };
}

/** The highest tier level a person's effective permissions reach, or null. */
export function levelOf(perms: Record<string, string | undefined> | null | undefined): TierLevel | null {
  if (!perms) return null;
  if (perms.Admin === 'Full') return 'Admin';
  if (perms['Change Orders'] === 'Full') return 'Full';
  if (perms['Change Orders'] === 'Edit') return 'Edit';
  return null;
}

export function meetsLevel(have: TierLevel | null | undefined, need: TierLevel): boolean {
  return !!have && RANK[have] >= RANK[need];
}

/** The largest amount a person at `level` may approve alone (null = no limit, 0 = none). */
export function soloLimit(level: TierLevel | null, tiers: CoTier[]): number | null {
  let limit: number | null = 0;
  for (const t of tiers) {
    // An admin approves any tier below Admin alone (see approvalState).
    if (level === 'Admin' && t.level !== 'Admin') { limit = t.upTo; if (t.upTo === null) return null; continue; }
    if (!meetsLevel(level, t.level) || t.approvers > 1) break;
    limit = t.upTo;
    if (t.upTo === null) return null;
  }
  return limit;
}

export type Decision = {
  decision: string;
  decided_at: string;
  decided_by?: string | null;
  decided_by_id?: string | null;
  amount?: number | string | null;
  approver_role?: string | null;
  approver_level?: string | null;
  note?: string | null;
};

export type Approver = { id: string | null; name: string; at: string; level: TierLevel | null };

export type ApprovalState = {
  tier: CoTier;
  tierIndex: number;
  /** Internal approvers that count now, oldest first. */
  approvers: Approver[];
  needed: number;
  remaining: number;
  satisfied: boolean;
  /** The owner's sign-off at this amount, if given. */
  owner: { name: string; at: string } | null;
  /** The latest rejection or reversal, if any. */
  lastRejected: { name: string; at: string; note: string | null } | null;
};

/** Where the approvals on one change order stand. Pure. */
export function approvalState(decisions: Decision[], amount: number, tiers: CoTier[]): ApprovalState {
  const { tier, index } = tierFor(amount, tiers);
  const sorted = [...decisions].sort((a, b) => String(a.decided_at).localeCompare(String(b.decided_at)));
  let start = 0;
  let lastRejected: ApprovalState['lastRejected'] = null;
  sorted.forEach((d, i) => {
    if (d.decision === 'rejected') {
      start = i + 1;
      lastRejected = { name: d.decided_by || 'Someone', at: d.decided_at, note: d.note ?? null };
    }
  });
  const live = sorted.slice(start).filter((d) => d.decision === 'approved' && d.amount !== null && d.amount !== undefined && cents(Number(d.amount)) === cents(amount));
  const seen = new Set<string>();
  const approvers: Approver[] = [];
  let owner: ApprovalState['owner'] = null;
  for (const d of live) {
    if (d.approver_role === 'owner') { owner = { name: d.decided_by || 'Owner', at: d.decided_at }; continue; }
    if (d.approver_role !== 'internal' || !d.decided_by_id) continue;
    const level = (TIER_LEVELS as readonly string[]).includes(String(d.approver_level)) ? (d.approver_level as TierLevel) : null;
    if (!meetsLevel(level, tier.level)) continue;
    if (seen.has(d.decided_by_id)) continue;
    seen.add(d.decided_by_id);
    approvers.push({ id: d.decided_by_id, name: d.decided_by || 'Someone', at: d.decided_at, level });
  }
  // A company admin is the top of every ladder: one admin approves any tier
  // below Admin alone. An Admin tier that needs two admins still needs two.
  const adminAlone = tier.level !== 'Admin' && approvers.some((a) => a.level === 'Admin');
  const remaining = adminAlone ? 0 : Math.max(0, tier.approvers - approvers.length);
  return { tier, tierIndex: index, approvers, needed: tier.approvers, remaining, satisfied: remaining === 0, owner, lastRejected };
}

const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

/** "Up to $10,000" / "Above $50,000" — the tier's range in words. */
export function tierRange(tiers: CoTier[], index: number): string {
  const t = tiers[index];
  if (!t) return '';
  if (t.upTo !== null) return index === 0 ? `Up to ${usd(t.upTo)}` : `${usd((tiers[index - 1].upTo as number))} to ${usd(t.upTo)}`;
  const prev = index > 0 ? tiers[index - 1].upTo : null;
  return prev !== null && prev !== undefined ? `Above ${usd(prev)}` : 'Any amount';
}

/** "2 approvers with Change Orders: Full" — who a tier needs, in words. */
export function tierNeeds(t: CoTier): string {
  return t.approvers === 1 ? (t.level === 'Admin' ? 'A company admin' : `One person with ${LEVEL_LABEL[t.level]}`)
    : t.level === 'Admin' ? `${t.approvers} company admins` : `${t.approvers} people with ${LEVEL_LABEL[t.level]}`;
}
