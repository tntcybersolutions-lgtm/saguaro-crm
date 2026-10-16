/**
 * DELETE /api/lien-waivers/[id] — remove one lien waiver.
 *
 * A CRUD sweep found this module had a create route and no delete, so a user
 * could add a lien waiver and never get rid of it. Written to match the
 * house pattern in app/api/punch-list/[id]/route.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Budget', 'Full');
  if (!g.ok) return g.res;

  try {
    const db = createServerClient();
    /* Scoped by id AND tenant_id. An id on its own would let anyone who
       learns another tenant's row id delete it. */
    /* A soft delete: a lien waiver is a legal record, and every reader
       (lists, the payment gate, dashboards, reports) hides rows with
       deleted_at set. */
    const { data, error } = await db
      .from('lien_waivers')
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('id', id)
      .eq('tenant_id', g.user.tenantId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    /* 404 rather than a cheerful success on a row that was not ours to
       remove — and 404 rather than 403, so another tenant's id is
       indistinguishable from one that does not exist. */
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, id });
  } catch (e) {
    return apiError('lien-waivers/[id]', e, 'Could not delete the lien waiver');
  }
}
