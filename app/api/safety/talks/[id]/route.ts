import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/** camel+snake tolerant: returns the first key present (even if null), else undefined. */
function pick(body: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (k in body) return body[k];
  return undefined;
}

// PATCH /api/safety/talks/{id}  -> { success, talk }
// Update a toolbox_talks row by id + tenant_id (real columns only).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Safety', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Real toolbox_talks columns only:
    // topic, presenter, talk_date, content, attendee_count, duration_minutes
    const updates: Record<string, unknown> = {};
    const topic           = pick(body, 'topic');
    const presenter       = pick(body, 'presenter');
    const talkDate        = pick(body, 'talk_date', 'talkDate', 'date');
    const content         = pick(body, 'content');
    const attendeeCount   = pick(body, 'attendee_count', 'attendeeCount');
    const durationMinutes = pick(body, 'duration_minutes', 'durationMinutes', 'duration');

    if (topic !== undefined)         updates.topic = topic;
    if (presenter !== undefined)     updates.presenter = presenter;
    if (talkDate !== undefined)      updates.talk_date = talkDate;
    if (content !== undefined)       updates.content = content;
    if (attendeeCount !== undefined) updates.attendee_count = attendeeCount != null ? Number(attendeeCount) : null;
    if (durationMinutes !== undefined) updates.duration_minutes = durationMinutes != null ? Number(durationMinutes) : null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    const db = createServerClient();
    const { data, error } = await db
      .from('toolbox_talks')
      .update(updates as any)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, talk: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('safety/talks/id', e);
  }
}

// DELETE /api/safety/talks/{id}  -> { success }
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requirePermission(req, 'Safety', 'Full');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const db = createServerClient();
    const { error } = await db
      .from('toolbox_talks')
      .delete()
      .eq('id', id)
      .eq('tenant_id', user.tenantId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError('safety/talks/id', e);
  }
}
