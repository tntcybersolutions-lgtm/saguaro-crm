import { NextRequest, NextResponse } from 'next/server';
import { hasPermission, requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { requestDay } from '@/lib/time-zone';
import { todayCount } from '@/lib/my-work';
import { collectMyWork } from '@/lib/my-work-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/my-work/count → { count } — the number on the My Work tab.
 *
 * The same rows and the same rule as the Today tab (lib/my-work todayCount,
 * snoozes applied), read on the cheap path: only what can land in Today —
 * nothing further out than today, no job-start lookups. 0 when there is
 * nothing. A source that fails is left out of the count and the response says
 * `partial: true`, rather than the badge vanishing.
 *
 * Cache: private (it is one person's), 30 s fresh, then served stale for a
 * minute while it refreshes — the tab bar asks on every screen change.
 */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const { user, db } = g;
  try {
    const { today, zone } = await requestDay(req.headers, db, user.tenantId, 'my-work/count');
    const c = await collectMyWork({
      db, tenantId: user.tenantId, userId: user.id, email: user.email || '', today, zone,
      companyWide: hasPermission(g.perms, 'Admin', 'Full'), scope: 'today',
    });
    const count = todayCount(c.items, c.snoozes, today);
    return NextResponse.json(
      c.failures.length ? { count, partial: true } : { count },
      { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60', Vary: 'x-time-zone, Cookie, Authorization' } },
    );
  } catch (e) {
    return apiError('my-work/count', e, "Couldn't count your work.");
  }
}
