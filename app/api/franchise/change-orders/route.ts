import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { hasFeature } from '@/lib/entitlements-server';

import { apiError } from '@/lib/api-error';
// CO workflow (full 8-step, per SCS spec): Issue → GC Pricing → PM Review →
// Architect Review → Owner Approval → Executed → Schedule Updated → Budget Updated.
export const CO_FLOW = ['draft', 'pricing', 'pm_review', 'architect_review', 'pending_owner', 'approved', 'schedule_updated', 'budget_updated'];
// Statuses that count as approved for budget purposes (executed + the two posting steps).
export const CO_APPROVED_STATES = ['approved', 'schedule_updated', 'budget_updated'];
const TERMINAL = ['budget_updated', 'rejected'];

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ changeOrders: [] }, { status: 401 });
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ changeOrders: [], gated: true }, { status: 403 });

    const db = createServerClient();
    const { data: rows, error } = await db.from('change_orders').select('*')
      .eq('tenant_id', user.tenantId).or('deleted_at.is.null').order('created_at', { ascending: false });
    if (error) throw error;
    const projIds = Array.from(new Set((rows || []).map((r: any) => r.project_id).filter(Boolean)));
    let pmap: Record<string, any> = {};
    if (projIds.length) {
      const { data: projs } = await db.from('projects').select('id,name,city,state').eq('tenant_id', user.tenantId).in('id', projIds);
      pmap = Object.fromEntries((projs || []).map((p: any) => [p.id, p]));
    }
    const changeOrders = (rows || []).map((r: any) => ({ ...r, project_name: pmap[r.project_id]?.name ?? null }));
    return NextResponse.json({ changeOrders });
  } catch {
    return NextResponse.json({ changeOrders: [], source: 'error' });
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    if (!body?.project_id || !body?.title) return NextResponse.json({ error: 'project_id and title are required' }, { status: 400 });

    const db = createServerClient();
    const { data: proj } = await db.from('projects').select('id').eq('tenant_id', user.tenantId).eq('id', body.project_id).maybeSingle();
    if (!proj) return NextResponse.json({ error: 'invalid project' }, { status: 400 });

    // next co_number for this project
    const { data: last } = await db.from('change_orders').select('co_number').eq('tenant_id', user.tenantId).eq('project_id', body.project_id).order('co_number', { ascending: false }).limit(1).maybeSingle();
    const co_number = ((last as any)?.co_number || 0) + 1;

    const row: Record<string, any> = {
      tenant_id: user.tenantId, project_id: body.project_id, co_number,
      title: String(body.title).slice(0, 300),
      description: body.description ? String(body.description).slice(0, 4000) : null,
      scope_of_change: body.description ? String(body.description).slice(0, 4000) : null,
      amount: body.amount != null && body.amount !== '' ? Number(body.amount) : null,
      reason: body.reason ? String(body.reason).slice(0, 200) : null,
      schedule_impact_days: body.schedule_impact_days != null && body.schedule_impact_days !== '' ? parseInt(body.schedule_impact_days, 10) : null,
      status: 'draft',
      initiated_by: body.initiated_by ? String(body.initiated_by).slice(0, 120) : null,
    };
    const { data, error } = await db.from('change_orders').insert(row as any).select('*').single();
    if (error) throw error;
    return NextResponse.json({ changeOrder: data });
  } catch (e: any) {
    return apiError('franchise/change-orders', e, "create failed", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    if (!body?.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const db = createServerClient();
    const { data: cur } = await db.from('change_orders').select('status,schedule_impact_days,project_id').eq('tenant_id', user.tenantId).eq('id', body.id).maybeSingle();
    if (!cur) return NextResponse.json({ error: 'not found' }, { status: 400 });

    const patch: Record<string, any> = {};
    if (body.action === 'reject') {
      patch.status = 'rejected'; patch.rejected_at = new Date().toISOString();
      patch.rejection_reason = body.reason ? String(body.reason).slice(0, 500) : null;
    } else if (body.action === 'advance') {
      const idx = CO_FLOW.indexOf(String((cur as any).status || 'draft'));
      if (TERMINAL.includes(String((cur as any).status))) return NextResponse.json({ error: 'already final' }, { status: 400 });
      const next = CO_FLOW[Math.min(idx + 1, CO_FLOW.length - 1)];
      patch.status = next;
      if (next === 'approved') { patch.approved_at = new Date().toISOString(); patch.approved_by = user.email || 'operator'; }
      // Step 7 — Schedule Updated: post this CO's schedule impact onto the project's
      // revised completion date so the executed CO actually moves the schedule.
      if (next === 'schedule_updated') {
        const impact = Number((cur as any).schedule_impact_days);
        const pid = (cur as any).project_id;
        if (Number.isFinite(impact) && impact !== 0 && pid) {
          const { data: pr } = await db.from('projects').select('revised_completion_date,target_finish_date,end_date,estimated_completion').eq('tenant_id', user.tenantId).eq('id', pid).maybeSingle();
          const base = (pr as any)?.revised_completion_date || (pr as any)?.target_finish_date || (pr as any)?.end_date || (pr as any)?.estimated_completion;
          const tb = Date.parse(String(base || ''));
          if (!isNaN(tb)) {
            const nd = new Date(tb + impact * 86400000).toISOString().slice(0, 10);
            await db.from('projects').update({ revised_completion_date: nd }).eq('tenant_id', user.tenantId).eq('id', pid);
          }
        }
      }
      // Step 8 — Budget Updated: the per-site budget rollup already folds approved COs
      // (CO_APPROVED_STATES) into the revised total, so reaching this state posts it.
    } else if (body.status) {
      patch.status = String(body.status).slice(0, 40);
    } else {
      return NextResponse.json({ error: 'no action' }, { status: 400 });
    }

    const { data, error } = await db.from('change_orders').update(patch as any).eq('tenant_id', user.tenantId).eq('id', body.id).select('id,status').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 400 });
    return NextResponse.json({ changeOrder: data });
  } catch (e: any) {
    return apiError('franchise/change-orders', e, "update failed", 500);
  }
}
