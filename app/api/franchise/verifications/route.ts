import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { hasFeature } from '@/lib/entitlements-server';

import { apiError } from '@/lib/api-error';
// franchise_verifications is a franchise-only table (not in generated types) → loose client.
const TABLE = 'franchise_verifications';
const DECISIONS = ['pending', 'verified', 'rejected'];
// Verification method — remote evidence types + a physical on-site visit request.
const METHODS = ['photo', 'drone', '360', 'matterport', 'facetime', 'video', 'site_visit'];

/**
 * Remote milestone/stage verification sign-offs. FAIL-CLOSED + tenant-scoped.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ verifications: [] }, { status: 401 });
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ verifications: [], gated: true }, { status: 403 });

    const db = createServerClient() as any;
    const { data: rows, error } = await db.from(TABLE).select('*').eq('tenant_id', user.tenantId).order('created_at', { ascending: false });
    if (error) throw error;

    const projIds = Array.from(new Set((rows || []).map((r: any) => r.project_id).filter(Boolean)));
    let pmap: Record<string, any> = {};
    if (projIds.length) {
      const { data: projs } = await db.from('projects').select('id,name,city,state').eq('tenant_id', user.tenantId).in('id', projIds);
      pmap = Object.fromEntries((projs || []).map((p: any) => [p.id, p]));
    }
    const verifications = (rows || []).map((r: any) => ({
      ...r,
      project_name: pmap[r.project_id]?.name ?? null,
      project_city: pmap[r.project_id]?.city ?? null,
      project_state: pmap[r.project_id]?.state ?? null,
    }));
    return NextResponse.json({ verifications });
  } catch {
    return NextResponse.json({ verifications: [], source: 'error' });
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
    if (!body?.project_id || !body?.title)
      return NextResponse.json({ error: 'project_id and title are required' }, { status: 400 });

    const db = createServerClient() as any;
    const { data: proj } = await db.from('projects').select('id').eq('tenant_id', user.tenantId).eq('id', body.project_id).maybeSingle();
    if (!proj) return NextResponse.json({ error: 'invalid project' }, { status: 400 });

    const method = METHODS.includes(String(body.method)) ? String(body.method) : 'photo';
    const row = {
      tenant_id: user.tenantId,
      project_id: body.project_id,
      title: String(body.title).slice(0, 300),
      stage: body.stage ? String(body.stage).slice(0, 40) : null,
      milestone_id: body.milestone_id || null,
      method,
      media_url: body.media_url ? String(body.media_url).slice(0, 1000) : null,
      evidence_note: body.evidence_note ? String(body.evidence_note).slice(0, 4000) : null,
      photo_url: body.photo_url ? String(body.photo_url).slice(0, 1000) : null,
      requested_by: body.requested_by ? String(body.requested_by).slice(0, 120) : null,
      status: 'pending',
    };
    const { data, error } = await db.from(TABLE).insert(row).select('*').single();
    if (error) throw error;
    return NextResponse.json({ verification: data });
  } catch (e: any) {
    return apiError('franchise/verifications', e, "create failed", 500);
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
    if (!body?.id || !DECISIONS.includes(body.status))
      return NextResponse.json({ error: 'id and a valid status are required' }, { status: 400 });

    const decided = body.status === 'verified' || body.status === 'rejected';
    const patch: Record<string, any> = {
      status: body.status,
      verified_by: decided ? (body.verified_by ? String(body.verified_by).slice(0, 120) : (user.email || null)) : null,
      verified_at: decided ? new Date().toISOString() : null,
    };
    if (body.evidence_note != null) patch.evidence_note = String(body.evidence_note).slice(0, 4000);

    const db = createServerClient() as any;
    const { data, error } = await db.from(TABLE).update(patch).eq('tenant_id', user.tenantId).eq('id', body.id).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'invalid verification' }, { status: 400 });
    return NextResponse.json({ verification: data });
  } catch (e: any) {
    return apiError('franchise/verifications', e, "update failed", 500);
  }
}
