import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const today = new Date().toISOString().split('T')[0];

  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ rfis: [], source: 'demo' });
    }

    const db = createServerClient();
    let query = db.from('rfis').select('*').eq('tenant_id', user.tenantId).order('rfi_number', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;

    const rfis = (data || []).map((r: any) => ({
      ...r,
      is_overdue: r.status === 'open' && r.due_date && r.due_date < today,
    }));
    return NextResponse.json({ rfis, source: 'live' });
  } catch {
    return NextResponse.json({ rfis: [], source: 'error' });
  }
}
