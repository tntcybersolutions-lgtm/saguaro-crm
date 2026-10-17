import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  // accept both spellings (the hook sent project_id, the route only read projectId → filter was silently skipped)
  const projectId = searchParams.get('projectId') || searchParams.get('project_id');
  const status = searchParams.get('status');
  const limit = Math.min(Number(searchParams.get('limit')) || 500, 1000);
  const today = new Date().toISOString().split('T')[0];

  try {
    // Role check, not just sign-in: RFIs: View, the rule this tool's pages,
    // its writes and (where the table is gated) the database apply.
    const g = await requirePermission(req, 'RFIs', 'View', { projectId: projectId });
    if (!g.ok) return g.res;
    const user = g.user;

    const db = createServerClient();
    // narrow columns + a hard cap — select('*') with no limit pulled the whole tenant history and froze the client on render
    let query = db.from('rfis')
      /* priority and is_urgent are SAVED by the create form — the RFI screen's
         urgent toggle writes priority 'high' and tells the user "priority is
         raised and the responder sees it first". They were never selected
         back, so nothing in any list could show it and that promise was not
         kept anywhere the user could see. Two more narrow columns; the cap
         below is what keeps this query cheap, not the column count. */
      .select('id, rfi_number, subject, question, spec_section, status, priority, is_urgent, submitted_by, due_date, answer, answered_by, ball_in_court, assigned_to_name, project_id, created_at, answered_at, closed_at')
      .eq('tenant_id', user.tenantId)
      .order('rfi_number', { ascending: false })
      .limit(limit);
    if (projectId) query = query.eq('project_id', projectId);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;

    const rfis = (data || []).map((r: any) => ({
      ...r,
      is_overdue: r.status !== 'answered' && r.status !== 'closed' && !!r.due_date && r.due_date < today,
    }));
    return NextResponse.json({ rfis, source: 'live' });
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no RFIs" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('rfis/list', e, 'Could not load RFIs');
  }
}
