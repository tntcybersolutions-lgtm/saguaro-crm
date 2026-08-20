import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('project_id');
  const docType = searchParams.get('doc_type');

  if (!projectId) {
    return NextResponse.json({ error: 'project_id required' }, { status: 400 });
  }

  const db = createServerClient();

  let query = db
    .from('document_signatures')
    .select('*')
    .eq('project_id', projectId)
    .eq('tenant_id', user.tenantId)
    .order('sent_at', { ascending: false });

  if (docType) {
    query = query.eq('doc_type', docType);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ signatures: data || [] });
}
