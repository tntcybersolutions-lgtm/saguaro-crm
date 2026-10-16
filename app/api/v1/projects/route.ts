/**
 * GET /api/v1/projects
 * -------------------------------------------------------------------------
 * Public REST endpoint — authenticated by a minted Integration Hub API key
 * (`Authorization: Bearer sk_live_…`). Returns projects scoped to the key's
 * tenant. This is one of the endpoints advertised in the API docs and is the
 * first real consumer of authenticateApiKey / requireApiKey.
 *
 * Query params:
 *   limit  — max rows (default 100, capped at 200)
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
      .from('projects')
      .select(
        'id, name, address, project_number, status, contract_amount, start_date, substantial_completion_date, project_type, created_at',
      )
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return NextResponse.json({ data: data ?? [], has_more: (data?.length ?? 0) === limit });
  } catch (e) {
    return apiError('v1/projects GET', e);
  }
}
