import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { hasFeature } from '@/lib/entitlements-server';

import { apiError } from '@/lib/api-error';
/**
 * Toggle an OAC action item complete/open. FAIL-CLOSED + tenant-scoped.
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
    if (!body?.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const done = body.is_completed === true;
    const patch: Record<string, any> = {
      is_completed: done,
      status: done ? 'completed' : 'open',
      completed_at: done ? new Date().toISOString() : null,
    };

    const db = createServerClient();
    const { data, error } = await db
      .from('action_items')
      .update(patch as any)
      .eq('tenant_id', user.tenantId)
      .eq('id', body.id)
      .select('id, is_completed, status')
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'invalid item' }, { status: 400 });
    return NextResponse.json({ action: data });
  } catch (e: any) {
    return apiError('franchise/action-items', e, "update failed", 500);
  }
}
