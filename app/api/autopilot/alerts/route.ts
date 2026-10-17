import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { isLiveJob } from '@/lib/live-jobs';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ alerts: [], source: 'unauth' }, { status: 401 });
    }

    const db = createServerClient();
    const tenantId = user.tenantId;

    let query = db
      .from('autopilot_alerts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(50);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;
    if (error) throw error;
    let alerts = (data || []) as Array<Record<string, unknown>>;

    // Company-wide list: an alert on an archived or deleted job is not open
    // work for anyone (lib/live-jobs). A job's own page still shows its own.
    if (!projectId) {
      const ids = [...new Set(alerts.map((a) => a.project_id).filter(Boolean).map(String))];
      if (ids.length) {
        const { data: projs, error: pErr } = await db.from('projects')
          .select('id, is_archived, archived_at, is_deleted, deleted_at')
          .eq('tenant_id', tenantId).in('id', ids);
        if (pErr) throw pErr;
        const live = new Set(((projs || []) as Array<Parameters<typeof isLiveJob>[0] & { id: string }>).filter(isLiveJob).map((p) => p.id));
        alerts = alerts.filter((a) => !a.project_id || live.has(String(a.project_id)));
      }
    }

    return NextResponse.json({ alerts, source: 'live' });
  } catch (err: unknown) {
    return apiError('autopilot/alerts GET', err);
  }
}
