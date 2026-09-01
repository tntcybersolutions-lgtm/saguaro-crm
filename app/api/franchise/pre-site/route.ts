import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { hasFeature } from '@/lib/entitlements-server';

import { apiError } from '@/lib/api-error';
/**
 * Pre-Site Inspection / feasibility checklist per site
 * (project_todos, linked_module='pre_site'). FAIL-CLOSED + tenant-scoped.
 * Each item is open → passed (ok) or flagged (issue found).
 */
const STATES = ['open', 'passed', 'flagged'];

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ items: [] }, { status: 401 });
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ items: [], gated: true }, { status: 403 });

    const db = createServerClient();
    const { data: rows, error } = await db.from('project_todos').select('*')
      .eq('tenant_id', user.tenantId).eq('linked_module', 'pre_site');
    if (error) throw error;
    const projIds = Array.from(new Set((rows || []).map((r: any) => r.project_id).filter(Boolean)));
    let pmap: Record<string, any> = {};
    if (projIds.length) {
      const { data: projs } = await db.from('projects').select('id,name').eq('tenant_id', user.tenantId).in('id', projIds);
      pmap = Object.fromEntries((projs || []).map((p: any) => [p.id, p]));
    }
    const items = (rows || []).map((r: any) => {
      const st = String(r.status || 'open');
      return { ...r, state: /flag/i.test(st) ? 'flagged' : /pass|complete|done/i.test(st) ? 'passed' : 'open', project_name: pmap[r.project_id]?.name ?? null };
    });
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
    if (!body?.id || !STATES.includes(body.state))
      return NextResponse.json({ error: 'id and a valid state (open|passed|flagged) are required' }, { status: 400 });

    const resolved = body.state !== 'open';
    const patch = { status: body.state, completed_at: resolved ? new Date().toISOString() : null };

    const db = createServerClient();
    const { data, error } = await db.from('project_todos').update(patch as any)
      .eq('tenant_id', user.tenantId).eq('id', body.id).eq('linked_module', 'pre_site').select('id,status,completed_at').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'invalid item' }, { status: 400 });
    return NextResponse.json({ item: data });
  } catch (e: any) {
    return apiError('franchise/pre-site', e, "update failed", 500);
  }
}
