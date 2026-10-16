import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Choose / approve an option for a selection item.
 * Body: { optionId, selectedBy?, selectedAmount?, categoryId?, notes? }
 * Marks the selection row as picked (selected_by / selected_at) and advances
 * the status to "Selected" when it is still pending or in owner review.
 * Best-effort: records a selection_picks row when optionId + categoryId are real UUIDs.
 */
async function choose(req: NextRequest, params: { projectId: string; itemId: string }) {
  const g = await requirePermission(req, 'Projects', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const supabase = createServerClient();
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { body = {}; }

    const optionId = typeof body.optionId === 'string' ? body.optionId : '';
    const selectedBy = typeof body.selectedBy === 'string' ? body.selectedBy : (user.email || '');
    const now = new Date().toISOString();

    // Load the existing selection (scoped) so we can compute status + variance.
    const { data: existing, error: loadErr } = await supabase
      .from('selections')
      .select('*')
      .eq('id', params.itemId)
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updates: Record<string, unknown> = {
      selected_by: selectedBy,
      selected_at: now,
      updated_at: now,
    };
    if (body.selectedAmount !== undefined && body.selectedAmount !== null) {
      const amt = Number(body.selectedAmount);
      if (!Number.isNaN(amt)) {
        updates.selected_amount = amt;
        const allowance = Number((existing as Record<string, unknown>).allowance) || 0;
        updates.variance = allowance - amt;
      }
    }
    const curStatus = String((existing as Record<string, unknown>).status || '').toLowerCase();
    if (curStatus === '' || curStatus === 'pending' || curStatus === 'owner review') {
      updates.status = 'Selected';
    }

    const { data, error } = await supabase
      .from('selections')
      .update(updates)
      .eq('id', params.itemId)
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .select()
      .maybeSingle();
    if (error) throw error;

    // Best-effort normalized pick record (only when given real UUIDs).
    if (UUID_RE.test(optionId) && typeof body.categoryId === 'string' && UUID_RE.test(body.categoryId)) {
      try {
        await must(supabase.from('selection_picks').insert({
          tenant_id: user.tenantId,
          category_id: body.categoryId,
          option_id: optionId,
          project_id: params.projectId,
          picked_by: user.id,
          status: 'pending',
          notes: typeof body.notes === 'string' ? body.notes : null,
          picked_at: now,
        }), 'selection_picks insert');
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ selection: data, optionId });
  } catch (e) {
    return apiError('projects/[projectId]/selections/[itemId]/select', e);
  }
}

export async function POST(req: NextRequest, { params }: { params: { projectId: string; itemId: string } }) {
  return choose(req, params);
}

export async function PATCH(req: NextRequest, { params }: { params: { projectId: string; itemId: string } }) {
  return choose(req, params);
}
