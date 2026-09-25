import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { hasFeature } from '@/lib/entitlements-server';

/**
 * Cross-site schedule-milestone variance for the Franchise Rollout Command Center.
 * FAIL-CLOSED: only tenants entitled to `command_center` get any data (403 otherwise),
 * and results are always scoped to the caller's own tenant. Read-only rollup — GET only.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ milestones: [] }, { status: 401 });
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ milestones: [], gated: true }, { status: 403 });

    const db = createServerClient();
    const { data: milestones, error } = await db
      .from('schedule_milestones')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('baseline_date', { ascending: true, nullsFirst: false });
    if (error) throw error;

    // Attach project context (name/city/state/phase) via an in-JS join.
    const projIds = Array.from(new Set((milestones || []).map((m: any) => m.project_id).filter(Boolean)));
    let pmap: Record<string, any> = {};
    if (projIds.length) {
      const { data: projs } = await db
        .from('projects')
        .select('id,name,city,state,phase')
        .eq('tenant_id', user.tenantId)
        .in('id', projIds);
      pmap = Object.fromEntries((projs || []).map((p: any) => [p.id, p]));
    }
    const enriched = (milestones || []).map((m: any) => ({
      ...m,
      project_name: pmap[m.project_id]?.name ?? null,
      project_city: pmap[m.project_id]?.city ?? null,
      project_state: pmap[m.project_id]?.state ?? null,
      project_phase: pmap[m.project_id]?.phase ?? null,
    }));
    return NextResponse.json({ milestones: enriched });
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no milestones" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('franchise/milestones', e, 'Could not load milestones');
  }
}