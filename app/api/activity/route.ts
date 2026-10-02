import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * GET /api/activity — everything that happened, newest first, across the
 * whole company.
 *
 * /api/projects/[id]/activity has always served ONE job's history. Nothing
 * served the company's, which is the question a GC opens the app with: what
 * changed since yesterday, on any job. A feed that makes you pick a project
 * before it will tell you anything cannot answer that.
 *
 *   ?limit=   rows, default 40, capped at 200
 *   ?project= narrow to one job
 *   ?entity=  narrow to a kind — project, bid_package, bid, document
 *
 * Project names are resolved in one extra query rather than a join, because a
 * join on activity_log would be an inner join by default and would silently
 * drop every company-level row — the ones with no project_id, which are
 * exactly the events a company feed exists to show.
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '40', 10) || 40, 1), 200);
    const projectId = searchParams.get('project');
    const entity = searchParams.get('entity');

    const db = createServerClient();
    let q = db
      .from('activity_log')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (projectId) q = q.eq('project_id', projectId);
    if (entity) q = q.eq('entity_type', entity);

    const { data, error } = await q;
    if (error) throw error;

    const rows = data || [];

    /* Name the jobs. A feed reading "Awarded Electrical to Mesa Ridge" is only
       useful if you can see WHICH job it was on. */
    const projectIds = [...new Set(rows.map(r => (r as { project_id?: string | null }).project_id).filter(Boolean))] as string[];
    let meta: Record<string, { name: string; status: string | null }> = {};
    if (projectIds.length) {
      const { data: projs } = await db
        .from('projects')
        .select('id, name, status')
        .in('id', projectIds)
        .eq('tenant_id', user.tenantId);
      meta = Object.fromEntries((projs || []).map(p => {
        const row = p as { id: string; name: string; status: string | null };
        return [row.id, { name: row.name, status: row.status ?? null }];
      }));
    }

    return NextResponse.json({
      // project_status is included so a status ticker can color each item by
      // the job's lifecycle (ongoing / under contract / completed / closed).
      activities: rows.map(r => {
        const row = r as Record<string, unknown>;
        const m = row.project_id ? meta[String(row.project_id)] : undefined;
        return { ...row, project_name: m?.name ?? null, project_status: m?.status ?? null };
      }),
      count: rows.length,
    });
  } catch (e) {
    return apiError('activity', e, 'Could not load your activity feed.');
  }
}
