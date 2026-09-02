import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions';
import crypto from 'crypto';

import { apiError } from '@/lib/api-error';
import { must } from '@/lib/db-write';
export const runtime = 'nodejs';
/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX_ATTACH = 20 * 1024 * 1024; // don't email-attach beyond ~20MB (or video) — link instead

/**
 * File share hub. POST { fileId, channel, to?, message? } where channel is one of:
 *   link  → mint a durable, revocable share link (re-signs on each open)
 *   email → resend the file (attached if small, else linked) to `to`
 *   sms   → return an sms: deep link the client opens (no Twilio needed)
 *   slack / teams → POST the link to the tenant's configured Incoming Webhook
 * Slack/Teams require the tenant to have pasted a webhook URL in settings.
 */
export async function POST(req: NextRequest) {
  const g = await requirePermission(req, 'Documents', 'Edit');
  if (!g.ok) return g.res;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { fileId, channel = 'link', to, message } = await req.json();
    if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });
    const admin = createServerClient() as any;
    const { data: f } = await admin.from('project_files').select('*').eq('id', fileId).eq('tenant_id', user.tenantId).single();
    if (!f) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Mint (or reuse) a durable share token for this file.
    const token = 'fs_' + crypto.randomBytes(18).toString('hex');
    const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(); // 30-day link
    await must(admin.from('file_shares').insert({
      tenant_id: user.tenantId, file_id: fileId, token, channel,
      recipient: to || null, expires_at: expires, created_by: user.id,
    }), 'file_shares insert');
    const origin = new URL(req.url).origin;
    const shareUrl = `${origin}/api/files/shared/${token}`;
    const name = (f as any).file_name || 'file';

    if (channel === 'link') {
      return NextResponse.json({ ok: true, url: shareUrl });
    }

    if (channel === 'sms') {
      const body = encodeURIComponent(`${message ? message + ' ' : ''}${name}: ${shareUrl}`);
      return NextResponse.json({ ok: true, url: shareUrl, smsUrl: `sms:${to ? encodeURIComponent(to) : ''}?&body=${body}` });
    }

    if (channel === 'email') {
      if (!to) return NextResponse.json({ error: 'Recipient email required' }, { status: 400 });
      const { Resend } = await import('resend');
      const key = process.env.RESEND_API_KEY;
      const from = process.env.EMAIL_FROM || 'Saguaro Control Systems <noreply@saguarocrm.com>';
      const kind = (f as any).kind;
      const size = (f as any).file_size || 0;
      const attachments: any[] = [];
      if (key && kind !== 'video' && size > 0 && size <= MAX_ATTACH && (f as any).storage_path) {
        const { data: blob } = await admin.storage.from((f as any).storage_bucket || 'project-files').download((f as any).storage_path);
        if (blob) attachments.push({ filename: name, content: Buffer.from(await blob.arrayBuffer()) });
      }
      const html = `<div style="font-family:Arial,sans-serif;color:#111"><p>${(message || `${user.email} shared a file with you.`).replace(/</g, '&lt;')}</p>
        <p style="margin:16px 0"><a href="${shareUrl}" style="background:#D4A017;color:#0D1116;font-weight:700;padding:11px 20px;border-radius:6px;text-decoration:none">Open ${name}</a></p>
        ${attachments.length ? '<p style="color:#666;font-size:12px">The file is attached, and also available at the link above (valid 30 days).</p>' : '<p style="color:#666;font-size:12px">Link valid 30 days.</p>'}</div>`;
      if (!key) return NextResponse.json({ ok: true, url: shareUrl, warning: 'Email is not configured (no RESEND_API_KEY) — share link returned instead.' });
      const resend = new Resend(key);
      await resend.emails.send({ from, to: [to], subject: `${user.email} shared "${name}"`, html, attachments: attachments.length ? attachments : undefined });
      return NextResponse.json({ ok: true, url: shareUrl, emailed: to, attached: attachments.length > 0 });
    }

    if (channel === 'slack' || channel === 'teams') {
      const { data: t } = await admin.from('tenants').select('settings').eq('id', user.tenantId).single();
      const settings = ((t as any)?.settings) || {};
      const webhook = channel === 'slack' ? settings.slack_webhook_url : settings.teams_webhook_url;
      if (!webhook) return NextResponse.json({ error: `No ${channel} webhook configured. Add it in Settings → Integrations.`, needsWebhook: channel }, { status: 400 });
      const text = `${message ? message + '\n' : ''}📎 *${name}* — ${shareUrl}`;
      const payload = channel === 'slack'
        ? { text }
        : { '@type': 'MessageCard', '@context': 'http://schema.org/extensions', summary: `Shared file: ${name}`, themeColor: 'D4A017', title: `📎 ${name}`, text: `${message ? message + '  \n' : ''}[Open ${name}](${shareUrl})` };
      const r = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) return NextResponse.json({ error: `${channel} webhook rejected the message (HTTP ${r.status})` }, { status: 502 });
      return NextResponse.json({ ok: true, url: shareUrl, posted: channel });
    }

    return NextResponse.json({ error: 'Unknown channel' }, { status: 400 });
  } catch (err: any) {
    return apiError('files/share', err, "Share failed", 500);
  }
}
