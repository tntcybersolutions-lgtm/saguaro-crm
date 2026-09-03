import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[projectId]/selections
 * Finish/fixture selections for one project, scoped to the caller's tenant.
 *
 * Uses the service-role client (from requirePermission): every RLS policy on
 * `selections` targets `authenticated` or `service_role`, so a bare anon client
 * matched no policy and the SELECT returned zero rows with no error — an empty
 * selections list that was indistinguishable from a genuinely empty project.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const g = await requirePermission(req, 'Projects', 'View', { projectId });
  if (!g.ok) return g.res;

  const { db, user } = g;

  const { data, error } = await db
    .from('selections')
    .select('*')
    .eq('project_id', projectId)
    .eq('tenant_id', user.tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[projects/selections] read failed:', error.message);
    return apiError('projects/projectId/selections', error, 'Failed to load selections');
  }

  return NextResponse.json({ selections: data ?? [] });
}
