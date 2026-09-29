/**
 * GET /api/sales-journey — which steps of the sales journey this tenant has
 * already taken.
 *
 * Feeds components/SalesJourneyRail, which teaches how a deal becomes a job.
 * Answers one question per step: is there any evidence this has happened.
 * Never returns rows.
 *
 * Cost: every query is `select('id', { count: 'exact', head: true })`, so the
 * database counts and sends nothing back. The client caches for five minutes —
 * "has this company ever taken a lead" does not change between two clicks.
 *
 * A query that FAILS omits its field rather than reporting 0, exactly as
 * /api/company-tools does. Zero unticks a step the tenant may have completed;
 * a failed count must never do that.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { QUALIFIED_STAGES } from '@/lib/sales-journey';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    const t = user.tenantId;
    const head = { count: 'exact' as const, head: true };

    const [leads, activities, qualified, customers, bidPackages, projects] = await Promise.all([
      db.from('lead_pipeline').select('id', head).eq('tenant_id', t),
      db.from('lead_activities').select('id', head).eq('tenant_id', t),
      db.from('lead_pipeline').select('id', head).eq('tenant_id', t)
        .in('stage', QUALIFIED_STAGES as unknown as string[]),
      db.from('customer_profiles').select('id', head).eq('tenant_id', t),
      db.from('bid_packages').select('id', head).eq('tenant_id', t),
      db.from('projects').select('id', head).eq('tenant_id', t),
    ]);

    /** A failed count is omitted, not zeroed — see the header. */
    const n = (r: { count: number | null; error: unknown }) =>
      r.error ? undefined : (r.count || 0);

    return NextResponse.json({
      signals: {
        leads: n(leads),
        activities: n(activities),
        qualified: n(qualified),
        customers: n(customers),
        bidPackages: n(bidPackages),
        projects: n(projects),
      },
    });
  } catch (e) {
    return apiError('sales-journey', e, 'Could not check your sales progress');
  }
}
