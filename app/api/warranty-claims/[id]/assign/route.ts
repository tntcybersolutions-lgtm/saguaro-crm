import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * POST|PATCH /api/warranty-claims/[id]/assign
 * Body: { assigned_to: string, assigned_email?: string, assigned_phone?: string }
 * Sets the assignee. The table only stores assigned_to (text); email/phone are
 * accepted but not persisted. Bumps status Open -> Assigned.
 */
async function assignClaim(req: NextRequest, id: string) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createServerClient();

    // Look up current status to decide whether to bump Open -> Assigned.
    const { data: existing } = await supabase
      .from('warranty_claims')
      .select('status')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single();

    const update: Record<string, unknown> = {
      assigned_to: body.assigned_to || null,
      updated_at: new Date().toISOString(),
    };
    if (existing && (existing as { status?: string }).status === 'Open') {
      update.status = 'Assigned';
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
    return apiError('warranty-claims/[id]/assign', e, 'Failed to assign claim');
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return assignClaim(req, params.id);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return assignClaim(req, params.id);
}
