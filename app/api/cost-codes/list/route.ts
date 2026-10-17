import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  const gate = await requirePermission(req, 'Projects', 'View', { projectId: null, companyWide: true });
  if (!gate.ok) return gate.res;
  const user = gate.user;
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
  } catch (e) {
    return apiError('cost-codes/list GET', e, undefined, 500, { costCodes: [] });
  }
}
