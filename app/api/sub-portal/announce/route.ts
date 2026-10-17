import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { createServerClient, getUser } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/email';
import type { Database } from '@/lib/database.types';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sub-portal/announce
 * Body: { subject, body, sentTo }
 *
 * 1. Emails the announcement to the selected sub portal users in the tenant.
 *    `sentTo` is either ['all'] (every sub) or a list of trade names (best-effort
 *    match against portal_users.role). If email isn't configured (RESEND_API_KEY
 *    missing) NOTHING is emailed and we say so honestly — never a phantom "sent".
 * 2. Persists the announcement so it shows up in the tenant's announcement
 *    history. There is no portal_announcements table, so an announcement is
 *    stored as one portal_messages row tagged sender_type='announcement' with the
 *    subject/recipients/counts in attachments (project-scoped message queries
 *    filter by project_id/session_id and never see these tenant-broadcast rows).
 *
 * Returns { success, sent, recipientCount, emailConfigured, announcement }.
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requirePermission(req, 'Projects', 'Full');
  if (!gate.ok) return gate.res;
  const user = gate.user;
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const subject: string = (payload?.subject || '').trim();
    const messageBody: string = (payload?.body || '').trim();
    const sentTo: string[] = Array.isArray(payload?.sentTo) ? payload.sentTo : ['all'];

    if (!subject || !messageBody) {
      return NextResponse.json({ error: 'subject and body are required' }, { status: 400 });
    }

    const db = createServerClient();

    // All sub portal users in this tenant.
    const { data: subs } = await db
      .from('portal_users')
      .select('email, name, company, role')
      .eq('tenant_id', user.tenantId)
      .eq('portal_type', 'sub');

    const all = (subs || []) as Array<Record<string, any>>;

    // Best-effort trade filter: if specific trades selected, match against role;
    // fall back to all subs so an announcement is never silently dropped.
    const allTrades = sentTo.includes('all') || sentTo.length === 0;
    let recipients = all;
    if (!allTrades) {
      const wanted = sentTo.map((t) => String(t).toLowerCase());
      const filtered = all.filter((u) =>
        wanted.some((w) => String(u.role || '').toLowerCase().includes(w)),
      );
      recipients = filtered.length > 0 ? filtered : all;
    }

    const emails = Array.from(
      new Set(recipients.map((u) => u.email).filter((e): e is string => !!e)),
    );

    const emailConfigured = !!process.env.RESEND_API_KEY;

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#374151;font-size:15px;line-height:1.6;">
      <h2 style="color:#0D1116;font-size:20px;margin:0 0 16px;">${subject}</h2>
      <p style="white-space:pre-wrap;margin:0;">${messageBody}</p>
    </div>`;

    // Only attempt sends when email is actually configured; sendEmail returns
    // null (no id) when RESEND_API_KEY is missing or the provider rejects — count
    // only real successes so `sent` is always the truth.
    let sent = 0;
    if (emailConfigured) {
      for (const to of emails) {
        try {
          const res = await sendEmail({ to, subject: `Announcement: ${subject}`, html });
          if (res && res.id) sent++;
        } catch (e) {
          console.error('[sub-portal/announce] send failed for', to, e);
        }
      }
    }

    // Persist the announcement to history.
    const nowIso = new Date().toISOString();
    let persistedId: string | null = null;
    let persistedAt: string = nowIso;
    try {
      const row: Database['public']['Tables']['portal_messages']['Insert'] = {
        tenant_id: user.tenantId,
        sender_name: user.email || 'GC',
        sender_type: 'announcement',
        content: messageBody,
        attachments: {
          kind: 'announcement',
          subject,
          sentTo,
          recipientCount: emails.length,
          emailedCount: sent,
        } as Database['public']['Tables']['portal_messages']['Insert']['attachments'],
        created_at: nowIso,
      };
      const { data: saved, error: saveErr } = await db
        .from('portal_messages')
        .insert(row)
        .select('id, created_at')
        .single();
      if (saveErr) throw saveErr;
      persistedId = (saved as any)?.id ?? null;
      persistedAt = (saved as any)?.created_at ?? nowIso;
    } catch (e) {
      console.error('[sub-portal/announce] persist failed', e);
    }

    const announcement = {
      id: persistedId || `ann_${Date.now()}`,
      subject,
      body: messageBody,
      sentDate: persistedAt,
      sentTo,
      sentBy: user.email || 'You',
    };

    return NextResponse.json({
      success: true,
      sent,
      recipientCount: emails.length,
      emailConfigured,
      persisted: !!persistedId,
      announcement,
    });
  } catch (err) {
    return apiError('sub-portal/announce POST', err);
  }
}
