/**
 * GET   /api/items/:tool/:id — one tool item (RFI, submittal, punch item…) with its job's name.
 * PATCH /api/items/:tool/:id — update the fields the tool allows (lib/items/registry `edit`).
 * The database's history trigger records every change with who made it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { loadItem } from '@/lib/items/server';
import { pickEditable } from '@/lib/items/registry';
import { apiError } from '@/lib/api-error';
import { signStoredUrl } from '@/lib/storage-signing';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ tool: string; id: string }> }) {
  const { tool: type, id } = await params;
  const l = await loadItem(req, type, id, 'View');
  if (!l.ok) return l.res;
  try {
    const pid = l.item.project_id as string | null;
    const { data: project } = pid
      ? await l.db.from('projects').select('id, name').eq('id', pid).eq('tenant_id', l.user.tenantId).maybeSingle()
      : { data: null };
    // Files attached to this item (uploaded with entityType/entityId through /api/files/upload).
    const { data: fileRows } = await l.db
      .from('project_files')
      .select('id, file_name, file_size, mime_type, kind, storage_bucket, storage_path, file_url, uploaded_by_name, created_at')
      .eq('tenant_id', l.user.tenantId)
      .eq('entity_type', l.tool.table)
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(100);
    const files = await Promise.all(((fileRows || []) as Record<string, unknown>[]).map(async (f) => ({
      id: f.id, name: f.file_name, size: f.file_size, kind: f.kind, by: f.uploaded_by_name, at: f.created_at,
      url: f.storage_bucket && f.storage_path ? await signStoredUrl(String(f.storage_bucket), String(f.storage_path), 3600) : null,
    })));
    return NextResponse.json({ item: l.item, project, files });
  } catch (e) {
    return apiError(`items/${type}`, e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tool: string; id: string }> }) {
  const { tool: type, id } = await params;
  const l = await loadItem(req, type, id, 'Edit');
  if (!l.ok) return l.res;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch = pickEditable(l.tool, body);
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to save — none of those fields can be changed here.' }, { status: 400 });
    }
    if (l.tool.titleKey in patch && !String(patch[l.tool.titleKey] ?? '').trim()) {
      return NextResponse.json({ error: `${l.tool.noun} needs a title.` }, { status: 400 });
    }
    // Status side effects the list screens already apply.
    const status = patch[l.tool.statusKey];
    if (l.tool.type === 'rfis' && status === 'closed' && !l.item.closed_at) patch.closed_at = new Date().toISOString();
    if (l.tool.type === 'rfis' && status === 'answered' && !l.item.answered_at) patch.answered_at = new Date().toISOString();
    if (l.tool.type === 'punch_list' && status === 'completed' && !l.item.completed_at) patch.completed_at = new Date().toISOString();
    if (l.tool.type === 'punch_list' && status === 'verified' && !l.item.verified_at) patch.verified_at = new Date().toISOString();
    if (l.tool.hasUpdatedAt !== false) patch.updated_at = new Date().toISOString();
    if (l.tool.type === 'inspections' && (status === 'completed') && !l.item.inspected_at) patch.inspected_at = new Date().toISOString();
    if (l.tool.type === 'change_orders' && status === 'approved' && !l.item.approved_at) patch.approved_at = new Date().toISOString();

    const { data, error } = await l.db
      .from(l.tool.table as never)
      .update(patch as never)
      .eq('id', id)
      .eq('tenant_id', l.user.tenantId)
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ item: data });
  } catch (e) {
    return apiError(`items/${type}`, e, "Couldn't save your changes. Please try again.");
  }
}
