import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const trade = searchParams.get('trade') || '';
  const state = searchParams.get('state') || '';
  const q = searchParams.get('q') || '';
  // The tenant filter used to be conditional — `if (user?.tenantId)`. On a
  // service-role client that bypasses RLS, that meant no session, no filter:
  // an unauthenticated GET returned fifty subcontractors from every tenant in
  // the system, select('*'), so company name, email, phone, address, EIN and
  // license numbers included. A scope that only applies when someone happens to
  // be signed in is not a scope. Require the session, then always filter.
  const gate = await requirePermission(req, 'Projects', 'View', { projectId: null, companyWide: true });
  if (!gate.ok) return gate.res;
  const user = gate.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();
    let query = db
      .from('subcontractors')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('company_name')
      .limit(50);
    if (trade) query = query.ilike('trade', `%${trade}%`);
    if (state) query = query.eq('state', state);
    if (q) query = query.ilike('company_name', `%${q}%`);
    const { data } = await query;
    return NextResponse.json({ subs: data || [] });
  } catch (e) {
    // An empty list next to an error string, returned as 200, reads to the UI
    // as "this tenant has no subs". Say what happened instead.
    return apiError('subs/search', e, 'Could not search subcontractors.');
  }
}
