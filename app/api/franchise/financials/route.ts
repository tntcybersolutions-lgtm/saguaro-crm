import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { hasFeature } from '@/lib/entitlements-server';

const n = (v: any): number => { if (v == null || v === '') return 0; const x = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,]/g, '')); return isNaN(x) ? 0 : x; };

/**
 * Per-site financial rollup: 10% retainage held, lien-waiver status, and TI-reimbursement
 * readiness (Phase-4 closeout completion). FAIL-CLOSED + tenant-scoped.
 */
export async function GET(req: NextRequest) {
  try {
    const g = await requirePermission(req, 'Budget', 'View');
    if (!g.ok) return g.res;
    const user = g.user;
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ financials: [], gated: true }, { status: 403 });

    const db = createServerClient();
    const [{ data: projs }, todosRes, lienRes] = await Promise.all([
      db.from('projects').select('id,name,city,state,contract_value,cost_to_date,percent_complete').eq('tenant_id', user.tenantId).or('is_archived.is.null,is_archived.eq.false'),
      db.from('project_todos').select('project_id,description,status,completed_at').eq('tenant_id', user.tenantId).eq('linked_module', 'phase_checklist'),
      db.from('lien_waivers').select('id,project_id,status').eq('tenant_id', user.tenantId).then((r: any) => r, () => ({ data: [] })),
    ]);

    // TI readiness = Phase 4 checklist completion per project
    const p4: Record<string, { done: number; total: number }> = {};
    (todosRes.data || []).forEach((t: any) => {
      if (!/Phase 4/i.test(String(t.description || ''))) return;
      const e = (p4[t.project_id] ||= { done: 0, total: 0 });
      e.total++; if (t.completed_at || /complete|done/i.test(String(t.status || ''))) e.done++;
    });
    // Lien waivers per project
    const lien: Record<string, { total: number; collected: number }> = {};
    ((lienRes as any)?.data || []).forEach((w: any) => {
      const e = (lien[w.project_id] ||= { total: 0, collected: 0 });
      e.total++; if (/collect|signed|complete|received|executed/i.test(String(w.status || ''))) e.collected++;
    });

    const financials = (projs || []).map((p: any) => {
      const actual = n(p.cost_to_date) || Math.round(n(p.contract_value) * n(p.percent_complete) / 100);
      const retainageHeld = Math.round(actual * 0.1); // 10% retainage
      const l = lien[p.id] || { total: 0, collected: 0 };
      const ti = p4[p.id] || { done: 0, total: 0 };
      const tiPct = ti.total ? Math.round((ti.done / ti.total) * 100) : 0;
      return {
        project_id: p.id, project_name: p.name, city: p.city, state: p.state,
        actual, retainageHeld,
        lienTotal: l.total, lienCollected: l.collected,
        tiDone: ti.done, tiTotal: ti.total, tiPct,
        tiReady: ti.total > 0 && ti.done === ti.total,
      };
    }).sort((a: any, b: any) => b.retainageHeld - a.retainageHeld);

    return NextResponse.json({ financials });
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no financials" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('franchise/financials', e, 'Could not load financials');
  }
}
