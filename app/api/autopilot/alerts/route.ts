import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

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

    /* The table stores the sentence in body (summary on older rows) and the
       time in last_detected_at / created_at. Readers ask for message and date,
       so name them here once — the Autopilot page showed a dash for both. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alerts = (data || []).map((a: any) => ({
      ...a,
      message: a.message ?? a.body ?? a.summary ?? null,
      date: a.date ?? a.last_detected_at ?? a.created_at ?? null,
    }));
    return NextResponse.json({ alerts, source: 'live' });
  } catch (err: unknown) {
    return apiError('autopilot/alerts GET', err);
  }
}
