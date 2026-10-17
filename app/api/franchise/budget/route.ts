import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { hasFeature } from '@/lib/entitlements-server';
import { liveJobs } from '@/lib/live-jobs';

const n = (v: any): number => { if (v == null || v === '') return 0; const x = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,]/g, '')); return isNaN(x) ? 0 : x; };
// Executed + the two post-execution posting steps all count as approved for the rollup.
const APPROVED = ['approved', 'schedule_updated', 'budget_updated'];
const PENDING = ['draft', 'pricing', 'pm_review', 'architect_review', 'pending_owner'];

/**
 * Per-site detailed budget rollup (Original / Approved CO / Pending CO / Revised /
 * Committed / Actual / Forecast / Variance / Contingency). FAIL-CLOSED + tenant-scoped.
 * Combines the budgets table (if present) with live change-order sums and project fields.
 */
export async function GET(req: NextRequest) {
  try {
    const g = await requirePermission(req, 'Budget', 'View');
    if (!g.ok) return g.res;
    const user = g.user;
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ budgets: [], gated: true }, { status: 403 });

    const db = createServerClient();
    const [{ data: projs }, { data: cos }, { data: budRows }] = await Promise.all([
      liveJobs(db.from('projects').select('*').eq('tenant_id', user.tenantId)),
      db.from('change_orders').select('project_id,amount,status').eq('tenant_id', user.tenantId).or('deleted_at.is.null'),
      db.from('budgets').select('*').eq('tenant_id', user.tenantId),
    ]);

    const coApproved: Record<string, number> = {}, coPending: Record<string, number> = {};
    (cos || []).forEach((c: any) => {
      const st = String(c.status || '').toLowerCase();
      if (APPROVED.includes(st)) coApproved[c.project_id] = (coApproved[c.project_id] || 0) + n(c.amount);
      else if (PENDING.includes(st)) coPending[c.project_id] = (coPending[c.project_id] || 0) + n(c.amount);
    });
    const budByProj: Record<string, any> = {};
    (budRows || []).forEach((b: any) => { budByProj[b.project_id] = b; });

    const budgets = (projs || []).map((p: any) => {
      const b = budByProj[p.id] || {};
      const original = n(b.original_total) || n(p.contract_value);
      const approvedCO = coApproved[p.id] || 0;
      const pendingCO = coPending[p.id] || 0;
      const revised = n(b.revised_total) || (original + approvedCO);
      const pct = n(p.percent_complete);
      const actual = n(b.actual_total) || n(p.cost_to_date) || Math.round(original * pct / 100);
      const committed = n(b.committed_total) || Math.round(actual * 1.08);
      const forecast = n(b.revised_total) ? n(b.revised_total) : (n(p.projected_cost) || revised);
      const variance = revised - forecast; // + = under budget
      const contingency = n(b.contingency_amount) || Math.round(original * 0.05);
      return {
        project_id: p.id, project_name: p.name, city: p.city, state: p.state,
        original, approvedCO, pendingCO, revised, committed, actual, forecast, variance, contingency,
        pctSpent: revised ? Math.round((actual / revised) * 100) : 0,
      };
    }).sort((a: any, b: any) => a.variance - b.variance);

    return NextResponse.json({ budgets });
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no budgets" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('franchise/budget', e, 'Could not load budgets');
  }
}
