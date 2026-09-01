import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { hasFeature } from '@/lib/entitlements-server';

import { apiError } from '@/lib/api-error';
/**
 * Cross-site risk register for the Franchise Rollout Command Center.
 * FAIL-CLOSED: only tenants entitled to `command_center` get any data (403 otherwise),
 * and results are always scoped to the caller's own tenant.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ risks: [] }, { status: 401 });
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ risks: [], gated: true }, { status: 403 });

    const db = createServerClient();
    const { data: risks, error } = await db
      .from('risk_register')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('risk_score', { ascending: false, nullsFirst: false });
    if (error) throw error;

    // Attach project context (name/city/state/phase) via an in-JS join.
    const projIds = Array.from(new Set((risks || []).map((r: any) => r.project_id).filter(Boolean)));
    let pmap: Record<string, any> = {};
    if (projIds.length) {
      const { data: projs } = await db
        .from('projects')
        .select('id,name,city,state,phase')
        .eq('tenant_id', user.tenantId)
        .in('id', projIds);
      pmap = Object.fromEntries((projs || []).map((p: any) => [p.id, p]));
    }
    const enriched = (risks || []).map((r: any) => ({
      ...r,
      project_name: pmap[r.project_id]?.name ?? null,
      project_city: pmap[r.project_id]?.city ?? null,
      project_state: pmap[r.project_id]?.state ?? null,
      project_phase: pmap[r.project_id]?.phase ?? null,
    }));
    return NextResponse.json({ risks: enriched });
  } catch {
    return NextResponse.json({ risks: [], source: 'error' });
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
    if (!body?.project_id || !body?.risk_title)
      return NextResponse.json({ error: 'project_id and risk_title are required' }, { status: 400 });

    const db = createServerClient();
    // Verify the project belongs to this tenant (never trust a client-supplied id).
    const { data: proj } = await db
      .from('projects').select('id').eq('tenant_id', user.tenantId).eq('id', body.project_id).maybeSingle();
    if (!proj) return NextResponse.json({ error: 'invalid project' }, { status: 400 });

    const row: Record<string, any> = {
      tenant_id: user.tenantId,
      project_id: body.project_id,
      risk_title: String(body.risk_title).slice(0, 300),
      risk_category: body.risk_category ? String(body.risk_category).slice(0, 60) : null,
      description: body.description ? String(body.description).slice(0, 2000) : null,
      likelihood: body.likelihood ? String(body.likelihood).slice(0, 40) : null,
      impact: body.impact ? String(body.impact).slice(0, 40) : null,
      mitigation_plan: body.mitigation_plan ? String(body.mitigation_plan).slice(0, 2000) : null,
      owner: body.owner ? String(body.owner).slice(0, 120) : null,
      due_date: body.due_date || null,
      status: body.status ? String(body.status).slice(0, 40) : 'open',
      is_active: true,
    };
    const { data, error } = await db.from('risk_register').insert(row as any).select('*').single();
    if (error) throw error;
    return NextResponse.json({ risk: data });
  } catch (e: any) {
    return apiError('franchise/risks', e, "insert failed", 500);
  }
}
