/**
 * GET /api/v1/subcontractors
 * -------------------------------------------------------------------------
 * Public REST endpoint — authenticated by a minted Integration Hub API key
 * (`Authorization: Bearer sk_live_…`). Returns the tenant's subcontractor
 * directory. Subcontractors are tenant-level (not project-scoped), so there
 * is no projectId filter.
 *
 * Query params:
 *   limit — max rows (default 100, capped at 200)
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
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 1), 200);

    const db = createServerClient();
    const { data, error } = await db
      .from('subcontractors')
      .select(
        'id, company_name, contact_name, email, phone, trade, status, prequalification_status, insurance_expiry, created_at',
      )
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return NextResponse.json({ data: data ?? [], has_more: (data?.length ?? 0) === limit });
  } catch (e) {
    return apiError('v1/subcontractors GET', e);
  }
}
