import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

/**
 * Document Library — every generated document (pay apps, invoices, waivers,
 * bonds, W-9s, closeout…) as one browsable, tenant-scoped list.
 * GET  ?projectId=&type=  -> { docs, types }
 * POST { docId }          -> { url } fresh signed link (stored URLs expire —
 *                            the 'documents' bucket is private by design)
 */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'View');
  if (!g.ok) return g.res;
  try {
    const db = createServerClient() as any;
    const projectId = req.nextUrl.searchParams.get('projectId');
    const type = req.nextUrl.searchParams.get('type');
    // title distinguishes rows that otherwise all render as their doc_type —
    // the library showed twenty-eight rows called "Bid Jacket" against the same
    // project, with nothing to tell them apart. source_type/source_id let a
    // generated document link back to the thing it was generated from, so a
    // bid jacket can open the real jacket rather than its flattened PDF.
    let q = db.from('generated_documents')
      .select('id, doc_type, project_id, status, created_at, title, source_type, source_id')
      .eq('tenant_id', g.user.tenantId)
      .order('created_at', { ascending: false })
      .limit(300);
    if (projectId) q = q.eq('project_id', projectId);
    if (type) q = q.eq('doc_type', type);
    const { data: docs } = await q;

    const projIds = Array.from(new Set(((docs || []) as any[]).map((d) => d.project_id).filter(Boolean)));
    const names: Record<string, string> = {};
    if (projIds.length) {
      const { data: projs } = await db.from('projects').select('id, name').in('id', projIds).eq('tenant_id', g.user.tenantId);
      for (const p of (projs || []) as any[]) names[p.id] = p.name;
    }
    const out = ((docs || []) as any[]).map((d) => ({ ...d, projectName: names[d.project_id] ?? null }));
    const types = Array.from(new Set(out.map((d) => d.doc_type))).sort();
    return NextResponse.json({ docs: out, types });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'View');
  if (!g.ok) return g.res;
  try {
    const b = await req.json().catch(() => ({}));
    if (!b.docId) return NextResponse.json({ error: 'docId required' }, { status: 400 });
    const db = createServerClient() as any;
    const { data: doc } = await db.from('generated_documents')
      .select('pdf_url').eq('id', b.docId).eq('tenant_id', g.user.tenantId).maybeSingle();
    const stored = doc?.pdf_url as string | undefined;
    const marker = '/documents/';
    if (!stored || !stored.includes(marker)) {
      return NextResponse.json({ error: 'Document file not found' }, { status: 404 });
    }
    const path = stored.slice(stored.indexOf(marker) + marker.length).split('?')[0];
    const { data: signed, error } = await db.storage.from('documents').createSignedUrl(path, 3600);
    if (error || !signed?.signedUrl) throw error || new Error('sign failed');
    return NextResponse.json({ url: signed.signedUrl });
  } catch {
    return NextResponse.json({ error: 'Could not open the document.' }, { status: 500 });
  }
}
