import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

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

    return NextResponse.json({ alerts: data || [], source: 'live' });
  } catch {
    return NextResponse.json({ alerts: [], source: 'error' });
  }
}
