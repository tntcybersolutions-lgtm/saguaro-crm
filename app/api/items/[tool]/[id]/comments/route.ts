/**
 * Comments on any tool item — one thread per RFI, submittal, punch item…
 *   GET    /api/items/:tool/:id/comments
 *   POST   /api/items/:tool/:id/comments   { body, attachments?: [{id,name}], official? }
 *   DELETE /api/items/:tool/:id/comments?commentId=…   (your own comment only; hidden, not erased)
 *   PATCH  /api/items/rfis/:id/comments   { entryId, kind: 'comment'|'response', official: boolean }  (RFIs: Edit)
 * Stored in entity_comments (entity_type = the tool's table).
 *
 * RFIs: the thread is every response the RFI has — its comments AND its
 * rfi_responses (the field app's answers, email replies, answers typed on the
 * RFI log), shown once each (lib/rfi mergeRfiThread). A comment posted here
 * is also kept as an rfi_responses row (comment_id), so the RFI's responses
 * are complete wherever they are read. "Official answer" answers the RFI
 * (lib/rfi-server setOfficialAnswer): one per RFI, status answered, survives
 * reload — it used to set a flag on the comment and leave the RFI open.
 */
import { NextRequest, NextResponse } from 'next/server';
import { loadItem } from '@/lib/items/server';
import { apiError } from '@/lib/api-error';
import { writeWithOptionalColumns } from '@/lib/optional-column';
import { requirePermission } from '@/lib/permissions';
import { mergeRfiThread } from '@/lib/rfi';
import { setOfficialAnswer, clearOfficialAnswer } from '@/lib/rfi-server';
import { runInBackground } from '@/lib/background';

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
    if (l.tool.type === 'rfis') {
      const { data: responses, error: rErr } = await l.db
        .from('rfi_responses')
        .select('*')
        .eq('tenant_id', l.user.tenantId)
        .eq('rfi_id', id)
        .order('responded_at', { ascending: true });
      if (rErr) throw rErr;
      const comments = mergeRfiThread((data || []) as Record<string, unknown>[], (responses || []) as Record<string, unknown>[], l.user.id);
      return NextResponse.json({ comments });
    }
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
    const official = !!body.official && l.tool.type === 'rfis';
    // Answering an RFI officially is an edit to the RFI, not just a comment.
    if (official) {
      const g = await requirePermission(req, 'RFIs', 'Edit', { projectId: (l.item.project_id as string) || null, db: l.db });
      if (!g.ok) return g.res;
    }
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
    const comment = data as Record<string, unknown>;

    if (l.tool.type === 'rfis') {
      // The same post as one of the RFI's responses, linked so the thread shows it once.
      const { result: { error: rErr } } = await writeWithOptionalColumns(
        {
          tenant_id: l.user.tenantId,
          rfi_id: id,
          responder_name: String(comment.author_name || l.user.email || 'Project team'),
          responder_email: l.user.email || null,
          response_text: text,
          attachments: attachments.map((a) => ({ id: a.id, name: a.name })),
          is_official: false,
          responded_at: String(comment.created_at || new Date().toISOString()),
          source: 'app',
          comment_id: comment.id,
        },
        ['source', 'comment_id'],
        (row) => l.db.from('rfi_responses').insert(row as never).select('id').single(),
      );
      if (rErr) {
        // Keep the two in step: without its response the post would be half-saved.
        await l.db.from('entity_comments').update({ deleted_at: new Date().toISOString() } as never).eq('id', String(comment.id)).eq('tenant_id', l.user.tenantId);
        throw rErr;
      }
      if (official) {
        const ok = await setOfficialAnswer(l.db, l.user.tenantId, l.item, { kind: 'comment', id: String(comment.id) }, { by: String(comment.author_name || l.user.email) });
        if (!ok) throw new Error('official answer: comment not found after insert');
        runInBackground(async () => (await import('@/lib/triggers')).onRFIAnswered(id), 'onRFIAnswered (thread)');
      }
    }
    return NextResponse.json({ comment: { ...comment, is_official: official || comment.is_official === true, mine: true } }, { status: 201 });
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

/** RFIs: make a response on the thread the official answer, or take the mark off. */
export async function PATCH(req: NextRequest, { params }: P) {
  const { tool: type, id } = await params;
  const l = await loadItem(req, type, id, 'Edit');
  if (!l.ok) return l.res;
  if (l.tool.type !== 'rfis') return NextResponse.json({ error: 'Only an RFI has an official answer.' }, { status: 400 });
  try {
    const body = (await req.json().catch(() => ({}))) as { entryId?: string; kind?: string; official?: boolean };
    const entryId = String(body.entryId || '');
    const kind = body.kind === 'response' ? 'response' : body.kind === 'comment' ? 'comment' : null;
    if (!entryId || !kind) return NextResponse.json({ error: 'entryId and kind are required' }, { status: 400 });
    if (body.official === false) {
      await clearOfficialAnswer(l.db, l.user.tenantId, l.item);
      return NextResponse.json({ ok: true, official: false });
    }
    const ok = await setOfficialAnswer(l.db, l.user.tenantId, l.item, { kind, id: entryId }, { by: l.user.email });
    if (!ok) return NextResponse.json({ error: 'That response is not on this RFI.' }, { status: 404 });
    runInBackground(async () => (await import('@/lib/triggers')).onRFIAnswered(id), 'onRFIAnswered (marked official)');
    return NextResponse.json({ ok: true, official: true });
  } catch (e) {
    return apiError(`items/${type}/comments`, e, "Couldn't change the official answer.");
  }
}
