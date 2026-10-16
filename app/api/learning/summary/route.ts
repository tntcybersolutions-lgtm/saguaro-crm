import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { learningSummary } from '@/lib/learning';
import { apiError } from '@/lib/api-error';

/** GET ?days=30 — the provable "Saguaro saved you X hours and surfaced $Y"
 *  receipt: totals + the recent automation events behind them. */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  try {
    const days = Math.max(1, Math.min(365, Number(req.nextUrl.searchParams.get('days')) || 30));
    const summary = await learningSummary(g.db, g.user.tenantId, days);
    const res = NextResponse.json(summary);
    res.headers.set('Cache-Control', 'private, max-age=60');
    return res;
  } catch (e) {
    return apiError('learning/summary GET', e);
  }
}
