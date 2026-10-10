import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/permissions';
import { must } from '@/lib/db-write';
import { gcSenderName } from '@/lib/sub-inbox';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/sub-portal/inbox/rfis/:id  { answer }  |  { status: 'closed' | 'open' }
 *
 * Answer a sub's portal RFI. The sub sees the answer on their RFIs tab
 * (portal_sub_rfis.answer / answered_at). Editing an answer keeps the latest.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requirePermission(req, 'RFIs', 'Edit');
  if (!g.ok) return g.res;
  const user = g.user;
  try {
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: 'RFI id is not valid' }, { status: 400 });
    const body = (await req.json().catch(() => null)) as { answer?: unknown; status?: unknown } | null;
    const answer = typeof body?.answer === 'string' ? body.answer.trim().slice(0, 8000) : '';
    const status = body?.status === 'closed' || body?.status === 'open' ? body.status : null;
    if (!answer && !status) return NextResponse.json({ error: 'Type the answer first.', field: 'answer' }, { status: 400 });

    const db = createServerClient();
    const { data: rfi, error: rErr } = await db.from('portal_sub_rfis').select('id, project_id, sub_id, subject, answer')
      .eq('id', id).eq('tenant_id', user.tenantId).maybeSingle();
    if (rErr) throw rErr;
    if (!rfi) return NextResponse.json({ error: 'That RFI is not one of your subs\' RFIs.' }, { status: 404 });
    const row = rfi as Record<string, any>;

    const patch: Record<string, unknown> = answer
      ? { answer, status: status ?? 'answered', answered_at: new Date().toISOString() }
      : { status };
    const { data: updated, error: uErr } = await db.from('portal_sub_rfis').update(patch)
      .eq('id', id).eq('tenant_id', user.tenantId).select().single();
    if (uErr) throw uErr;

    const who = await gcSenderName(db, user);
    await must(db.from('portal_activity').insert({
      tenant_id: user.tenantId, project_id: row.project_id,
      action: answer ? 'rfi_answered' : `rfi_${status}`,
      description: answer ? `${who} answered "${String(row.subject || 'RFI').slice(0, 80)}"` : `${who} marked "${String(row.subject || 'RFI').slice(0, 80)}" ${status}`,
      metadata: { rfi_id: id, by: user.id, edited: !!(answer && row.answer) },
    } as never), 'portal_activity insert');

    return NextResponse.json({ rfi: updated });
  } catch (e) {
    return apiError('sub-portal/inbox/rfis', e, "Couldn't save the answer. Please try again.");
  }
}
