import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

// GET /api/inspections/list?projectId= (or ?project_id=) -> { inspections: [...] }
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ inspections: [] }, { status: 200 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('project_id') || searchParams.get('projectId');
  try {
    const db = createServerClient();
    let q = db
      .from('inspections')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });
    if (projectId) q = q.eq('project_id', projectId);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ inspections: data || [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('inspections/list', e);
  }
}
