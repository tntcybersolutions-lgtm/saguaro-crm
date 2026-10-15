/**
 * GET /api/projects/:projectId/monthly — the job's last 12 months of money:
 * billed, collected, costs and approved changes (lib/job-monthly).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { buildJobMonthly } from '@/lib/job-monthly';
import { requestDay } from '@/lib/time-zone';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const db = createServerClient();
  const g = await requirePermission(req, 'Budget', 'View', { projectId: params.projectId, db });
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const { data: project } = await db.from('projects').select('id').eq('id', params.projectId).eq('tenant_id', user.tenantId).maybeSingle();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const [a, b, c] = await Promise.all([
      db.from('pay_applications').select('id, project_id, status, current_payment_due, payment_amount, submitted_at, application_date, payment_received_at').eq('project_id', params.projectId).eq('tenant_id', user.tenantId).is('deleted_at', null),
      db.from('bills').select('total, amount, status, due_date, created_at').eq('project_id', params.projectId).eq('tenant_id', user.tenantId),
      db.from('change_orders').select('amount, status, approved_at').eq('project_id', params.projectId).eq('tenant_id', user.tenantId).is('deleted_at', null),
    ]);
    for (const r of [a, b, c]) if (r.error) throw r.error;
    const { today } = await requestDay(req.headers, db, user.tenantId, 'projects/monthly');
    return NextResponse.json(buildJobMonthly({
      today,
      apps: (a.data ?? []) as never,
      bills: (b.data ?? []) as never,
      changeOrders: (c.data ?? []) as never,
    }));
  } catch (e) {
    return apiError('projects/projectId/monthly', e, "Couldn't load this job's months.");
  }
}
