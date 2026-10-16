import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * Append a field note to a subcontractor prequalification submission.
 * Called from app/field/prequalification/page.tsx (addNote).
 * Body: { id, author, text, created_at }  (a FieldNote object)
 *
 * The submissions table has no JSON notes array, so we append the note to the
 * text `notes` column as a timestamped entry. Offline-capable: the page enqueues
 * the write and updates local state optimistically, so it only needs a 2xx here.
 */
async function handle(
  req: NextRequest,
  { params }: { params: { projectId: string; id: string } }
) {
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;

  let author = 'Field Super';
  let text = '';
  let createdAt = new Date().toISOString();
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    author = String(body.author || author).trim() || 'Field Super';
    text = String(body.text || '').trim();
    createdAt = String(body.created_at || createdAt);
  } catch {
    /* safe default */
  }

  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  try {
    const db = createServerClient();

    // Read existing notes so we can append rather than clobber.
    const { data: existing } = await db
      .from('prequalification_submissions')
      .select('notes')
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId)
      .single();

    const prior = (existing?.notes as string | null) || '';
    const stamp = new Date(createdAt).toISOString();
    const entry = `[${stamp}] ${author}: ${text}`;
    const merged = prior ? `${prior}\n${entry}` : entry;

    const { error } = await db
      .from('prequalification_submissions')
      .update({ notes: merged, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;

    return NextResponse.json({ success: true, note: { author, text, created_at: stamp } });
  } catch (e) {
    return apiError('projects/[projectId]/prequalification/[id]/notes', e);
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: { projectId: string; id: string } }
) {
  return handle(req, ctx);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: { projectId: string; id: string } }
) {
  return handle(req, ctx);
}
