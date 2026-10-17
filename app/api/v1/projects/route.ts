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
 *   include_archived — `true` also returns archived jobs (deleted jobs never)
 * -------------------------------------------------------------------------
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/api-key-auth';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { liveJobs } from '@/lib/live-jobs';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req, 'read');
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 1), 200);

    const includeArchived = searchParams.get('include_archived') === 'true';

    const db = createServerClient();
    const base = db
      .from('projects')
      .select(
        'id, name, address, project_number, status, contract_amount, start_date, substantial_completion_date, project_type, created_at',
      )
      .eq('tenant_id', auth.tenantId);
    // Live jobs by default — the same list the app shows. Archived on request;
    // a deleted job is never returned.
    const scoped = includeArchived
      ? base.or('is_deleted.is.null,is_deleted.eq.false').is('deleted_at', null)
      : liveJobs(base);
    const { data, error } = await scoped
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return NextResponse.json({ data: data ?? [], has_more: (data?.length ?? 0) === limit });
  } catch (e) {
    return apiError('v1/projects GET', e);
  }
}
