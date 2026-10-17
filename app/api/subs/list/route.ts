import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const gate = await requirePermission(req, 'Projects', 'View', { projectId: null, companyWide: true });
  if (!gate.ok) return gate.res;
  const user = gate.user;
    /* Was a 200 with an empty list, while every sibling list API answers 401.
       It leaks nothing, but a client cannot tell "your session expired" from
       "this company has no subcontractors", so an expired session silently
       shows an empty screen instead of sending you to sign in. */
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createServerClient();
    // NOTE: `subcontractors` is tenant-scoped only — it has no `project_id` column,
    // and its name column is `company_name` (not `name`). Filtering/ordering on the
    // non-existent columns is what was throwing the 500. Project association lives in
    // `project_subcontractors`; per-tenant listing is the intended behavior here.
    const { data, error } = await db
      .from('subcontractors')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('company_name');
    if (error) throw error;
    return NextResponse.json({ subs: data || [] });
  } catch (e) {
    /* Was a hand-rolled 500 with a hardcoded string and no correlation id, so
       support had nothing to trace. The status was at least honest. */
    return apiError('subs/list', e, 'Could not load subcontractors');
  }
}
