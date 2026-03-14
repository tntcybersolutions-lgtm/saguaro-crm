import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** GET /api/portal/client/sessions — list all client portal sessions for this tenant */
export async function GET() {
  try {
    const db = createServerClient();

    const { data: sessions, error } = await db
      .from('portal_client_sessions')
      .select('id, client_name, client_email, project_id, token, status, expires_at, last_accessed_at, created_at, tenant_id')
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
  } catch (err) {
    console.error('[portal/client/sessions]', err);
    return NextResponse.json({ sessions: [] });
  }
}
