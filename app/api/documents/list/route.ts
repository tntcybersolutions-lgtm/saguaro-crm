import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { signStoredUrl } from '@/lib/storage-signing';
import { apiError } from '@/lib/api-error';

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
    // Sign each document URL on read (the 'documents' bucket is private — these
    // hold W-9 SSNs / pay-app financials). Short-lived signed URLs only.
    const documents = await Promise.all(
      (data || []).map(async (d: any) => ({ ...d, pdf_url: await signStoredUrl('documents', d.pdf_url) })),
    );
    return NextResponse.json({ documents });
  } catch (e) {
    return apiError('documents/list GET', e, undefined, 500, { documents: [] });
  }
}
