import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ costCodes: [] }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('project_id') || searchParams.get('projectId');
  try {
    const db = createServerClient();
    let query = db
      .from('cost_codes')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('code', { ascending: true });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ costCodes: data || [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, {status: 500});
  }
}
