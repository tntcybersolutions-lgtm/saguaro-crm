import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { dropHiddenJobRows } from '@/lib/live-jobs';
import { jobsOffFor } from '@/lib/visible-jobs';

/**
 * GET /api/payroll/list?projectId=...
 *
 * Returns the certified-payroll (WH-347) history for a project, tenant-scoped.
 * Shape matches exactly what the Certified Payroll page reads (`d.records`):
 *   { records: [{ id, project_id, week_ending, employee_count, total_gross, status, pdf_url }] }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  try {
    const g = await requirePermission(req, 'Budget', 'View');
    if (!g.ok) return g.res;
    const user = g.user;

    const db = createServerClient();
    let query = db
      .from('certified_payroll')
      .select('id, project_id, week_ending, total_gross, status, pdf_url, entries, payroll_number, created_at')
      .eq('tenant_id', user.tenantId)
      .order('week_ending', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query;
    if (error) throw error;

    // Company-wide rollup: an archived or deleted job's WH-347s stay out of
    // the list and its totals (?include_archived=1 is the explicit archive view).
    let rows = data || [];
    if (!projectId && searchParams.get('include_archived') !== '1') {
      rows = dropHiddenJobRows(rows as Array<{ project_id?: string | null }>, await jobsOffFor(db, user)) as typeof rows;
    }

    const records = rows.map((r) => {
      const entries = (r as { entries?: unknown }).entries;
      return {
        id: r.id,
        project_id: (r as { project_id?: string | null }).project_id ?? null,
        week_ending: r.week_ending,
        employee_count: Array.isArray(entries) ? entries.length : 0,
        total_gross: Number(r.total_gross) || 0,
        status: r.status || 'submitted',
        pdf_url: r.pdf_url || null,
      };
    });

    return NextResponse.json({ records, source: 'live' });
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no payroll records" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('payroll/list', e, 'Could not load payroll records');
  }
}
