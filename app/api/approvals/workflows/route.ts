import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';
import { metaFor } from '@/lib/approvals';

export const dynamic = 'force-dynamic';

/**
 * GET /api/approvals/workflows — tenant-scoped approval templates.
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requirePermission(req, 'Admin', 'View', { projectId: null });
  if (!gate.ok) return gate.res;
  const user = gate.user;
    if (!user) return NextResponse.json({ workflows: [], source: 'unauth' }, { status: 401 });

    const db = createServerClient();
    const { data, error } = await db
      .from('approval_workflows')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ workflows: data || [], source: 'live' });
  } catch (e) {
    // Was a 2xx with an empty body: the screen showed "no workflows" with
    // total confidence while the query was actually failing. A soft fail on
    // a read is indistinguishable from real emptiness, which is the whole
    // problem. Real status, real log, correlation id.
    return apiError('approvals/workflows', e, 'Could not load approval workflows');
  }
}

/**
 * POST /api/approvals/workflows — create a template.
 * Body: { name, module (entity_type key), steps[], active? }
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const meta = metaFor(body.module);
    if (!body.name?.trim() || !meta) {
      return NextResponse.json({ error: 'name and a valid module are required' }, { status: 400 });
    }
    const steps = Array.isArray(body.steps) ? body.steps : [];

    const db = createServerClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await db.from('approval_workflows').insert({
      tenant_id: user.tenantId,
      name: body.name.trim(),
      module: meta.entityType,
      steps,
      active: body.active !== false,
      created_by: user.id,
      updated_at: nowIso,
    } as never).select().single();
    if (error) throw error;
    return NextResponse.json({ workflow: data, success: true });
  } catch (e) {
    return apiError('approvals/workflows POST', e);
  }
}
