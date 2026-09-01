import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { hasFeature } from '@/lib/entitlements-server';

import { apiError } from '@/lib/api-error';
/**
 * Phase 1–4 operating checklist per site (project_todos, linked_module='phase_checklist').
 * FAIL-CLOSED + tenant-scoped.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ items: [] }, { status: 401 });
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ items: [], gated: true }, { status: 403 });

    const db = createServerClient();
    const { data: rows, error } = await db.from('project_todos').select('*')
      .eq('tenant_id', user.tenantId).eq('linked_module', 'phase_checklist');
    if (error) throw error;

    const projIds = Array.from(new Set((rows || []).map((r: any) => r.project_id).filter(Boolean)));
    let pmap: Record<string, any> = {};
    if (projIds.length) {
      const { data: projs } = await db.from('projects').select('id,name,city,state').eq('tenant_id', user.tenantId).in('id', projIds);
      pmap = Object.fromEntries((projs || []).map((p: any) => [p.id, p]));
    }
    const items = (rows || []).map((r: any) => ({
      ...r,
      is_done: !!r.completed_at || /complete|done|closed/i.test(String(r.status || '')),
      project_name: pmap[r.project_id]?.name ?? null,
    }));
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [], source: 'error' });
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

    const done = body.is_done === true;
    const patch = { status: done ? 'completed' : 'open', completed_at: done ? new Date().toISOString() : null };

    const db = createServerClient();
    const { data, error } = await db.from('project_todos').update(patch as any)
      .eq('tenant_id', user.tenantId).eq('id', body.id).select('id, status, completed_at').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'invalid item' }, { status: 400 });
    return NextResponse.json({ item: data });
  } catch (e: any) {
    return apiError('franchise/checklist', e, "update failed", 500);
  }
}
