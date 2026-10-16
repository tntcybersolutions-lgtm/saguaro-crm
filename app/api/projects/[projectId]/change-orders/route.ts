import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';
import { nextCoNumber } from '@/lib/change-order-number';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[projectId]/change-orders
 * Lists a project's "real" change orders (excludes PCOs, which carry
 * change_type='pco') scoped to the caller's tenant.
 * Caller: app/field/change-orders/page.tsx → loadCOs()
 *   reads d.change_orders || d.items || d.data
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ change_orders: [], source: 'unauth' }, { status: 401 });

    const db = createServerClient();
    const { data, error } = await db
      .from('change_orders')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      .order('co_number', { ascending: false });
    if (error) throw error;

    // PCOs are stored in change_orders with change_type='pco' — keep them
    // out of the CO list so the two tabs stay distinct.
    const change_orders = (data || []).filter((c: Record<string, unknown>) => c.change_type !== 'pco');

    return NextResponse.json({ change_orders, source: 'live' });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[projects/[projectId]/change-orders] read failed:', detail);
    // A failed read must not render as an empty result — return a real
    // status so the UI can show an error state with a retry.
    return apiError('projects/projectId/change-orders', e, 'Failed to load change orders');
  }
}

/**
 * POST /api/projects/[projectId]/change-orders
 * Creates a change order under the path-param project. Auto-generates the
 * next co_number. Shape: { id, changeOrder, success } (mirrors
 * /api/change-orders POST which the field/desktop create paths read .id from).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const g = await requirePermission(req, 'Change Orders', 'Edit', { projectId });
  if (!g.ok) return g.res;
  const user = g.user;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }

  if (!body.title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  try {
    const db = createServerClient();
    const coNumber = await nextCoNumber(db, user.tenantId, projectId);

    const { data: co, error } = await db
      .from('change_orders')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        co_number: coNumber,
        title: body.title,
        description: body.description ?? null,
        reason: body.reason ?? null,
        status: 'pending',
        change_type: 'additive',
        amount: body.costImpact ?? body.amount ?? 0,
        schedule_impact: body.scheduleImpact ?? body.schedule_impact ?? 0,
        submitted_by: user.id,
      } as Database['public']['Tables']['change_orders']['Insert'])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ id: (co as Record<string, unknown> | null)?.id, changeOrder: co, success: true });
  } catch (e) {
    return apiError('projects/[projectId]/change-orders POST', e);
  }
}
