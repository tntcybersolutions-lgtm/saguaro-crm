import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { hasFeature } from '@/lib/entitlements-server';
import { nextLifecycleStatus } from '@/lib/franchise';

import { apiError } from '@/lib/api-error';
/**
 * Cross-site long-lead procurement for the Franchise Rollout Command Center.
 * FAIL-CLOSED: only tenants entitled to `command_center` get any data (403 otherwise),
 * and results are always scoped to the caller's own tenant.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ items: [] }, { status: 401 });
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ items: [], gated: true }, { status: 403 });

    const db = createServerClient();
    const { data: items, error } = await db
      .from('procurement_items')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('needed_by_date', { ascending: true, nullsFirst: false });
    if (error) throw error;

    // Attach project context (name/city/state/phase) via an in-JS join.
    const projIds = Array.from(new Set((items || []).map((i: any) => i.project_id).filter(Boolean)));
    let pmap: Record<string, any> = {};
    if (projIds.length) {
      const { data: projs } = await db
        .from('projects')
        .select('id,name,city,state,phase')
        .eq('tenant_id', user.tenantId)
        .in('id', projIds);
      pmap = Object.fromEntries((projs || []).map((p: any) => [p.id, p]));
    }
    const enriched = (items || []).map((i: any) => ({
      ...i,
      project_name: pmap[i.project_id]?.name ?? null,
      project_city: pmap[i.project_id]?.city ?? null,
      project_state: pmap[i.project_id]?.state ?? null,
      project_phase: pmap[i.project_id]?.phase ?? null,
    }));
    return NextResponse.json({ items: enriched });
  } catch {
    return NextResponse.json({ items: [], source: 'error' });
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
    if (!body?.project_id || !body?.item_description)
      return NextResponse.json({ error: 'project_id and item_description are required' }, { status: 400 });

    const db = createServerClient();
    // Verify the project belongs to this tenant (never trust a client-supplied id).
    const { data: proj } = await db
      .from('projects').select('id').eq('tenant_id', user.tenantId).eq('id', body.project_id).maybeSingle();
    if (!proj) return NextResponse.json({ error: 'invalid project' }, { status: 400 });

    const row: Record<string, any> = {
      tenant_id: user.tenantId,
      project_id: body.project_id,
      item_description: String(body.item_description).slice(0, 500),
      quantity: body.quantity != null ? Number(body.quantity) : null,
      unit: body.unit ? String(body.unit).slice(0, 40) : null,
      needed_by_date: body.needed_by_date || null,
      lead_time_days: body.lead_time_days != null ? parseInt(body.lead_time_days, 10) : null,
      expected_ship_date: body.expected_ship_date || null,
      expected_delivery_date: body.expected_delivery_date || null,
      po_number: body.po_number ? String(body.po_number).slice(0, 60) : null,
      unit_cost: body.unit_cost != null ? Number(body.unit_cost) : null,
      status: body.status ? String(body.status).slice(0, 40) : 'pending',
      is_long_lead: body.is_long_lead === false ? false : true,
    };
    const { data, error } = await db.from('procurement_items').insert(row as any).select('*').single();
    if (error) throw error;
    return NextResponse.json({ item: data });
  } catch (e: any) {
    return apiError('franchise/long-lead', e, "insert failed", 500);
  }
}

// Advance a long-lead item to the next lifecycle stage (or set a specific status).
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
    const { data: cur } = await db.from('procurement_items').select('status').eq('tenant_id', user.tenantId).eq('id', body.id).maybeSingle();
    if (!cur) return NextResponse.json({ error: 'invalid item' }, { status: 400 });

    const status = body.status ? String(body.status).slice(0, 40) : nextLifecycleStatus((cur as any).status);
    const { data, error } = await db.from('procurement_items')
      .update({ status } as any)
      .eq('tenant_id', user.tenantId).eq('id', body.id).select('id, status').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'invalid item' }, { status: 400 });
    return NextResponse.json({ item: data });
  } catch (e: any) {
    return apiError('franchise/long-lead', e, "update failed", 500);
  }
}
