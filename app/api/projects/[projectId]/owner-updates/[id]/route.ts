import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiError } from '@/lib/api-error';
import { sendOwnerUpdate } from '@/lib/email';
import { isOwnerUpdate, type OwnerUpdateData } from '@/lib/owner-update';

export const runtime = 'nodejs';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

/**
 * PATCH /api/projects/[projectId]/owner-updates/[id]
 *   { title, body }                  save the PM's edits to a draft
 *   { title, body, action: 'send' }  the PM approves: post it to the client
 *                                    portal (Updates + Messages) and email every
 *                                    client with active portal access
 * DELETE — discard a draft. A sent update stays (the client has it).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function load(db: any, tenantId: string, projectId: string, id: string) {
  const { data, error } = await db.from('portal_summaries').select('id, summary_data, created_at')
    .eq('id', id).eq('project_id', projectId).eq('tenant_id', tenantId).maybeSingle();
  if (error) throw error;
  return data && isOwnerUpdate(data.summary_data) ? { id: String(data.id), created_at: data.created_at as string, data: data.summary_data as OwnerUpdateData } : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit', { projectId });
  if (!g.ok) return g.res;
  const { db, user } = g;
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
  const text = typeof body.body === 'string' ? body.body.trim().slice(0, 4000) : '';
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });
  if (text.length < 10) return NextResponse.json({ error: 'body is required' }, { status: 400 });
  try {
    const cur = await load(db, user.tenantId, projectId, id);
    if (!cur) return NextResponse.json({ error: 'Update not found' }, { status: 404 });
    if (cur.data.status === 'sent') return NextResponse.json({ error: 'This update was already sent.' }, { status: 409 });
    const now = new Date().toISOString();

    if (body.action !== 'send') {
      const data: OwnerUpdateData = { ...cur.data, title, body: text };
      const { error } = await db.from('portal_summaries').update({ summary_data: data, last_updated: now }).eq('id', id).eq('tenant_id', user.tenantId);
      if (error) throw error;
      return NextResponse.json({ update: { id, created_at: cur.created_at, ...data } });
    }

    // ── Approve and send ──
    const [{ data: project, error: pErr }, { data: tenant }, { data: sessions, error: sErr }] = await Promise.all([
      db.from('projects').select('name').eq('id', projectId).eq('tenant_id', user.tenantId).maybeSingle(),
      db.from('tenants').select('name').eq('id', user.tenantId).maybeSingle(),
      db.from('portal_client_sessions').select('client_name, client_email, token, expires_at')
        .eq('project_id', projectId).eq('tenant_id', user.tenantId).eq('status', 'active'),
    ]);
    if (pErr) throw pErr;
    if (sErr) throw sErr;
    const companyName = String(tenant?.name || 'Your builder');
    const projectName = String(project?.name || 'your project');
    const live = (sessions || []).filter((s) => !s.expires_at || new Date(s.expires_at as string) > new Date());

    // Mark it sent first: it is what the portal shows, even if a mail bounces.
    const sent: OwnerUpdateData = { ...cur.data, title, body: text, status: 'sent', approved_by: user.email || null, sent_at: now, recipients: [] };
    const { data: claimed, error: uErr } = await db.from('portal_summaries')
      .update({ summary_data: sent, last_updated: now })
      .eq('id', id).eq('tenant_id', user.tenantId)
      .eq('summary_data->>status', 'draft') // two clicks can't send it twice
      .select('id');
    if (uErr) throw uErr;
    if (!claimed?.length) return NextResponse.json({ error: 'This update was already sent.' }, { status: 409 });

    const { error: mErr } = await db.from('portal_messages').insert({
      tenant_id: user.tenantId, project_id: projectId, sender_type: 'gc', sender_name: companyName, content: `${title}\n\n${text}`,
    });
    if (mErr) throw mErr;

    const emailed: string[] = [];
    const failed: string[] = [];
    for (const s of live) {
      const r = await sendOwnerUpdate({
        to: String(s.client_email), clientName: String(s.client_name || 'there'), companyName, projectName,
        title, body: text, portalUrl: `${APP_URL}/portals/client/${s.token}`,
      });
      (r.sent ? emailed : failed).push(String(s.client_email));
    }
    if (emailed.length) {
      const { error: rErr } = await db.from('portal_summaries').update({ summary_data: { ...sent, recipients: emailed } }).eq('id', id).eq('tenant_id', user.tenantId);
      if (rErr) throw rErr;
    }
    return NextResponse.json({ update: { id, created_at: cur.created_at, ...sent, recipients: emailed }, emailed: emailed.length, failed, portalClients: live.length });
  } catch (e) {
    return apiError('owner-updates', e, 'Could not save the update. Please try again.');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await params;
  const g = await requirePermission(req, 'Projects', 'Edit', { projectId });
  if (!g.ok) return g.res;
  try {
    const cur = await load(g.db, g.user.tenantId, projectId, id);
    if (!cur) return NextResponse.json({ error: 'Update not found' }, { status: 404 });
    if (cur.data.status === 'sent') return NextResponse.json({ error: 'A sent update cannot be deleted — your client has it.' }, { status: 409 });
    const { error } = await g.db.from('portal_summaries').delete().eq('id', id).eq('tenant_id', g.user.tenantId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError('owner-updates', e, 'Could not discard the draft.');
  }
}
