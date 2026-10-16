import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/rfis/[id]/status
 * Update an RFI's status. Called from app/field/rfis/page.tsx (bulk close).
 * Body: { status: string }  e.g. { status: 'closed' }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await requirePermission(req, 'RFIs', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  const { id } = await params;

  let status = '';
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    status = ((body.status as string) || '').trim();
  } catch {
    /* safe default */
  }

  if (!status) {
    return NextResponse.json({ error: 'status is required' }, { status: 400 });
  }

  try {
    const db = createServerClient();

    const update: Record<string, unknown> = { status };
    if (status === 'closed') {
      update.closed_at = new Date().toISOString();
      update.closed_by = user.email || '';
    }

    const { error } = await db
      .from('rfis')
      .update(update)
      .eq('id', id)
      .eq('tenant_id', user.tenantId);

    if (error) throw error;

    return NextResponse.json({ success: true, status });
  } catch (e) {
    return apiError('rfis/[id]/status PATCH', e);
  }
}
