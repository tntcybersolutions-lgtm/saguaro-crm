import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  const today = new Date().toISOString().split('T')[0];

  try {
    const db = createServerClient();

    // Try to find today's log
    const { data: existing } = await db
      .from('daily_logs')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      .eq('log_date', today)
      .single();

    if (existing) {
      return NextResponse.json({ log: existing, created: false });
    }

    // Create a blank draft for today
    const { data: newLog, error } = await db
      .from('daily_logs')
      .insert({
        tenant_id: user.tenantId,
        created_by: user.id,
        project_id: projectId,
        log_date: today,
        status: 'draft',
        manpower_detail: [],
        equipment_on_site: [],
        visitors_detail: [],
        incidents_detail: [],
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ log: newLog, created: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
