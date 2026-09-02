/**
 * The learning layer — Saguaro's provable intelligence.
 *
 * Two jobs:
 *  1. RECORD every automation performed on the user's behalf (learning_events)
 *     with a conservative seconds-saved estimate and any dollars surfaced —
 *     the receipts behind "Saguaro saved you X hours and $Y this month."
 *  2. LEARN habits from real usage (recency/frequency over the tenant's own
 *     rows) so defaults adapt to how THIS GC works.
 *
 * Recording is fire-and-forget: it must never slow or fail the work itself.
 */

import { tryWrite } from '@/lib/db-write';

type Db = any;

export type LearningKind =
  | 'sov_rollforward'      // prior SOV cloned into a new pay app
  | 'auto_build'           // first-award project auto-build
  | 'weather_autofill'     // daily-log weather stamped from NWS
  | 'sub_suggested'        // usage-ranked sub suggestion served/accepted
  | 'context_prefill'      // create form seeded from project-context
  | 'ai_extract'           // voice/AI extraction filled a form
  | 'catalog_best_price'   // best-price PO issued from the catalog
  | 'suggestion_accepted'  // suggestion-feed deep link followed (engine found it first)
  | 'suggestion_dismissed' // suggestion dismissed — suppressed on recompute for 30 days
  | 'last_used_prefill'    // last-used field memory accepted in a create flow
  | 'po_duplicated'        // one-click PO repeat (copied minus number/date/status)
  | 'bid_package_duplicated' // one-click bid-package repeat (copied minus dates/status)
  | 'daily_log_carry_forward'; // "same as yesterday" carried the prior log's structure

/** Conservative manual-effort estimates (seconds) per automation. */
export const SAVED_SECONDS: Record<LearningKind, number> = {
  sov_rollforward: 600,    // retyping a 20-line SOV
  auto_build: 3600,        // schedule + budget + packages + safety + QC + contacts by hand
  weather_autofill: 60,
  sub_suggested: 120,      // looking up who to invite
  context_prefill: 45,
  ai_extract: 240,
  catalog_best_price: 300, // calling vendors for pricing
  suggestion_accepted: 120, // combing the module to spot the same issue yourself
  suggestion_dismissed: 0,  // no time saved — recorded so the feed stops re-surfacing it
  last_used_prefill: 30,    // retyping the same vendor / cost code / super again
  po_duplicated: 420,       // rebuilding a PO's lines, codes, and vendor by hand
  bid_package_duplicated: 600, // retyping scope, instructions, and line items
  daily_log_carry_forward: 240, // reconstructing yesterday's manpower/structure
};

export async function recordLearning(
  db: Db,
  args: {
    tenantId: string;
    kind: LearningKind;
    projectId?: string | null;
    userId?: string | null;
    secondsSaved?: number;
    dollarsSurfaced?: number;
    meta?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await tryWrite(db.from('learning_events').insert({
      tenant_id: args.tenantId,
      user_id: args.userId ?? null,
      project_id: args.projectId ?? null,
      kind: args.kind,
      seconds_saved: args.secondsSaved ?? SAVED_SECONDS[args.kind] ?? 0,
      dollars_surfaced: args.dollarsSurfaced ?? 0,
      meta: args.meta ?? {},
    } as never), 'learning_events insert');
  } catch {
    // Never let the receipt break the work.
  }
}

/** The dashboard receipt: totals + recent events for "prove it". */
export async function learningSummary(db: Db, tenantId: string, sinceDays = 30) {
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
  const { data } = await db
    .from('learning_events')
    .select('kind, seconds_saved, dollars_surfaced, created_at, meta, project_id')
    .eq('tenant_id', tenantId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);
  const rows = (data ?? []) as any[];
  const totalSeconds = rows.reduce((s, r) => s + (Number(r.seconds_saved) || 0), 0);
  const totalDollars = rows.reduce((s, r) => s + (Number(r.dollars_surfaced) || 0), 0);
  const byKind: Record<string, { count: number; seconds: number }> = {};
  for (const r of rows) {
    const k = byKind[r.kind] || (byKind[r.kind] = { count: 0, seconds: 0 });
    k.count += 1;
    k.seconds += Number(r.seconds_saved) || 0;
  }
  return {
    sinceDays,
    events: rows.length,
    hoursSaved: Math.round((totalSeconds / 3600) * 10) / 10,
    dollarsSurfaced: Math.round(totalDollars),
    byKind,
    recent: rows.slice(0, 12),
  };
}
