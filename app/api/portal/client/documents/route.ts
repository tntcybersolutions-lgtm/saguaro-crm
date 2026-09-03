import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getPortalSession, PORTAL_PERMS } from '@/lib/portal-auth';

/** GET — list documents visible to client, grouped by category */
export async function GET(req: NextRequest) {
  try {
    // Try view_documents first, fall back to view_project
    let session = await getPortalSession(req, PORTAL_PERMS.VIEW_DOCUMENTS);
    if (!session) {
      session = await getPortalSession(req, PORTAL_PERMS.VIEW_PROJECT);
    }
    if (!session) {
      return NextResponse.json({ error: 'Access denied — insufficient permissions' }, { status: 403 });
    }

    const db = createServerClient();
    const category = req.nextUrl.searchParams.get('category');

    let query = db
      .from('portal_documents')
      .select('*')
      .eq('project_id', session.project_id)
      .eq('tenant_id', session.tenant_id)
      .eq('status', 'visible')
      .order('category', { ascending: true })
      .order('created_at', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }

    const { data: rawDocuments, error } = await query;
    if (error) throw error;

    // Map DB rows → the shape the client portal renders. Previously the raw
    // rows were returned, so the UI read doc.url/doc.size/doc.date/doc.version
    // (which don't exist on portal_documents) — the Download button had no URL
    // and metadata rendered blank. Expose the real file_url/file_size/created_at.
    const fmtSize = (n: number | null | undefined): string => {
      const b = Number(n);
      if (!b || b <= 0) return '';
      if (b < 1024) return `${b} B`;
      if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
      return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    };
    const documents = (rawDocuments || []).map((d: any) => ({
      id: d.id,
      title: d.title,
      category: d.category || 'Uncategorized',
      doc_type: d.doc_type || null,
      version: d.doc_type ? String(d.doc_type) : '1',
      date: d.created_at,
      uploaded_by: d.uploaded_by || '',
      url: d.file_url || '',
      size: fmtSize(d.file_size),
    }));

    // Group documents by category
    const grouped: Record<string, any[]> = {};
    for (const doc of documents) {
      const cat = doc.category || 'Uncategorized';
      if (!grouped[cat]) {
        grouped[cat] = [];
      }
      grouped[cat].push(doc);
    }

    return NextResponse.json({
      documents,
      grouped,
      categories: Object.keys(grouped),
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
