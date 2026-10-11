import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/** DELETE /api/selections/[id]/options/[optionId] — stop offering an option. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; optionId: string }> }) {
  const { id, optionId } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  try {
    // selection_options has no tenant_id — prove the selection is ours first.
    const { data: sel, error: sErr } = await g.db.from('selections').select('id').eq('id', id).eq('tenant_id', g.user.tenantId).maybeSingle();
    if (sErr) throw sErr;
    if (!sel) return NextResponse.json({ error: 'Selection not found' }, { status: 404 });
    const { data, error } = await g.db.from('selection_options').delete().eq('id', optionId).eq('selection_id', id).select('id');
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ error: 'Option not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('selections/options', e, 'Could not remove the option.');
  }
}
