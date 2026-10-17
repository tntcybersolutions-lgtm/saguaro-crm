import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const trade = searchParams.get('trade');

  try {
    const gate = await requirePermission(req, 'Projects', 'View', { projectId: null, companyWide: true });
  if (!gate.ok) return gate.res;
  const user = gate.user;
    if (!user) return NextResponse.json({ workers: [], source: 'unauth' }, { status: 401 });

    const db = createServerClient();

    // A worker belongs to the tenant, not to a project — the same crew moves
    // between jobs. crew_assignments is what puts a worker on a project on a
    // date. Filtering workers.project_id named a column that does not exist, so
    // asking for one project's crew errored and the planner showed nobody.
    let ids: string[] | null = null;
    if (projectId) {
      const { data: assigned, error: aErr } = await db
        .from('crew_assignments')
        .select('worker_id')
        .eq('tenant_id', user.tenantId)
        .eq('project_id', projectId);
      if (aErr) throw aErr;
      ids = [...new Set(((assigned || []) as any[]).map((a) => a.worker_id).filter(Boolean))];
      // Nobody assigned means nobody on the crew — not "everyone in the tenant".
      if (ids.length === 0) return NextResponse.json({ workers: [], source: 'live' });
    }

    let query = db.from('workers').select('*').eq('tenant_id', user.tenantId).order('name', { ascending: true });
    if (ids) query = query.in('id', ids);
    if (trade) query = query.eq('trade', trade);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ workers: data || [], source: 'live' });
  } catch (e) {
    // The comment that used to sit here said "the planner reads `source` to
    // tell an empty crew from a failed load". It does not. app/app/resource-
    // planning/page.tsx contains no reference to `source` at all, and does
    // not call this endpoint — it fetches /api/projects/all/resource-planning.
    // So the empty array WAS a silent success, and the justification for it
    // was a claim about code that does not exist.
    return apiError('resource-planning/workers', e, 'Could not load workers');
  }
}
