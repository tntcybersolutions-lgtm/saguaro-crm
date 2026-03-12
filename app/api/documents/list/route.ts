import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const type = searchParams.get('type');
  try {
    const db = createServerClient();
    let query = db.from('generated_documents').select('*').eq('tenant_id', user.tenantId).order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    if (type) query = query.eq('doc_type', type);
    const { data, error } = await query.limit(100);
    if (error) throw error;
    return NextResponse.json({ documents: data || [] });
  } catch (err: any) {
    return NextResponse.json({ documents: [], error: err.message }, { status: 500 });
  }
}
