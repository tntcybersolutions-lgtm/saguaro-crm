import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ lienWaivers: [] }, { status: 401 });

    const db = createServerClient();
    let query = db.from('lien_waivers').select('*, subcontractors!lien_waivers_subcontractor_id_fkey(company_name, email)').eq('tenant_id', user.tenantId).is('deleted_at', null).order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ lienWaivers: data || [] });
  } catch (e) {
    // Was a bare catch{}: the real error was thrown away. Log it with a ref.
    return apiError('lien-waivers/list', e, "Couldn't load lien waivers");
  }
}
