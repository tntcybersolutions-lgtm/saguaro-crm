import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { recordLearning, type LearningKind } from '@/lib/learning';
import { apiError } from '@/lib/api-error';

/**
 * POST /api/learning/event — narrow client-side receipt for accepted
 * prefills and one-click repeats (last-used memory, PO/bid-package
 * duplicates, daily-log carry-forward).
 *
 * The kind whitelist is deliberate: this endpoint can only record the
 * UI-accepted time-saver kinds, so a client can never inflate arbitrary
 * "savings" through it. Everything else records server-side at the point
 * the automation actually runs.
 */
const CLIENT_KINDS: readonly LearningKind[] = [
  'last_used_prefill',
  'po_duplicated',
  'bid_package_duplicated',
  'daily_log_carry_forward',
] as const;

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  try {
    const body = await req.json().catch(() => ({}));
    const kind = body?.kind as LearningKind;
    if (!CLIENT_KINDS.includes(kind)) {
      return NextResponse.json({ error: 'Unsupported kind' }, { status: 400 });
    }
    await recordLearning(g.db, {
      tenantId: g.user.tenantId,
      userId: g.user.id,
      kind,
      projectId: typeof body.projectId === 'string' && body.projectId ? body.projectId : null,
      meta: body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta) ? body.meta : {},
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError('learning/event POST', e);
  }
}
