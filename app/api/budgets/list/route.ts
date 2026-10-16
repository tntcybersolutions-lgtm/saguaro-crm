import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServerClient();
    const projectId = req.nextUrl.searchParams.get('projectId');

    // Service-role client bypasses RLS — MUST scope to the caller's tenant explicitly.
    let query = supabase.from('budgets').select('*').eq('tenant_id', user.tenantId).order('created_at', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query.limit(20);

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (err: unknown) {
    return apiError('budgets/list GET', err, "Failed to list budgets");
  }
}
