import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * One document in the version-control register (document_control row).
 *
 *   PATCH  { name?, description?, category?, tags?, projectId? }
 *          edit the document's details. The register could upload versions,
 *          lock and approve — but a document filed with the wrong name, job or
 *          category could never be corrected.
 *   PATCH  { restore: true }
 *          bring an archived document back; its status returns to the status
 *          of its current version.
 *   DELETE archive the document (status = 'Archived'). A controlled document
 *          is history — its versions, checksums and approvals stay intact and
 *          it can be restored; it simply leaves the register.
 *
 * Tenant-scoped on every query. A document checked out by someone else is
 * theirs until they check it in — neither edit nor archive goes past the lock.
 */

type Ctx = { params: Promise<{ id: string }> };

// Not exported: a route module may only export handlers and route config.
const ARCHIVED = 'Archived';

async function loadDoc(db: any, id: string, tenantId: string) {
  const { data, error } = await db
    .from('document_control')
    .select('id, status, current_version, checked_out_by, checked_out_by_name')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; status: string; current_version: number; checked_out_by: string | null; checked_out_by_name: string | null } | null;
}

const lockedByOther = (doc: { checked_out_by: string | null }, userId: string) =>
  !!doc.checked_out_by && doc.checked_out_by !== userId;

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = await req.json().catch(() => ({}));
    const db = createServerClient() as any;
    const doc = await loadDoc(db, id, user.tenantId);
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    // ── Restore from the archive ──
    if (body.restore === true) {
      if (doc.status !== ARCHIVED) return NextResponse.json({ error: 'Document is not archived' }, { status: 409 });
      const { data: cur } = await db
        .from('document_control_versions')
        .select('status')
        .eq('tenant_id', user.tenantId)
        .eq('document_id', id)
        .eq('version', doc.current_version)
        .maybeSingle();
      const status = (cur as any)?.status && (cur as any).status !== 'Superseded' ? (cur as any).status : 'Draft';
      const { data, error } = await db
        .from('document_control')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', user.tenantId)
        .select('*')
        .single();
      if (error) throw error;
      return NextResponse.json({ document: data });
    }

    if (lockedByOther(doc, user.id)) {
      return NextResponse.json({ error: `Locked — checked out by ${doc.checked_out_by_name || 'another user'}` }, { status: 409 });
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = String(body.name ?? '').trim();
      if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
      updates.name = name;
    }
    if (body.description !== undefined) updates.description = String(body.description ?? '').trim() || null;
    if (body.category !== undefined) updates.category = String(body.category ?? '').trim() || 'Uncategorized';
    if (body.tags !== undefined) {
      const raw = Array.isArray(body.tags) ? body.tags : String(body.tags ?? '').split(',');
      updates.tags = Array.from(new Set(raw.map((t: unknown) => String(t).trim()).filter(Boolean)));
    }
    if (body.projectId !== undefined) {
      const pid = body.projectId ? String(body.projectId) : null;
      if (pid) {
        // The job id comes from the browser — it must be one of this tenant's.
        const { data: proj } = await db.from('projects').select('id').eq('id', pid).eq('tenant_id', user.tenantId).maybeSingle();
        if (!proj) return NextResponse.json({ error: 'projectId is not a project on this account' }, { status: 400 });
      }
      updates.project_id = pid;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update — send name, description, category, tags or projectId' }, { status: 400 });
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('document_control')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ document: data });
  } catch (e) {
    return apiError('documents/versions/id PATCH', e, 'Could not save the document');
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  // Same bar as approving a version: taking a controlled document off the register.
  const g = await requirePermission(req, 'Documents', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient() as any;
    const doc = await loadDoc(db, id, user.tenantId);
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    if (doc.status === ARCHIVED) return NextResponse.json({ ok: true, alreadyArchived: true });
    if (lockedByOther(doc, user.id)) {
      return NextResponse.json({ error: `Locked — checked out by ${doc.checked_out_by_name || 'another user'}. It must be checked in first.` }, { status: 409 });
    }
    const { error } = await db
      .from('document_control')
      .update({
        status: ARCHIVED,
        // Archiving releases your own lock — nobody can check out an archived document.
        checked_out_by: null, checked_out_by_name: null, checked_out_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError('documents/versions/id DELETE', e, 'Could not archive the document');
  }
}
