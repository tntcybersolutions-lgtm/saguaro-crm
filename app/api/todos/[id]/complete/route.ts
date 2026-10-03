import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  // Completing work is an edit. This route used to check only that someone was
  // signed in, so a read-only user could close anyone's to-do.
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const { db, user } = g;
  try {
    // Service-role client scoped by tenant. `.select()` lets us detect a 0-row
    // update and surface a real 404 instead of a fake success.
    const { data, error } = await db
      .from('project_todos')
      .update({ status: 'Complete', completed_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return apiError('todos/complete', err, 'Could not complete the to-do');
  }
}
