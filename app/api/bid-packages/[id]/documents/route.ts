import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { apiError } from '@/lib/api-error';

/**
 * Documents placed in a bid jacket.
 *
 *   POST   { projectFileId, category?, label? }   put a file in the jacket
 *   DELETE ?docId=…                               take it back out
 *
 * bid_package_documents is a purpose-built table — bid_package_id, category,
 * label, sort_order, soft delete — that existed in the schema with zero
 * references in application code. The jacket used to infer its contents by
 * pattern-matching project_files categories, which put a file named
 * "Addendum 3.pdf" in two sections at once and leaked one package's addenda
 * into another's jacket. Keying on bid_package_id removes both.
 *
 * Storage is NOT re-implemented here. The file is uploaded through the existing
 * /api/files/upload (service-role, tenant-prefixed path, writes project_files)
 * and this places a reference to it. Two storage paths for one concept is how
 * the portal_sub_bid_* fork happened, and I am not repeating it a table later.
 *
 * The stored file_url is copied from the project_files ROW, never from the
 * request. The upload response hands back a signed URL that expires in an hour;
 * persisting that would give the jacket links that die overnight. Reading it
 * server-side also means a caller cannot point a jacket at an arbitrary URL.
 */

export const dynamic = 'force-dynamic';

/** Categories that mean something to the jacket's dividers. Anything else is
 *  filed under Attachments, which is the honest default. */
const CATEGORIES = ['addendum', 'attachment', 'drawing', 'specification', 'form', 'permit'];

async function ownedPackage(db: ReturnType<typeof createServerClient>, id: string, tenantId: string) {
  const { data } = await db
    .from('bid_packages')
    .select('id, project_id, addendum_count')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data as Record<string, any> | null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  const { id } = await params;

  try {
    const db = createServerClient();
    const body = await req.json().catch(() => ({}));

    const pkg = await ownedPackage(db, id, user.tenantId);
    if (!pkg) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });

    const fileId = String(body.projectFileId || '').trim();
    if (!fileId) return NextResponse.json({ error: 'projectFileId is required' }, { status: 400 });

    /* Tenant-scoped read of the file the caller named. This is what stops a
       jacket being pointed at another tenant's document. */
    const { data: file } = await db
      .from('project_files')
      .select('id, file_name, file_url, file_type, mime_type')
      .eq('id', fileId)
      .eq('tenant_id', user.tenantId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    const f = file as Record<string, any>;

    const category = CATEGORIES.includes(String(body.category)) ? String(body.category) : 'attachment';

    /* Appended, not inserted mid-list: sort_order is what the shelf reads, and a
       GC adding a sheet expects it at the end rather than jumping the queue. */
    const { data: last } = await db
      .from('bid_package_documents')
      .select('sort_order')
      .eq('bid_package_id', id)
      .eq('tenant_id', user.tenantId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = Number((last as Record<string, any>)?.sort_order ?? 0) + 1;

    const { data: doc } = await must(
      db.from('bid_package_documents').insert({
        tenant_id: user.tenantId,
        bid_package_id: id,
        category,
        label: String(body.label || '').trim() || f.file_name || null,
        file_url: f.file_url,
        file_name: f.file_name,
        file_type: f.file_type || f.mime_type || null,
        sort_order: nextOrder,
      } as never).select('id, label, category, sort_order').single(),
      'bid_package_documents insert',
    );

    return NextResponse.json({ success: true, document: doc });
  } catch (e) {
    return apiError('bid_package_documents', e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  const { id } = await params;

  try {
    const db = createServerClient();
    const docId = req.nextUrl.searchParams.get('docId');
    if (!docId) return NextResponse.json({ error: 'docId is required' }, { status: 400 });

    const pkg = await ownedPackage(db, id, user.tenantId);
    if (!pkg) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 });

    /* Soft delete. The file itself stays in project_files — removing it from a
       jacket is not a decision to destroy the document, and a jacket that has
       already been issued needs its manifest to keep making sense. */
    await must(
      db.from('bid_package_documents')
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq('id', docId)
        .eq('bid_package_id', id)
        .eq('tenant_id', user.tenantId),
      'bid_package_documents delete',
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('bid_package_documents', e);
  }
}
