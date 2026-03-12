import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ lienWaivers: [] }, { status: 401 });

    const db = createServerClient();
    let query = db.from('lien_waivers').select('*, subcontractors(name, email)').eq('tenant_id', user.tenantId).order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ lienWaivers: data || [] });
  } catch (err: any) {
    return NextResponse.json({ lienWaivers: [], error: err.message }, { status: 500 });
  }
}
