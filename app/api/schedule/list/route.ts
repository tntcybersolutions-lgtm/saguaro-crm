import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  // Role check, not just sign-in: Schedule: View, the rule this tool's pages,
  // its writes and (where the table is gated) the database apply.
  const g = await requirePermission(req, 'Schedule', 'View');
  if (!g.ok) return g.res;
  const user = g.user;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const db = createServerClient();
    let query = db
      .from('schedule_tasks')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('start_date', { ascending: true }).limit(1000);
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ tasks: data || [], source: 'live' });
  } catch (e) {
    /* Was a bare `catch {}`: a failed read came back as an empty schedule
       with nothing in the logs to say why. Now the real error is logged with
       a correlation id (`ref`), and the screen can show it. */
    return apiError('schedule/list', e, "Couldn't load the schedule. Please try again.");
  }
}
