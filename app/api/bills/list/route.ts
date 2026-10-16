import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Budget', 'View');
  if (!g.ok) return g.res;
  const user = g.user;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('project_id');

  try {
    const db = createServerClient();
    let query = db
      .from('bills')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ bills: data || [] });
  } catch (e) {
    return apiError('bills/list GET', e);
  }
}
