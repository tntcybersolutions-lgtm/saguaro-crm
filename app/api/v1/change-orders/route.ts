/**
 * GET /api/v1/change-orders
 * -------------------------------------------------------------------------
 * Public REST endpoint — authenticated by a minted Integration Hub API key
 * (`Authorization: Bearer sk_live_…`). Returns change orders scoped to the
 * key's tenant, optionally filtered to a single project.
 *
 * Query params:
 *   projectId — optional; restrict to one project
 *   limit     — max rows (default 100, capped at 200)
 * -------------------------------------------------------------------------
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/api-key-auth';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req, 'read');
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 1), 200);

    const db = createServerClient();
    let q = db
      .from('change_orders')
      .select(
        'id, project_id, co_number, title, status, amount, cost_impact, schedule_impact_days, approved_at, created_at',
      )
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (projectId) q = q.eq('project_id', projectId);

    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ data: data ?? [], has_more: (data?.length ?? 0) === limit });
  } catch (e) {
    return apiError('v1/change-orders GET', e);
  }
}
