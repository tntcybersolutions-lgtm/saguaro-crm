import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../supabase/admin';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || '';
  const tenantId  = searchParams.get('tenantId')  || '';
  const docType   = searchParams.get('type')       || '';

  try {
    let query = supabaseAdmin
      .from('generated_documents')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (projectId) query = query.eq('project_id', projectId);
    if (tenantId)  query = query.eq('tenant_id', tenantId);
    if (docType)   query = query.eq('doc_type', docType);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ documents: data || [] });
  } catch {
    return NextResponse.json({ documents: [] });
  }
}
