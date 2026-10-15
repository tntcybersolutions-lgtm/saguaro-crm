/**
 * Comments on any tool item — one thread per RFI, submittal, punch item…
 *   GET    /api/items/:tool/:id/comments
 *   POST   /api/items/:tool/:id/comments   { body, attachments?: [{id,name}], official? }
 *   DELETE /api/items/:tool/:id/comments?commentId=…   (your own comment only; hidden, not erased)
 * Stored in entity_comments (entity_type = the tool's table).
 */
import { NextRequest, NextResponse } from 'next/server';
import { loadItem } from '@/lib/items/server';
import { apiError } from '@/lib/api-error';
import { writeWithOptionalColumns } from '@/lib/optional-column';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ tool: string; id: string }> };

export async function GET(req: NextRequest, { params }: P) {
  const { tool: type, id } = await params;
  const l = await loadItem(req, type, id, 'View');
  if (!l.ok) return l.res;
  try {
    const { data, error } = await l.db
      .from('entity_comments')
      .select('*')
      .eq('tenant_id', l.user.tenantId)
      .eq('entity_type', l.tool.table)
      .eq('entity_id', id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const comments = ((data || []) as Record<string, unknown>[])
      .filter((c) => c.deleted_at == null)
      .map((c) => ({ ...c, mine: c.author_id === l.user.id }));
    return NextResponse.json({ comments });
  } catch (e) {
    return apiError(`items/${type}/comments`, e, "Couldn't load comments.");
  }
}

export async function POST(req: NextRequest, { params }: P) {
  const { tool: type, id } = await params;
  // Commenting is part of working an item — View is enough to take part in the thread.
  const l = await loadItem(req, type, id, 'View');
  if (!l.ok) return l.res;
  try {
    const body = (await req.json().catch(() => ({}))) as { body?: string; attachments?: { id?: string; name?: string }[]; official?: boolean };
    const text = String(body.body || '').trim().slice(0, 10000);
    const attachments = Array.isArray(body.attachments)
      ? body.attachments.filter((a) => a && typeof a.id === 'string').slice(0, 20).map((a) => ({ id: a.id, name: String(a.name || 'file').slice(0, 200) }))
      : [];
    if (!text && attachments.length === 0) return NextResponse.json({ error: 'Write a comment or attach a file.' }, { status: 400 });
    const { data: prof } = await l.db.from('profiles').select('full_name').eq('id', l.user.id).maybeSingle();
    const { result: { data, error } } = await writeWithOptionalColumns(
      {
        tenant_id: l.user.tenantId,
        project_id: (l.item.project_id as string) || null,
        entity_type: l.tool.table,
        entity_id: id,
        body: text,
        author_id: l.user.id,
        author_name: (prof as { full_name?: string } | null)?.full_name || l.user.email,
        attachments,
        is_official: !!body.official,
      },
      ['attachments', 'is_official'],
      (row) => l.db.from('entity_comments').insert(row as never).select('*').single(),
    );
    if (error) throw error;
    return NextResponse.json({ comment: { ...(data as object), mine: true } }, { status: 201 });
  } catch (e) {
    return apiError(`items/${type}/comments`, e, "Couldn't post the comment.");
  }
}

export async function DELETE(req: NextRequest, { params }: P) {
  const { tool: type, id } = await params;
  const l = await loadItem(req, type, id, 'View');
  if (!l.ok) return l.res;
  const commentId = req.nextUrl.searchParams.get('commentId');
  if (!commentId) return NextResponse.json({ error: 'commentId is required' }, { status: 400 });
  try {
    const { data, error } = await l.db
      .from('entity_comments')
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('id', commentId)
      .eq('tenant_id', l.user.tenantId)
      .eq('entity_id', id)
      .eq('author_id', l.user.id)
      .select('id');
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ error: 'You can only remove your own comments.' }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(`items/${type}/comments`, e, "Couldn't remove the comment.");
  }
}
