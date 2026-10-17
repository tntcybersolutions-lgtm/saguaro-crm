import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { dropHiddenJobRows } from '@/lib/live-jobs';
import { jobsOffFor } from '@/lib/visible-jobs';
import { receivableOnly, payableOnly } from '@/lib/invoice-direction';

export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Budget', 'View');
  if (!g.ok) return g.res;
  const user = g.user;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('project_id');

  try {
    const db = createServerClient();
    let query = db
      .from('invoices')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });

    if (projectId) query = query.eq('project_id', projectId);
    /* Invoicing is owner billing (Bill To, Collected): receivable rows only.
       Vendor / sub bills filed in this table before Bills existed carry
       direction 'payable' and belong to the job's costs, not to what the
       owner owes. ?direction=payable or =all asks for them explicitly. */
    const direction = searchParams.get('direction');
    if (direction === 'payable') query = payableOnly(query);
    else if (direction !== 'all') query = receivableOnly(query);

    const { data, error } = await query;
    if (error) throw error;

    // Company-wide list: an archived or deleted job's invoices stay out of the
    // register and its totals. One job's own list, or ?include_archived=1 (an
    // explicit archive view), keeps them.
    let rows = data || [];
    if (!projectId && searchParams.get('include_archived') !== '1') {
      rows = dropHiddenJobRows(rows, await jobsOffFor(db, user));
    }

    return NextResponse.json({ invoices: rows });
  } catch (e) {
    return apiError('invoices/list GET', e);
  }
}
