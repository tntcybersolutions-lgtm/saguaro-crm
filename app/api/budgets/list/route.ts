import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

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
    // A raw Error's text is the database's words, not ours — log it, show the line we wrote.
    console.error('[budgets/list]', err);
    const message = "Failed to list budgets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
