import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { previewProject, recomputeProject } from '@/lib/commitments-server';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/commitments/rollup?projectId=…   preview — what WOULD change
 * POST /api/commitments/rollup { projectId }  apply — recompute and write
 *
 * The repair hatch for the committed/actual chain.
 *
 * Mutation routes recompute on their own, so under normal use this is never
 * needed. It exists for the two cases that always eventually happen: rows
 * changed outside the app, and a rollup that failed after its triggering save
 * succeeded. Because the rollup is recompute-from-source rather than
 * incremental, running it is safe at any time and running it twice does nothing
 * the first run did not already do.
 *
 * GET is deliberately read-only so a PM can see the correction before taking it.
 */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Budget', 'View');
  if (!g.ok) return g.res;
  const { user, db } = g;

  try {
    const projectId = (req.nextUrl.searchParams.get('projectId') || '').trim();
    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });

    const result = await previewProject(db, user.tenantId, projectId);
    const changed = result.updates.filter((u) => u.changed);

    return NextResponse.json({
      projectId,
      wouldChange: changed.length,
      lines: result.updates,
      changed,
      unmatched: result.unmatched,
      totals: result.totals,
      basis: {
        committed: 'Σ purchase_orders.total (subtotal fallback), excluding cancelled/void/rejected',
        actual: 'Σ bills + approved/paid invoices, excluding draft/void',
        projected: 'max(revised budget, committed, actual)',
      },
    });
  } catch (e) {
    return apiError('commitments_preview', e);
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Budget', 'Edit');
  if (!g.ok) return g.res;
  const { user, db } = g;

  try {
    const body = await req.json().catch(() => ({}));
    const projectId = String(body?.projectId ?? '').trim();
    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });

    const out = await recomputeProject(db, user.tenantId, projectId);

    return NextResponse.json({
      projectId,
      written: out.written,
      lines: out.updates,
      unmatched: out.unmatched,
      totals: out.totals,
    });
  } catch (e) {
    return apiError('commitments_rollup', e);
  }
}
