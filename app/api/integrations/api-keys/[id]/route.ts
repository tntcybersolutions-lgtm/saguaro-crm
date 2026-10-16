import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

/* ------------------------------------------------------------------ */
/*  DELETE /api/integrations/api-keys/[id]                            */
/*  Revoke a key (soft-delete: set revoked_at). Tenant-scoped.        */
/* ------------------------------------------------------------------ */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'Admin', 'Full');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await ctx.params;
    const db = createServerClient();
    const { data, error } = await db
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .is('revoked_at', null)
      .select('id, revoked_at')
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ success: true, id: data.id, revoked_at: data.revoked_at });
  } catch (e) {
    return apiError('integrations/api-keys/[id] DELETE', e);
  }
}
