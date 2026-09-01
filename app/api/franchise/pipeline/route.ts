import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { hasFeature } from '@/lib/entitlements-server';
import { isStage } from '@/lib/franchise-template';

import { apiError } from '@/lib/api-error';
/**
 * Move a franchise location to a different rollout stage.
 * FAIL-CLOSED: only tenants entitled to `command_center`, and only their own projects.
 */
export async function PATCH(req: NextRequest) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!(await hasFeature(user.tenantId, 'command_center')))
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    if (!body?.project_id || !isStage(body.rollout_stage))
      return NextResponse.json({ error: 'project_id and a valid rollout_stage are required' }, { status: 400 });

    const db = createServerClient();
    const { data, error } = await db
      .from('projects')
      .update({ rollout_stage: body.rollout_stage } as any)
      .eq('tenant_id', user.tenantId) // scope guarantees a tenant can only move its own site
      .eq('id', body.project_id)
      .select('id, rollout_stage')
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'invalid project' }, { status: 400 });
    return NextResponse.json({ project: data });
  } catch (e: any) {
    return apiError('franchise/pipeline', e, "update failed", 500);
  }
}
