import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[projectId]/schedule
 * Schedule tasks for one project, scoped to the caller's tenant.
 *
 * Uses the service-role client (from requirePermission): every RLS policy on
 * schedule_tasks targets `authenticated` or `service_role`, so the previous bare
 * anon client matched no policy and the SELECT returned zero rows with no error —
 * an empty schedule that looked like "nothing planned" rather than a failed read.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const g = await requirePermission(req, 'Schedule', 'View', { projectId });
  if (!g.ok) return g.res;

  const { db, user } = g;

  const { data, error } = await db
    .from('schedule_tasks')
    .select('*')
    .eq('project_id', projectId)
    .eq('tenant_id', user.tenantId)
    .order('start_date', { ascending: true });

  if (error) {
    console.error('[projects/schedule] read failed:', error.message);
    return apiError('projects/projectId/schedule', error, 'Failed to load schedule');
  }

  return NextResponse.json({ tasks: data ?? [] });
}
