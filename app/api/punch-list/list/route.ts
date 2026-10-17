import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';
import { jobsOffFor, dropRowsOnJobs } from '@/lib/visible-jobs';

export async function GET(req: NextRequest) {
  // Role check, not just sign-in: Projects: View, the rule this tool's pages,
  // its writes and (where the table is gated) the database apply.
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  const user = g.user;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const db = createServerClient();
    let query = db
      .from('punch_list')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false }).limit(1000);
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    // Company-wide: never an item on a job closed to this person or off the books.
    const items = projectId ? (data || []) : dropRowsOnJobs((data || []) as Array<{ project_id: string | null }>, await jobsOffFor(db, user));
    return NextResponse.json({ items, source: 'live' });
  } catch (e) {
    return apiError('punch-list/list GET', e, undefined, 500, { items: [], source: 'error' });
  }
}
