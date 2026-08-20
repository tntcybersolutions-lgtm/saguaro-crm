import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ payrollPeriods: [], source: 'unauth' }, { status: 401 });

    const db = createServerClient();
    let query = db.from('payroll_periods').select('*').eq('tenant_id', user.tenantId).order('period_start', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ payrollPeriods: data || [], source: 'live' });
  } catch (e: unknown) { return NextResponse.json({ payrollPeriods: [], source: 'error' }); }
}
