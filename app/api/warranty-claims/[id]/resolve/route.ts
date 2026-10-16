import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * POST|PATCH /api/warranty-claims/[id]/resolve
 * Body: { resolution_notes: string }
 * Records the resolution text, sets status to Resolved and stamps resolved_at.
 */
async function resolveClaim(req: NextRequest, id: string) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json().catch(() => ({}));
    const resolution = body.resolution_notes || body.resolution || '';
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('warranty_claims')
      .update({
        resolution,
        status: 'Resolved',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ claim: data, ok: true });
  } catch (e) {
    return apiError('warranty-claims/[id]/resolve', e, 'Failed to resolve claim');
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return resolveClaim(req, params.id);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return resolveClaim(req, params.id);
}
