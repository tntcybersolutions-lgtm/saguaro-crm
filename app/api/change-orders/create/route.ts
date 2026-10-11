import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { assertProjectInTenant } from '@/lib/assert-project';
import type { Database } from '@/lib/database.types';
import { nextCoNumber } from '@/lib/change-order-number';

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Change Orders', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json();
    const projectId = body.projectId ?? body.project_id;
    const title = body.title;
    if (!projectId || !title) {
      return NextResponse.json({ error: 'projectId and title are required' }, { status: 400 });
    }

    // Accept both camelCase and snake_case for every field the clients send.
    const amount = Number(body.amount ?? body.costImpact ?? body.cost_impact ?? 0) || 0;
    const scheduleImpactDays = body.scheduleImpact ?? body.schedule_impact_days ?? body.scheduleImpactDays ?? body.schedule_impact ?? null;
    const scheduleImpact = scheduleImpactDays != null ? Number(scheduleImpactDays) || 0 : 0;

    const db = g.db;

    /* This project must belong to the caller's tenant. Without the check a

       project id from ANOTHER tenant satisfies the foreign key, and the row

       is written — stamped with the caller's tenant, pointing at a customer's

       job they cannot see. See lib/assert-project. */

    const notOurs = await assertProjectInTenant(db, user.tenantId, projectId as string);

    if (notOurs) return notOurs;
    const coNumber = await nextCoNumber(db, user.tenantId, projectId as string);

    const { data: co, error } = await db.from('change_orders').insert({
      tenant_id: user.tenantId,
      project_id: projectId,
      co_number: coNumber,
      title,
      description: body.description ?? null,
      reason: body.reason ?? null,
      status: 'pending',
      // Lists & detail screens read `amount`; keep `cost_impact` in sync for callers that read it.
      amount,
      cost_impact: amount,
      // Detail screens read `schedule_impact_days` (falling back to `schedule_impact`) — write both.
      schedule_impact_days: scheduleImpactDays != null ? scheduleImpact : null,
      schedule_impact: scheduleImpact,
      submitted_by: user.id,
      // Optional link back to the awarded bid package (SmartCreate sends camelCase).
      related_bid_package_id: body.relatedBidPackageId ?? body.related_bid_package_id ?? null,
    } as unknown as Database['public']['Tables']['change_orders']['Insert']).select().single();

    if (error) throw error;
    return NextResponse.json({ changeOrder: co, success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
