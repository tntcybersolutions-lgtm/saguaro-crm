/**
 * Canonical win/loss capture funnel. Every entry point (leads kanban, bids history,
 * proposal accept/decline, mobile "Mark Won/Lost") POSTs here so there is exactly ONE
 * write path and learning always fires.
 *
 * Body:
 *   {
 *     source: 'lead'|'proposal'|'bid'|'package'|'manual', sourceId?: string,
 *     outcome: 'won'|'lost',
 *     ourAmount?: number, winningAmount?: number,           // dollars (header)
 *     reason?: string, awardedTo?: string,
 *     projectName?: string, projectType?: string, trades?: string[],
 *     lines?: [{ csiDivision, trade?, ourCostCents?, ourSellCents?, winningSellCents? }]
 *   }
 *
 * The write itself lives in lib/bid-outcome (recordBidOutcome) so a client
 * signing a proposal online records its win through the same path.
 *
 * Service-role client bypasses RLS → every read/write is explicitly tenant-scoped.
 */
import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { recordBidOutcome, type OutcomeBody } from '@/lib/bid-outcome';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServerClient() as any;
  const tenantId = user.tenantId;

  let body: OutcomeBody;
  try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }); }

  try {
    const r = await recordBidOutcome(supabase, tenantId, body);
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    return Response.json({ success: true, bidHistoryId: r.bidHistoryId, outcome: r.outcome, linesRecorded: r.linesRecorded, learned: r.learned });
  } catch (e) {
    console.error('[bids/outcome]', e);
    return Response.json({ error: 'Could not record the bid outcome. Please try again.' }, { status: 500 });
  }
}
