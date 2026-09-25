import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/** GET /api/portal/client/sessions — list THIS GC's client portal sessions.
 *  Auth + tenant scope required: rows include portal tokens; an unauthenticated
 *  cross-tenant read here previously leaked every tenant's client tokens
 *  (account takeover). Token is fine for the authed GC who owns the portal. */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ sessions: [], error: 'unauthorized' }, { status: 401 });
    const db = createServerClient();

    const { data: sessions, error } = await db
      .from('portal_client_sessions')
      .select('id, client_name, client_email, project_id, token, status, expires_at, last_login_at, created_at, tenant_id')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    // Enrich with project names
    const projectIds = [...new Set((sessions || []).map(s => s.project_id).filter(Boolean))];
    let projectMap: Record<string, string> = {};

    if (projectIds.length > 0) {
      const { data: projects } = await db
        .from('projects')
        .select('id, name')
        .in('id', projectIds);
      projectMap = Object.fromEntries((projects || []).map(p => [p.id, p.name]));
    }

    const enriched = (sessions || []).map(s => ({
      ...s,
      token: s.token, // include token for link generation
      project_name: projectMap[s.project_id] || null,
    }));

    return NextResponse.json({ sessions: enriched });
  } catch (e) {
    // Logged, then answered with a 2xx and an empty body — so the server knew
    // and the screen still showed "no sessions" as a fact. apiError() logs
    // the same detail WITH a correlation id and returns a status the client
    // can act on.
    return apiError('portal/client/sessions', e, 'Could not load portal sessions');
  }
}
