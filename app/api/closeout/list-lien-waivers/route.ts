import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');

    if (!projectId) return NextResponse.json({ error: 'Missing required field: projectId' }, { status: 400 });

    const db = createServerClient();
    const { data, error } = await db
      .from('lien_waivers')
      .select('*, subcontractors(name, email)')
      .eq('tenant_id', user.tenantId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ waivers: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
