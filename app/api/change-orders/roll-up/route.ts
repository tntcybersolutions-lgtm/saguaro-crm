import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { assertProjectInTenant } from '@/lib/assert-project';
import { rollUpToRequest } from '@/lib/change-order-stages';

export const dynamic = 'force-dynamic';

/**
 * POST /api/change-orders/roll-up { projectId, pcoIds: string[], title? }
 * Several potential changes on one job become one change order request to the
 * owner, priced at their sum. The PCOs stay on the record, linked to it.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Change Orders', 'Edit');
  if (!g.ok) return g.res;
  const body = ((await req.json().catch(() => null)) ?? {}) as { projectId?: unknown; pcoIds?: unknown; title?: unknown };
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 });
  if (!Array.isArray(body.pcoIds)) return NextResponse.json({ error: 'pcoIds is required: pick the potential changes to put in the request.' }, { status: 400 });
  try {
    const notOurs = await assertProjectInTenant(g.db, g.user.tenantId, projectId);
    if (notOurs) return notOurs;
    const r = await rollUpToRequest(g.db, g.user.tenantId, g.user.id, {
      projectId, pcoIds: body.pcoIds.map(String), title: typeof body.title === 'string' ? body.title : null,
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ success: true, changeOrder: r.changeOrder }, { status: 201 });
  } catch (e) {
    return apiError('change-orders/roll-up POST', e, "Couldn't build the change order request.");
  }
}
