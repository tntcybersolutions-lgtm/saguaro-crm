import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { apiError } from '@/lib/api-error';
import { gcSenderName } from '@/lib/sub-inbox';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST  /api/sub-portal/inbox/messages  { projectId, subId, content }
 *   The GC replies in a sub's thread. The sub reads it on their portal's
 *   Messages tab (portal_sub_messages, sender_type 'gc').
 * PATCH /api/sub-portal/inbox/messages  { ids: string[] }
 *   Marks the sub's messages read once the GC has opened the thread.
 */
export async function POST(req: NextRequest) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = (await req.json().catch(() => null)) as { projectId?: unknown; subId?: unknown; content?: unknown } | null;
    const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
    const subId = typeof body?.subId === 'string' ? body.subId : '';
    const content = typeof body?.content === 'string' ? body.content.trim().slice(0, 4000) : '';
    if (!UUID.test(projectId) || !UUID.test(subId)) return NextResponse.json({ error: 'projectId and subId are required' }, { status: 400 });
    if (!content) return NextResponse.json({ error: 'Type a message first.', field: 'content' }, { status: 400 });

    const db = createServerClient();
    // The job and the sub come from the browser: both must be this company's.
    const [{ data: job, error: jErr }, { data: sub, error: sErr }] = await Promise.all([
      db.from('projects').select('id').eq('id', projectId).eq('tenant_id', user.tenantId).maybeSingle(),
      db.from('subcontractors').select('id').eq('id', subId).eq('tenant_id', user.tenantId).maybeSingle(),
    ]);
    if (jErr) throw jErr;
    if (sErr) throw sErr;
    if (!job) return NextResponse.json({ error: 'That job is not one of this company\'s jobs.' }, { status: 404 });
    if (!sub) return NextResponse.json({ error: 'That sub is not one of this company\'s subs.' }, { status: 404 });

    const { data: message, error } = await db.from('portal_sub_messages').insert({
      tenant_id: user.tenantId, project_id: projectId, sub_id: subId,
      sender_name: await gcSenderName(db, user), sender_type: 'gc', content,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ message }, { status: 201 });
  } catch (e) {
    return apiError('sub-portal/inbox/messages', e, "Couldn't send the message. Please try again.");
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requirePermission(req, 'Projects', 'Edit');
  if (!gate.ok) return gate.res;
  const user = gate.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
    const ids = Array.isArray(body?.ids) ? body!.ids.filter((x): x is string => typeof x === 'string' && UUID.test(x)).slice(0, 500) : [];
    if (!ids.length) return NextResponse.json({ updated: 0 });
    const db = createServerClient();
    const { data, error } = await db.from('portal_sub_messages').update({ read_at: new Date().toISOString() })
      .eq('tenant_id', user.tenantId).eq('sender_type', 'sub').is('read_at', null).in('id', ids).select('id');
    if (error) throw error;
    return NextResponse.json({ updated: (data || []).length });
  } catch (e) {
    return apiError('sub-portal/inbox/messages', e, "Couldn't mark the messages read.");
  }
}
