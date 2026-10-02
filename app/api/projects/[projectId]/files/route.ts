import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { signFields, storageObjectKey } from '@/lib/storage-signing';
import { apiError } from '@/lib/api-error';
import { ensureImageThumbs } from '@/lib/file-thumbs';

export const runtime = 'nodejs';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Where a Sage/system-generated document is shown in the library's folders. */
function folderForDocType(docType: string): string {
  const t = (docType || '').toLowerCase();
  if (t.startsWith('bid')) return 'Bid Packages';
  if (t.startsWith('coi') || t.includes('insurance') || t.includes('bond')) return 'Bonds & Insurance';
  if (t === 'g702' || t === 'g703' || t.includes('pay') || t.includes('invoice')) return 'Invoices & Pay Apps';
  if (t === 'g706' || t === 'g707' || t.includes('closeout') || t.includes('substantial_completion') || t.includes('lien')) return 'Closeout';
  if (t.includes('contract') || t.includes('notice_to_proceed') || t.includes('sov')) return 'Contracts';
  if (t.includes('payroll') || t.includes('prevailing_wage')) return 'Invoices & Pay Apps';
  if (t.includes('jha') || t.includes('safety')) return 'Daily Reports';
  if (t.includes('notice')) return 'Contracts';
  return 'Generated Documents';
}

function kindFromUrl(url: string): { kind: string; mime: string } {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.pdf')) return { kind: 'pdf', mime: 'application/pdf' };
  if (/\.(png|jpe?g|webp|gif)$/.test(clean)) return { kind: 'image', mime: clean.endsWith('.png') ? 'image/png' : 'image/jpeg' };
  if (/\.(dwg|dxf)$/.test(clean)) return { kind: 'cad', mime: 'application/acad' };
  return { kind: 'pdf', mime: 'application/pdf' };
}

/**
 * List a project's files from the canonical `project_files` table.
 * Tenant-scoped (was anon + project-only — a cross-tenant read gap), hides
 * soft-deleted rows, and signs the private-bucket URLs so they actually open.
 *
 * `?include=linked` (the Files & Media screen sends it) also returns the job's
 * OTHER documents as read-only library entries, so the library is one picture
 * of the job instead of "Docs & Drawings 0" next to a populated Drawing
 * Register and fifteen Sage bid jackets:
 *   - every sheet in the Drawing Register        -> folder "Drawings"
 *   - every generated document (jackets, COI requests, G70x, …) -> a folder by type
 * They reference the stored objects (no copies), carry `read_only: true`,
 * `source` ('drawing' | 'generated') and an id prefixed with the source, so
 * the screen never offers rename/move/delete/crop on a row /api/files cannot
 * address. Anything already present as a project_files row (same storage
 * object) is not listed twice.
 */
export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const admin = createServerClient() as any;
    const url = new URL(req.url);
    const includeDeleted = url.searchParams.get('trash') === '1';
    /* Files can be tagged to a thing rather than a folder — a marked-up copy
       returned against one contract, a photo against one RFI. Uploading already
       recorded that; this is how a screen asks for only its own. */
    const entityType = url.searchParams.get('entityType');
    const entityId = url.searchParams.get('entityId');
    const includeLinked =
      !includeDeleted && !entityType && !entityId &&
      (url.searchParams.get('include') || '').split(',').includes('linked');

    let q = admin
      .from('project_files')
      .select('*')
      .eq('project_id', params.projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false });
    q = includeDeleted ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null);
    if (entityType) q = q.eq('entity_type', entityType);
    if (entityId) q = q.eq('entity_id', entityId);
    const { data, error } = await q;
    if (error) throw error;

    /* Grid tiles must not pull 1600px originals. Image rows get a ~400px JPEG
       stored next to the original (poster_url) — at upload for new files, and
       lazily here for older ones (bounded, never blocks on a slow render). */
    const rows = includeDeleted ? ((data as any[]) || []) : await ensureImageThumbs(admin, user.tenantId, (data as any[]) || []);
    const files = await signFields(rows, ['file_url', 'poster_url'], 3600);
    if (!includeLinked) return NextResponse.json({ files });

    const [drawingsRes, docsRes] = await Promise.all([
      admin
        .from('drawings')
        .select('id, name, sheet_number, url, discipline, status, revision_date, created_at')
        .eq('tenant_id', user.tenantId)
        .eq('project_id', params.projectId)
        .is('deleted_at', null)
        .order('sheet_number', { ascending: true })
        .limit(1000),
      admin
        .from('generated_documents')
        .select('id, doc_type, title, pdf_url, status, created_at')
        .eq('tenant_id', user.tenantId)
        .eq('project_id', params.projectId)
        .not('pdf_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);
    if (drawingsRes.error) throw drawingsRes.error;
    if (docsRes.error) throw docsRes.error;

    const seen = new Set<string>();
    for (const f of rows) {
      const k = storageObjectKey(f.file_url);
      if (k) seen.add(k);
    }
    const notSeen = (u: string | null | undefined) => {
      if (!u) return false;
      const k = storageObjectKey(u);
      if (!k) return true;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    };

    const linked: any[] = [];
    for (const d of (drawingsRes.data || []) as any[]) {
      if (!notSeen(d.url)) continue;
      const { kind, mime } = kindFromUrl(String(d.url));
      const sheet = d.sheet_number ? String(d.sheet_number) : '';
      linked.push({
        id: `drawing:${d.id}`,
        source: 'drawing',
        source_id: d.id,
        read_only: true,
        open_href: `/app/projects/${params.projectId}/drawings`,
        file_name: [sheet, d.name].filter(Boolean).join(' — ') || 'Drawing',
        file_url: d.url,
        kind,
        mime_type: mime,
        file_size: null,
        folder: 'Drawings',
        category: d.discipline || 'drawing',
        created_at: d.created_at,
      });
    }
    for (const g of (docsRes.data || []) as any[]) {
      if (!notSeen(g.pdf_url)) continue;
      linked.push({
        id: `generated:${g.id}`,
        source: 'generated',
        source_id: g.id,
        read_only: true,
        open_href: `/app/projects/${params.projectId}/documents`,
        file_name: g.title || String(g.doc_type || 'Document').replace(/[-_]+/g, ' '),
        file_url: g.pdf_url,
        kind: 'pdf',
        mime_type: 'application/pdf',
        file_size: null,
        folder: folderForDocType(String(g.doc_type || '')),
        category: g.doc_type,
        uploaded_by_name: 'Sage',
        created_at: g.created_at,
      });
    }
    // One unsignable old document must not blank the library's own files.
    const signedLinked = await signFields(linked, ['file_url'], 3600, { strict: false });
    return NextResponse.json({ files, linked: signedLinked.filter((l) => l.file_url) });
  } catch (err: unknown) {
    return apiError('projects/files', err, 'Failed to fetch project files');
  }
}
