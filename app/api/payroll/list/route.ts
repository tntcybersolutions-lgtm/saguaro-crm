import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/payroll/list?projectId=...
 *
 * Returns the certified-payroll (WH-347) history for a project, tenant-scoped.
 * Shape matches exactly what the Certified Payroll page reads (`d.records`):
 *   { records: [{ id, week_ending, employee_count, total_gross, status, pdf_url }] }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ records: [], source: 'unauth' }, { status: 401 });

    const db = createServerClient();
    let query = db
      .from('certified_payroll')
      .select('id, week_ending, total_gross, status, pdf_url, entries, payroll_number, created_at')
      .eq('tenant_id', user.tenantId)
      .order('week_ending', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query;
    if (error) throw error;

    const records = (data || []).map((r) => {
      const entries = (r as { entries?: unknown }).entries;
      return {
        id: r.id,
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
