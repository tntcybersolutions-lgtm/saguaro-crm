import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { hasFeature } from '@/lib/entitlements-server';

import { apiError } from '@/lib/api-error';
/**
 * Per-site stakeholder directory (the org structure: Owner, GC, Architect, City,
 * Full-Swing, IT/AV, Signage, …). Reuses project_contacts. FAIL-CLOSED + tenant-scoped.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ stakeholders: [] }, { status: 401 });
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ stakeholders: [], gated: true }, { status: 403 });

    const db = createServerClient();
    const { data: rows, error } = await db.from('project_contacts').select('*')
      .eq('tenant_id', user.tenantId).or('is_active.is.null,is_active.eq.true');
    if (error) throw error;

    const projIds = Array.from(new Set((rows || []).map((r: any) => r.project_id).filter(Boolean)));
    let pmap: Record<string, any> = {};
    if (projIds.length) {
      const { data: projs } = await db.from('projects').select('id,name,city,state').eq('tenant_id', user.tenantId).in('id', projIds);
      pmap = Object.fromEntries((projs || []).map((p: any) => [p.id, p]));
    }
    const stakeholders = (rows || []).map((r: any) => ({ ...r, project_name: pmap[r.project_id]?.name ?? null }));
    return NextResponse.json({ stakeholders });
  } catch (e) {
    // A failed read must NOT render as an empty list. The screen would say
    // "no stakeholders" with total confidence when the truth is that the query
    // failed — and the old body carried source:'error', which no screen has
    // ever read. Real status, real server-side log, correlation id.
    return apiError('franchise/stakeholders', e, 'Could not load stakeholders');
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
    if (!body?.project_id || !body?.name)
      return NextResponse.json({ error: 'project_id and name are required' }, { status: 400 });

    const db = createServerClient();
    const { data: proj } = await db.from('projects').select('id').eq('tenant_id', user.tenantId).eq('id', body.project_id).maybeSingle();
    if (!proj) return NextResponse.json({ error: 'invalid project' }, { status: 400 });

    const row: Record<string, any> = {
      tenant_id: user.tenantId,
      project_id: body.project_id,
      name: String(body.name).slice(0, 160),
      role: body.role ? String(body.role).slice(0, 80) : null,
      role_label: body.role ? String(body.role).slice(0, 80) : null,
      company: body.company ? String(body.company).slice(0, 160) : null,
      email: body.email ? String(body.email).slice(0, 200) : null,
      phone: body.phone ? String(body.phone).slice(0, 60) : null,
      contact_type: 'stakeholder',
      is_active: true,
    };
    const { data, error } = await db.from('project_contacts').insert(row as any).select('*').single();
    if (error) throw error;
    return NextResponse.json({ stakeholder: data });
  } catch (e: any) {
    return apiError('franchise/stakeholders', e, "insert failed", 500);
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

    const db = createServerClient();
    const { data, error } = await db.from('project_contacts')
      .update({ is_active: false } as any)
      .eq('tenant_id', user.tenantId).eq('id', body.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return apiError('franchise/stakeholders', e, "delete failed", 500);
  }
}
