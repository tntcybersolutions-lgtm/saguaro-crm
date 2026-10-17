import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  const gate = await requirePermission(req, 'Projects', 'View', { projectId: null, companyWide: true });
  if (!gate.ok) return gate.res;
  const user = gate.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from('resource_requests')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e) {
    return apiError('resource-planning/requests GET', e);
  }
}
