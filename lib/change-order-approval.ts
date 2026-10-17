/**
 * lib/change-order-approval.ts — the database side of change order approval
 * tiers: the company's tiers, the approvals given on a change order, the
 * approver's level, and writing an approval or a reversal.
 *
 * The rules themselves are pure, in lib/change-order-tiers. The one place they
 * are enforced is lib/change-order-status writeChangeOrder, which every
 * approve path goes through.
 *
 * Server only (reads permissions with the service-role client).
 */
import { getEffectivePermissions } from './permissions';
import { normalizeTiers, levelOf, type CoTier, type Decision, type TierLevel } from './change-order-tiers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** approval_decisions.entity_type for a change order (lib/approvals uses the same key). */
export const CO_ENTITY = 'change_order';

/** The company's approval tiers (the default rule when none are set). */
export async function loadTiers(db: Db, tenantId: string): Promise<CoTier[]> {
  const { data, error } = await db.from('tenant_settings').select('co_approval_tiers')
    .eq('tenant_id', tenantId).maybeSingle();
  if (error) throw error;
  return normalizeTiers((data as { co_approval_tiers?: unknown } | null)?.co_approval_tiers ?? null);
}

/** Every approval decision on one change order, oldest first. */
export async function loadDecisions(db: Db, tenantId: string, coId: string): Promise<Decision[]> {
  const { data, error } = await db.from('approval_decisions')
    .select('decision, decided_at, decided_by, decided_by_id, amount, approver_role, approver_level, note')
    .eq('tenant_id', tenantId).eq('entity_type', CO_ENTITY).eq('entity_id', coId)
    .order('decided_at', { ascending: true });
  if (error) throw error;
  return (data || []) as Decision[];
}

/** The tier level a person holds on this job (lib/permissions, project grants included). */
export async function actorLevel(db: Db, tenantId: string, userId: string, projectId?: string | null): Promise<TierLevel | null> {
  const perms = await getEffectivePermissions(db, userId, tenantId, projectId ?? null);
  return levelOf(perms as unknown as Record<string, string>);
}

/** A person's name as the record shows it. */
export async function actorName(db: Db, userId: string | null | undefined): Promise<string> {
  if (!userId) return 'Someone';
  const { data } = await db.from('profiles').select('full_name, email').eq('id', userId).maybeSingle();
  const p = (data || {}) as { full_name?: string | null; email?: string | null };
  return (p.full_name || '').trim() || (p.email || '').trim() || 'Someone';
}

/* Decisions are read in time order and a rejection voids the approvals before
   it, so two decisions written in the same millisecond (reject, then reopen and
   approve) must still sort the way they happened. */
let lastStamp = 0;
function nextStamp(): string {
  let t = Date.now();
  if (t <= lastStamp) t = lastStamp + 1;
  lastStamp = t;
  return new Date(t).toISOString();
}

/** Write one decision row. Returns the row as it would be read back. */
export async function recordDecision(db: Db, tenantId: string, coId: string, d: {
  decision: 'approved' | 'rejected';
  role: 'internal' | 'owner';
  amount: number;
  byId?: string | null;
  byName: string;
  level?: TierLevel | null;
  note?: string | null;
  step?: number;
}): Promise<Decision> {
  const row = {
    tenant_id: tenantId,
    entity_type: CO_ENTITY,
    entity_id: coId,
    step: d.step ?? 1,
    decision: d.decision,
    decided_by: d.byName,
    decided_by_id: d.byId ?? null,
    amount: d.amount,
    approver_role: d.role,
    approver_level: d.level ?? null,
    note: d.note ?? null,
    decided_at: nextStamp(),
  };
  const { error } = await db.from('approval_decisions').insert(row);
  if (error) throw error;
  return row;
}
