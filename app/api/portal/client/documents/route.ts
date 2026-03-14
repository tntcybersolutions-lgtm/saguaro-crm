import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

async function getPortalSession(req: NextRequest) {
  const token =
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-portal-token');
  if (!token) return null;

  const db = createServerClient();
  const { data: session } = await db
    .from('portal_client_sessions')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .single();

  return session;
}

/** GET — list documents visible to client, grouped by category */
export async function GET(req: NextRequest) {
  try {
    const session = await getPortalSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = createServerClient();
    const category = req.nextUrl.searchParams.get('category');

    let query = db
      .from('portal_documents')
      .select('*')
      .eq('project_id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .eq('visible_to_client', true)
      .order('category', { ascending: true })
      .order('created_at', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }

    const { data: documents, error } = await query;
    if (error) throw error;

    // Group documents by category
    const grouped: Record<string, any[]> = {};
    for (const doc of documents || []) {
      const cat = doc.category || 'Uncategorized';
      if (!grouped[cat]) {
        grouped[cat] = [];
      }
      grouped[cat].push(doc);
    }

    return NextResponse.json({
      documents: documents || [],
      grouped,
      categories: Object.keys(grouped),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load documents' }, { status: 500 });
  }
}
