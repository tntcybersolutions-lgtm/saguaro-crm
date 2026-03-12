import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ subs: [] });

    const db = createServerClient();
    let query = db.from('subcontractors').select('*').eq('tenant_id', user.tenantId).order('name');
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ subs: data || [] });
  } catch (err: any) {
    return NextResponse.json({ subs: [], error: err.message }, { status: 500 });
  }
}
