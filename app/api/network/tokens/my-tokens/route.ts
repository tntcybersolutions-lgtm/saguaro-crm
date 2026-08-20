import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = createServerClient();

    // Get active, non-expired, non-revoked tokens for this user
    const { data, error } = await db
      .from('network_access_tokens')
      .select('*, network_connections(name, ssid, network_type, security_type, frequency)')
      .eq('tenant_id', user.tenantId)
      .eq('issued_to_user_id', user.id)
      .neq('status', 'revoked')
      .gte('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: true });

    if (error) throw error;

    // Enrich with project names
    const projectIds = [...new Set((data || []).map(t => t.project_id).filter(Boolean))];
    let projectMap = new Map<string, string>();
    if (projectIds.length > 0) {
      const { data: projects } = await db.from('projects').select('id, name').in('id', projectIds).eq('tenant_id', user.tenantId);
      projectMap = new Map((projects || []).map(p => [p.id, p.name]));
    }

    const tokens = (data || []).map(t => ({
      ...t,
      project_name: projectMap.get(t.project_id) || 'Job Site',
    }));

    return NextResponse.json({ tokens });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, {status: 500});
  }
}
