/**
 * activity — the record of what happened, which this product did not keep.
 *
 * Three tables existed for this and all three were empty. A full day of real
 * work — a company signed up, a project created, a plan taken off, fifteen bid
 * packages written, three subs invited, three bids received, a contract
 * awarded — left not one row behind. So the app could show you the CURRENT
 * state of everything and could not answer the question a GC asks every
 * morning: what changed on my jobs since yesterday, and who did it.
 *
 * WHY activity_log AND NOT THE OTHER TWO.
 *   activity_events  referenced nowhere but lib/database.types — a dead table,
 *                    and its entity_id is a uuid, so it could not reference the
 *                    text ids half the product uses.
 *   audit_logs       a compliance trail: changes, previous_values, ip_address,
 *                    user_agent, and its own /api/audit-trail. "Which field did
 *                    this person change, and from what" is a different question
 *                    from "what happened on my job", and answering both from
 *                    one table serves neither. It keeps its job.
 *   activity_log     already has a reader at /api/projects/[id]/activity that
 *                    filters and paginates, carries user_name denormalised so a
 *                    feed renders without joining, and holds a human
 *                    description. It was always the intended one; nothing ever
 *                    wrote to it.
 *
 * LOGGING NEVER BREAKS THE THING IT RECORDS. Every call is best-effort and
 * swallows its own failure: a GC awarding a contract must not see the award
 * fail because a history row could not be written. That is the one place an
 * empty catch is correct, and it is why this is the only file that has one.
 */
import { createServerClient } from '@/lib/supabase-server';
import type { Json } from '@/lib/database.types';

export interface ActivityEntry {
  tenantId: string;
  action: string;
  /** The job it happened on. Null for company-level events. */
  projectId?: string | null;
  userId?: string | null;
  /** Denormalised so the feed needs no join. Falls back to the email. */
  userName?: string | null;
  /** 'project' | 'takeoff' | 'bid_package' | 'bid' | 'document' | … */
  entityType?: string | null;
  entityId?: string | null;
  /** The sentence a person reads. "Awarded Electrical to Mesa Ridge — $7,840". */
  description?: string | null;
  /* Typed as Json rather than Record<string, unknown>: the column is jsonb
     and the generated types will not take `unknown` values, which is correct —
     anything that cannot be serialised has no business in a history row. */
  metadata?: { [key: string]: Json | undefined };
}

/**
 * Display names, resolved once per process.
 *
 * The feed wants "Dale Ruiz", not a uuid and not an email, but a profile
 * lookup on every write would tax every action in the product to serve the
 * history of it. Serverless processes are short-lived, so this map is
 * self-bounding: it saves the repeat lookups inside one request burst and
 * disappears with the instance.
 */
const nameCache = new Map<string, string | null>();

async function resolveName(
  db: ReturnType<typeof createServerClient>,
  userId: string | null | undefined,
  fallback: string | null | undefined,
): Promise<string | null> {
  if (!userId) return fallback ?? null;
  if (nameCache.has(userId)) return nameCache.get(userId) ?? fallback ?? null;
  try {
    const { data } = await db
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .maybeSingle();
    const name =
      (data as { full_name?: string | null; email?: string | null } | null)?.full_name ||
      (data as { email?: string | null } | null)?.email ||
      null;
    nameCache.set(userId, name);
    return name ?? fallback ?? null;
  } catch {
    /* A missing name is not a reason to lose the event. */
    return fallback ?? null;
  }
}

/**
 * Record one thing that happened.
 *
 * Returns nothing and throws nothing. Call it with `void logActivity(...)` when
 * you do not want to wait for it — the row is history, not part of the
 * transaction the user is waiting on.
 */
export async function logActivity(entry: ActivityEntry): Promise<void> {
  if (!entry.tenantId || !entry.action) return;
  try {
    const db = createServerClient();
    const userName = await resolveName(db, entry.userId, entry.userName);

    await db.from('activity_log').insert({
      tenant_id: entry.tenantId,
      project_id: entry.projectId ?? null,
      user_id: entry.userId ?? null,
      user_name: userName,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ? String(entry.entityId) : null,
      description: entry.description ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch {
    /* Deliberate. See the header: history must never take down the action it
       is describing. The row is lost; the award, the invite, the bid still
       happened. */
  }
}

/** Money as a GC writes it: $7,840, never $7840.00 and never 7840. */
export function money(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
