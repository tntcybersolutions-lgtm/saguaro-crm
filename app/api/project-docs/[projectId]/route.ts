import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const db = createServerClient();

  try {
    const url = new URL(req.url);
    const docType = url.searchParams.get('type');

    let query = db
      .from('project_documents')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (docType && docType !== 'all') {
      query = query.eq('document_type', docType);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const db = createServerClient();
  const body = await req.json();

  if (!body.title) return NextResponse.json({ error: 'Missing required field: title' }, { status: 400 });

  try {
    const { data, error } = await db
      .from('project_documents')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        title: body.title,
        document_type: body.document_type || 'general',
        file_name: body.file_name,
        file_url: body.file_url,
        file_size: body.file_size,
        mime_type: body.mime_type,
        storage_path: body.storage_path,
        created_by: user.id,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
