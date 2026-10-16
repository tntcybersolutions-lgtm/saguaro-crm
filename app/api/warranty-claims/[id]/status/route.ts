import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/warranty-claims/[id]/status
 * Body: { status: string, note?: string }
 * Updates the claim status. `note` is accepted but the table has no timeline
 * column, so it is not persisted (the page tracks timeline optimistically).
 */
async function updateStatus(req: NextRequest, id: string) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json().catch(() => ({}));
    if (!body.status) return NextResponse.json({ error: 'status required' }, { status: 400 });
    const supabase = createServerClient();
    const update: Record<string, unknown> = {
      status: body.status,
      updated_at: new Date().toISOString(),
    };
    if (body.status === 'Resolved' || body.status === 'Closed') {
      update.resolved_at = new Date().toISOString();
    }
    const { data, error } = await supabase
      .from('warranty_claims')
      .update(update)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ claim: data, ok: true });
  } catch (e) {
    return apiError('warranty-claims/[id]/status', e, 'Failed to update status');
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return updateStatus(req, params.id);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return updateStatus(req, params.id);
}
