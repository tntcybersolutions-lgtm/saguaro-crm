import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { liveJobs } from '@/lib/live-jobs';
import { isSubPortalExpired } from '@/lib/sub-portal-expiry';

export const dynamic = 'force-dynamic';

/** GET /api/portal/sub/sessions — list THIS GC's sub portal sessions.
 *  Auth + tenant scope required: these rows include portal tokens; an
 *  unauthenticated/cross-tenant read here previously leaked every tenant's
 *  tokens (sub impersonation). The token is fine to return to the authed GC
 *  who owns these portals (the page builds the shareable link from it). */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ sessions: [], error: 'unauthorized' }, { status: 401 });
    const db = createServerClient();

    const { data: sessions, error } = await db
      .from('portal_sub_sessions')
      .select('id, sub_id, sub_company, sub_contact_name, sub_email, project_id, token, status, expires_at, last_login_at, created_at, tenant_id')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    // Enrich with sub company names and project names
    const subIds = [...new Set((sessions || []).map(s => s.sub_id).filter(Boolean))] as string[];
    const projectIds = [...new Set((sessions || []).map(s => s.project_id).filter(Boolean))] as string[];

    let subMap: Record<string, { company_name: string; contact_name: string }> = {};
    let projectMap: Record<string, string> = {};

    await Promise.all([
      subIds.length > 0
        ? db.from('subcontractors').select('id, company_name, contact_name').eq('tenant_id', user.tenantId).in('id', subIds)
            .then(({ data }) => {
              subMap = Object.fromEntries((data || []).map(s => [s.id, { company_name: s.company_name, contact_name: s.contact_name }])) as Record<string, { company_name: string; contact_name: string }>;
            })
        : Promise.resolve(),
      projectIds.length > 0
        ? liveJobs(db.from('projects').select('id, name').eq('tenant_id', user.tenantId).in('id', projectIds))
            .then(({ data, error: pErr }) => {
              if (pErr) throw pErr;
              projectMap = Object.fromEntries((data || []).map(p => [p.id, p.name]));
            })
        : Promise.resolve(),
    ]);

    /* A sub invited by an email that is not on the roster has no sub_id —
       the company and contact typed on the invite live on the session row.
       Reading only the roster showed every such invite as "—". */
    // Portals onto archived or deleted jobs drop out (lib/live-jobs).
    const enriched = (sessions || []).filter(s => !s.project_id || s.project_id in projectMap).map(s => {
      const row = s as typeof s & { sub_company?: string | null; sub_contact_name?: string | null; sub_email?: string | null };
      return {
        ...s,
        company_name: (s.sub_id && subMap[s.sub_id]?.company_name) || row.sub_company || row.sub_email || null,
        contact_name: (s.sub_id && subMap[s.sub_id]?.contact_name) || row.sub_contact_name || null,
        project_name: projectMap[s.project_id!] || null,
        // Past its 90 days: the sub's link no longer opens; Resend reissues it.
        expired: s.status === 'active' && isSubPortalExpired((s as { expires_at?: string | null }).expires_at),
      };
    });

    return NextResponse.json({ sessions: enriched });
  } catch (e) {
    // Logged, then answered with a 2xx and an empty body — so the server knew
    // and the screen still showed "no sessions" as a fact. apiError() logs
    // the same detail WITH a correlation id and returns a status the client
    // can act on.
    return apiError('portal/sub/sessions', e, 'Could not load portal sessions');
  }
}
