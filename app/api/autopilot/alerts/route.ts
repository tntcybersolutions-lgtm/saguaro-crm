import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { DEMO_AUTOPILOT_ALERTS } from '../../../../demo-data';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    const user = await getUser(req);
    if (!user) {
      const alerts = projectId
        ? DEMO_AUTOPILOT_ALERTS.filter(() => true) // return all demo alerts
        : DEMO_AUTOPILOT_ALERTS;
      return NextResponse.json({ alerts, source: 'demo' });
    }

    const db = createServerClient();
    const tenantId = user.id;

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

    const alerts = (data || []).length > 0 ? data : DEMO_AUTOPILOT_ALERTS;
    return NextResponse.json({ alerts, source: (data || []).length > 0 ? 'live' : 'demo' });
  } catch {
    return NextResponse.json({ alerts: DEMO_AUTOPILOT_ALERTS, source: 'demo' });
  }
}
