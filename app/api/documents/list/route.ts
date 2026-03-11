import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const type = searchParams.get('type');
  try {
    const user = await getUser(req);
    const db = createServerClient();
    let query = db.from('generated_documents').select('*').order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    if (type) query = query.eq('doc_type', type);
    if (user?.id) query = query.eq('tenant_id', user.id);
    const { data, error } = await query.limit(100);
    if (error) throw error;
    return NextResponse.json({ documents: data || [] });
  } catch (err: any) {
    return NextResponse.json({ documents: [], error: err.message }, { status: 500 });
  }
}
