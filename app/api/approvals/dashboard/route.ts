import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { ENTITY_TYPES, ENTITY_META, pickAmount, type EntityType } from '@/lib/approvals';

export const dynamic = 'force-dynamic';

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * GET /api/approvals/dashboard
 * Per-module KPIs computed from real rows: pending / approved / rejected
 * counts and the average turnaround in days (created_at → approved_at or
 * rejected_at), tenant-scoped.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ stats: [], source: 'unauth' }, { status: 401 });

    const db = createServerClient();

    const stats = await Promise.all(ENTITY_TYPES.map(async (et: EntityType) => {
      const meta = ENTITY_META[et];
      const base = { module: meta.label, entityType: et, pending: 0, approved: 0, rejected: 0, totalAmount: 0, avgDays: 0 };
      try {
        const { data, error } = await db
          .from(meta.table)
          .select(meta.selectCols.join(','))
          .eq('tenant_id', user.tenantId);
        if (error) throw error;
        const rows = (data || []) as unknown as Array<Record<string, unknown>>;
        let turnaroundSum = 0;
        let turnaroundCount = 0;
        for (const row of rows) {
          const status = String(row.status ?? '');
          if (meta.awaiting.includes(status)) base.pending += 1;
          else if (meta.approved.includes(status)) base.approved += 1;
          else if (meta.rejected.includes(status)) base.rejected += 1;
          else continue;

          if (!meta.awaiting.includes(status)) base.totalAmount += pickAmount(meta, row);

          const created = row.created_at ? new Date(row.created_at as string).getTime() : NaN;
          const decidedRaw = (row.approved_at as string | null)
            || (meta.hasRejectedAt ? (row.rejected_at as string | null) : null);
          const decided = decidedRaw ? new Date(decidedRaw).getTime() : NaN;
          if (!Number.isNaN(created) && !Number.isNaN(decided) && decided >= created) {
            turnaroundSum += (decided - created) / DAY_MS;
            turnaroundCount += 1;
          }
        }
        base.avgDays = turnaroundCount > 0 ? Number((turnaroundSum / turnaroundCount).toFixed(1)) : 0;
        return base;
      } catch {
        return base;
      }
    }));

    return NextResponse.json({ stats, source: 'live' });
  } catch (e) {
    // Was a 2xx with an empty body: the screen showed "no statistics" with
    // total confidence while the query was actually failing. A soft fail on
    // a read is indistinguishable from real emptiness, which is the whole
    // problem. Real status, real log, correlation id.
    return apiError('approvals/dashboard', e, 'Could not load approval statistics');
  }
}
