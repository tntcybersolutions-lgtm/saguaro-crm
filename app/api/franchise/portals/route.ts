import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { hasFeature } from '@/lib/entitlements-server';

import { apiError } from '@/lib/api-error';
/**
 * Operator management of franchisee portal links. FAIL-CLOSED + tenant-scoped.
 * The PUBLIC feed lives at /api/franchise/portal/[token]; this only mints/revokes tokens.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ portals: [] }, { status: 401 });
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ portals: [], gated: true }, { status: 403 });

    const db = createServerClient() as any;
    const { data: rows, error } = await db.from('owner_portal_tokens').select('*').eq('tenant_id', user.tenantId).order('created_at', { ascending: false });
    if (error) throw error;
    const projIds = Array.from(new Set((rows || []).map((r: any) => r.project_id).filter(Boolean)));
    let pmap: Record<string, any> = {};
    if (projIds.length) {
      const { data: projs } = await db.from('projects').select('id,name,city,state').eq('tenant_id', user.tenantId).in('id', projIds);
      pmap = Object.fromEntries((projs || []).map((p: any) => [p.id, p]));
    }
    const portals = (rows || []).map((r: any) => ({
      id: r.id, project_id: r.project_id, project_name: pmap[r.project_id]?.name ?? null,
      token: r.token, owner_name: r.owner_name, owner_email: r.owner_email, owner_company: r.owner_company,
      is_active: r.is_active !== false, last_accessed_at: r.last_accessed_at, created_at: r.created_at,
      url: `/franchise-portal/${r.token}`,
    }));
    return NextResponse.json({ portals });
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no portals" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('franchise/portals', e, 'Could not load portals');
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
    if (!body?.project_id) return NextResponse.json({ error: 'project_id is required' }, { status: 400 });

    const db = createServerClient() as any;
    const { data: proj } = await db.from('projects').select('id').eq('tenant_id', user.tenantId).eq('id', body.project_id).maybeSingle();
    if (!proj) return NextResponse.json({ error: 'invalid project' }, { status: 400 });

    const token = randomBytes(24).toString('hex');
    const row = {
      tenant_id: user.tenantId, project_id: body.project_id, token,
      owner_name: body.owner_name ? String(body.owner_name).slice(0, 160) : null,
      owner_email: body.owner_email ? String(body.owner_email).slice(0, 200) : null,
      owner_company: body.owner_company ? String(body.owner_company).slice(0, 160) : null,
      is_active: true,
    };
    const { data, error } = await db.from('owner_portal_tokens').insert(row).select('*').single();
    if (error) throw error;
    return NextResponse.json({ portal: { ...data, url: `/franchise-portal/${token}` } });
  } catch (e: any) {
    return apiError('franchise/portals', e, "create failed", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    if (!body?.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const db = createServerClient() as any;
    const { data, error } = await db.from('owner_portal_tokens').update({ is_active: false }).eq('tenant_id', user.tenantId).eq('id', body.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return apiError('franchise/portals', e, "revoke failed", 500);
  }
}
