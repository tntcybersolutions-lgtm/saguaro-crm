import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';

import { apiError } from '@/lib/api-error';
import { must } from '@/lib/db-write';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* eslint-disable @typescript-eslint/no-explicit-any */

const BUCKET = 'documents';

/** "REV-001" from a 1-based version number. */
function revCode(v: number): string {
  return `REV-${String(v).padStart(3, '0')}`;
}

/** Shape a document + its versions + grants into the client model. */
function shape(doc: any, versions: any[], grants: any[], projectName: string | null) {
  const vers = versions
    .filter((v) => v.document_id === doc.id)
    .sort((a, b) => a.version - b.version)
    .map((v) => ({
      id: v.id,
      version: v.version,
      versionLabel: `v${v.version}`,
      revisionCode: revCode(v.version),
      uploadedBy: v.uploaded_by_name || 'Unknown',
      uploadedAt: v.created_at,
      fileName: v.file_name,
      fileSize: v.file_size ?? null,
      fileType: v.file_type || null,
      checksum: v.checksum || null,
      revisionNotes: v.notes || '',
      status: v.status,
      approvedBy: v.approved_by || null,
      approvedAt: v.approved_at || null,
    }));
  const g = grants
    .filter((x) => x.document_id === doc.id)
    .map((x) => ({ userId: x.id, name: x.grantee, role: x.role }));
  return {
    id: doc.id,
    title: doc.name,
    description: doc.description || '',
    category: doc.category || 'Uncategorized',
    tags: doc.tags || [],
    projectId: doc.project_id || null,
    project: projectName || 'Unassigned',
    currentVersion: doc.current_version ? `v${doc.current_version}` : '—',
    currentVersionNumber: doc.current_version || 0,
    lastModified: doc.updated_at,
    modifiedBy: doc.created_by_name || (vers.length ? vers[vers.length - 1].uploadedBy : ''),
    status: doc.status,
    checkedOutBy: doc.checked_out_by_name || null,
    checkedOutById: doc.checked_out_by || null,
    checkedOutAt: doc.checked_out_at || null,
    createdAt: doc.created_at,
    versions: vers,
    access: g,
  };
}

/**
 * GET /api/documents/versions
 * List every document in the tenant with its full version history + access
 * grants + project name. Tenant-scoped via getUser + explicit .eq(tenant_id).
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = createServerClient() as any;
    /* Archived documents (DELETE /api/documents/versions/[id]) leave the
       register; ?archived=1 lists only them, for the Archived view / restore. */
    const archivedOnly = req.nextUrl.searchParams.get('archived') === '1';
    let q = db
      .from('document_control')
      .select('*')
      .eq('tenant_id', user.tenantId);
    q = archivedOnly ? q.eq('status', 'Archived') : q.neq('status', 'Archived');
    const { data: docs, error } = await q.order('updated_at', { ascending: false });
    if (error) throw error;
    const list = docs || [];
    const ids = list.map((d: any) => d.id);

    let versions: any[] = [];
    let grants: any[] = [];
    if (ids.length) {
      const [{ data: v }, { data: g }] = await Promise.all([
        db.from('document_control_versions').select('*').eq('tenant_id', user.tenantId).in('document_id', ids),
        db.from('document_control_grants').select('*').eq('tenant_id', user.tenantId).in('document_id', ids),
      ]);
      versions = v || [];
      grants = g || [];
    }

    // Resolve project names in one pass.
    const projIds = Array.from(new Set(list.map((d: any) => d.project_id).filter(Boolean)));
    const projMap: Record<string, string> = {};
    if (projIds.length) {
      const { data: projs } = await db.from('projects').select('id, name').in('id', projIds).eq('tenant_id', user.tenantId);
      for (const p of projs || []) projMap[p.id] = p.name;
    }

    const documents = list.map((d: any) => shape(d, versions, grants, d.project_id ? projMap[d.project_id] || null : null));
    return NextResponse.json({ documents });
  } catch (err: any) {
    console.error('[documents/versions GET]', err?.message);
    return apiError('documents/versions', err, "Failed to load documents", 500);
  }
}

/**
 * POST /api/documents/versions
 * Finalize an upload into a version row. The file bytes are already in the
 * private `documents` bucket (client PUT them to a signed upload URL minted by
 * /api/documents/versions/upload-url), so this endpoint records metadata only.
 *
 * Two modes:
 *   - documentId present  -> add a NEW VERSION (bumps current_version, supersedes
 *     prior versions, clears the check-out lock). Enforces the lock server-side:
 *     rejects if the doc is checked out by someone other than the caller.
 *   - documentId absent    -> create a NEW DOCUMENT at version 1.
 *
 * Body: { documentId?, path, fileName, fileSize?, fileType?, checksum?, notes?,
 *         name?, description?, category?, tags?, projectId? }
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const path: string = (body.path || '').trim();
    const fileName: string = (body.fileName || '').trim();
    if (!path || !fileName) return NextResponse.json({ error: 'path and fileName are required' }, { status: 400 });
    // Tenant-prefix guard: never let a caller record an object outside their tenant.
    if (!path.startsWith(`${user.tenantId}/`)) {
      return NextResponse.json({ error: 'Invalid storage path' }, { status: 400 });
    }

    const db = createServerClient() as any;

    // Verify the object actually exists in the bucket before we record it.
    const dir = path.slice(0, path.lastIndexOf('/'));
    const base = path.slice(path.lastIndexOf('/') + 1);
    const { data: listed } = await db.storage.from(BUCKET).list(dir, { search: base, limit: 100 });
    const found = (listed || []).find((o: any) => o.name === base);
    if (!found) return NextResponse.json({ error: 'Uploaded object not found in storage' }, { status: 400 });
    const fileSize: number = typeof body.fileSize === 'number' ? body.fileSize : (found.metadata?.size ?? 0);
    const fileType: string | null = body.fileType || found.metadata?.mimetype || null;

    const notes: string = (body.notes || '').toString();
    const checksum: string | null = body.checksum ? String(body.checksum) : null;

    if (body.documentId) {
      // ── New version of an existing document ──
      const { data: doc, error: dErr } = await db
        .from('document_control')
        .select('*')
        .eq('id', body.documentId)
        .eq('tenant_id', user.tenantId)
        .single();
      if (dErr || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      if (doc.checked_out_by && doc.checked_out_by !== user.id) {
        return NextResponse.json(
          { error: `Locked — checked out by ${doc.checked_out_by_name || 'another user'}` },
          { status: 409 },
        );
      }
      const nextVersion = (doc.current_version || 0) + 1;

      // Supersede prior versions, then insert the new one.
      await must(db
        .from('document_control_versions')
        .update({ status: 'Superseded' })
        .eq('document_id', doc.id)
        .eq('tenant_id', user.tenantId)
        .neq('status', 'Superseded'), 'document_control_versions write');

      const { data: ver, error: vErr } = await db
        .from('document_control_versions')
        .insert({
          tenant_id: user.tenantId,
          document_id: doc.id,
          version: nextVersion,
          file_name: fileName,
          file_path: path,
          file_size: fileSize,
          file_type: fileType,
          uploaded_by: user.id,
          uploaded_by_name: user.email,
          notes,
          checksum,
          status: 'Draft',
        })
        .select('*')
        .single();
      if (vErr) throw vErr;

      const { error: uErr } = await db
        .from('document_control')
        .update({
          current_version: nextVersion,
          status: 'Draft',
          checked_out_by: null,
          checked_out_by_name: null,
          checked_out_at: null,
        })
        .eq('id', doc.id)
        .eq('tenant_id', user.tenantId);
      if (uErr) throw uErr;

      return NextResponse.json({ documentId: doc.id, version: ver });
    }

    // ── Brand-new document at version 1 ──
    const name: string = (body.name || fileName.replace(/\.[^.]+$/, '')).trim();
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    const tags: string[] = Array.isArray(body.tags)
      ? body.tags.map((t: any) => String(t).trim()).filter(Boolean)
      : [];

    const { data: doc, error: dErr } = await db
      .from('document_control')
      .insert({
        tenant_id: user.tenantId,
        project_id: body.projectId || null,
        name,
        description: body.description || null,
        category: body.category || 'Uncategorized',
        tags,
        current_version: 1,
        status: 'Draft',
        created_by: user.id,
        created_by_name: user.email,
      })
      .select('*')
      .single();
    if (dErr) throw dErr;

    const { data: ver, error: vErr } = await db
      .from('document_control_versions')
      .insert({
        tenant_id: user.tenantId,
        document_id: doc.id,
        version: 1,
        file_name: fileName,
        file_path: path,
        file_size: fileSize,
        file_type: fileType,
        uploaded_by: user.id,
        uploaded_by_name: user.email,
        notes: notes || 'Initial upload',
        checksum,
        status: 'Draft',
      })
      .select('*')
      .single();
    if (vErr) throw vErr;

    // Owner gets an admin grant so the access list is populated from the start.
    await must(db.from('document_control_grants').insert({
      tenant_id: user.tenantId,
      document_id: doc.id,
      grantee: user.email,
      role: 'admin',
      created_by: user.id,
    }), 'document_control_grants insert');

    return NextResponse.json({ documentId: doc.id, version: ver });
  } catch (err: any) {
    console.error('[documents/versions POST]', err?.message);
    return apiError('documents/versions', err, "Failed to save version", 500);
  }
}
