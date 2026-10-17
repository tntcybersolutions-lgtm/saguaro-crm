/**
 * GET /api/sales-journey — which steps of the sales journey this tenant has
 * already taken.
 *
 * Feeds components/SalesJourneyRail, which teaches how a deal becomes a job.
 * Answers one question per step: is there any evidence this has happened.
 * Never returns rows.
 *
 * Cost: every query but one is `select('id', { count: 'exact', head: true })`,
 * so the database counts and sends nothing back. The qualified count reads the
 * stage column and buckets it with the shared lib/lead-stages function, so it
 * agrees with the board and the sales overview by construction. The client caches for five minutes —
 * "has this company ever taken a lead" does not change between two clicks.
 *
 * A query that FAILS omits its field rather than reporting 0, exactly as
 * /api/company-tools does. Zero unticks a step the tenant may have completed;
 * a failed count must never do that.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { liveJobs } from '@/lib/live-jobs';
import { summariseByStage, qualifiedValue } from '@/lib/lead-stages';

export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Sales', 'View');
  if (!g.ok) return g.res;
  const user = g.user;

  try {
    const db = createServerClient();
    const t = user.tenantId;
    const head = { count: 'exact' as const, head: true };

    const [leads, activities, qualified, customers, bidPackages, projects] = await Promise.all([
      db.from('lead_pipeline').select('id', head).eq('tenant_id', t),
      db.from('lead_activities').select('id', head).eq('tenant_id', t),
      /* "Qualified" is counted by the SAME function the board and the sales
         overview bucket with (summariseByStage → qualifiedValue, Path 14), not
         a database `IN`: Postgres IN is case-sensitive, so a 'qualified' or
         'closed won' row written by any older path would be invisible here
         while the board counts it. One column per lead, never sent back. */
      db.from('lead_pipeline').select('stage').eq('tenant_id', t).limit(10000),
      db.from('customer_profiles').select('id', head).eq('tenant_id', t),
      db.from('bid_packages').select('id', head).eq('tenant_id', t),
      liveJobs(db.from('projects').select('id', head).eq('tenant_id', t)),
    ]);

    /** A failed count is omitted, not zeroed — see the header. */
    const n = (r: { count: number | null; error: unknown }) =>
      r.error ? undefined : (r.count || 0);

    return NextResponse.json({
      signals: {
        leads: n(leads),
        activities: n(activities),
        qualified: qualified.error ? undefined
          : qualifiedValue(summariseByStage((qualified.data || []) as Array<{ stage: string | null }>)).count,
        customers: n(customers),
        bidPackages: n(bidPackages),
        projects: n(projects),
      },
    });
  } catch (e) {
    return apiError('sales-journey', e, 'Could not check your sales progress');
  }
}
