import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';
import { liveJobIds } from '@/lib/live-jobs';
import { jobsOffFor } from '@/lib/visible-jobs';

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
      .from('daily_logs')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .is('deleted_at', null)
      .order('log_date', { ascending: false }).limit(1000);
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    let logs = (data || []) as Array<{ project_id?: string | null }>;
    // The company list shows logs on live jobs only — not archived, deleted
    // or vanished ones (they read "Unknown project"). lib/live-jobs.
    if (!projectId) {
      // …and never a job closed to this person (lib/visible-jobs).
      const [live, off] = await Promise.all([liveJobIds(db, user.tenantId), jobsOffFor(db, user)]);
      logs = logs.filter((l) => !!l.project_id && live.has(l.project_id) && !off.has(l.project_id));
    }
    return NextResponse.json({ logs, source: 'live' });
  } catch (e) {
    return apiError('daily-logs/list GET', e, undefined, 500, { logs: [], source: 'error' });
  }
}
