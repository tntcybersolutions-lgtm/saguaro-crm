import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || searchParams.get('project_id');
  const date = searchParams.get('date');

  try {
    const db = createServerClient();
    let query = db
      .from('equipment_logs')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('work_date', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }
    if (date) {
      query = query.eq('work_date', date);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ entries: data || [] });
  } catch (err: unknown) {
    const msg = 'Internal server error';
    console.error('[equipment] error:', msg);
    return NextResponse.json(
      { error: `[equipment] Database error: ${msg}` },
      { status: 500 }
    );
  }
}
