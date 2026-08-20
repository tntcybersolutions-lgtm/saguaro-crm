import { NextRequest, NextResponse } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const FROM = process.env.EMAIL_FROM || 'Saguaro CRM <noreply@saguarocontrol.net>';

interface Body {
  to: string;
  toName?: string;
  subject: string;
  docType: string;
  sourceType?: string;
  sourceId?: string;
  projectId?: string;
  htmlContent: string;
  message?: string;
  ccEmails?: string[];
}

/**
 * Strip <script> tags and hide .print-btn elements from user-supplied HTML
 * before embedding it into an outgoing email.
 */
function sanitizeForEmail(html: string): string {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  const hidePrintBtn = `<style>.print-btn,.no-print{display:none !important}</style>`;
  if (withoutScripts.toLowerCase().includes('</head>')) {
    return withoutScripts.replace(/<\/head>/i, `${hidePrintBtn}</head>`);
  }
  return `${hidePrintBtn}${withoutScripts}`;
}

function buildEmailHtml(body: Body): string {
  const msg = body.message
    ? `<div style="margin:0 0 18px;padding:14px 18px;background:#fffaec;border-left:4px solid #D4A017;border-radius:6px;font-size:14px;line-height:1.55;color:#222;">${body.message.replace(/\n/g, '<br/>')}</div>`
    : '';

  const wrapper = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${body.subject}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <div style="max-width:780px;margin:0 auto;padding:20px;">
    <div style="background:#0D1116;padding:14px 22px;border-radius:8px 8px 0 0;">
      <span style="color:#D4A017;font-size:18px;font-weight:800;letter-spacing:1px;">SAGUARO</span>
      <span style="color:#ffffff;font-size:13px;margin-left:8px;opacity:0.7;">Construction Intelligence</span>
    </div>
    <div style="background:#ffffff;padding:20px 22px;border-radius:0 0 8px 8px;">
      ${body.toName ? `<div style="font-size:14px;margin-bottom:10px;">Hi ${body.toName},</div>` : ''}
      ${msg}
      <div style="margin:10px 0 6px;font-size:12px;color:#888;">Document preview:</div>
      <div style="border:1px solid #ddd;border-radius:6px;padding:10px;overflow:auto;">
        ${sanitizeForEmail(body.htmlContent)}
      </div>
      <div style="margin-top:20px;font-size:11px;color:#999;">
        Sent via Saguaro CRM · ${new Date().toLocaleString()}
      </div>
    </div>
  </div>
</body></html>`;
  return wrapper;
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json() as Body;

    if (!body?.to)           return NextResponse.json({ error: 'to is required' }, { status: 400 });
    if (!body?.subject)      return NextResponse.json({ error: 'subject is required' }, { status: 400 });
    if (!body?.docType)      return NextResponse.json({ error: 'docType is required' }, { status: 400 });
    if (!body?.htmlContent)  return NextResponse.json({ error: 'htmlContent is required' }, { status: 400 });

    const key = process.env.RESEND_API_KEY;
    if (!key) {
      return NextResponse.json({ error: 'RESEND_API_KEY is not configured on the server' }, { status: 500 });
    }

    const resend = new Resend(key);
    const db = createServerClient();

    const emailHtml = buildEmailHtml(body);
    let emailId: string | null = null;
    let sendError: string | null = null;

    try {
      const sent = await resend.emails.send({
        from: FROM,
        to: body.to,
        cc: body.ccEmails && body.ccEmails.length > 0 ? body.ccEmails : undefined,
        subject: body.subject,
        html: emailHtml,
      });
      emailId = (sent as { data?: { id?: string } })?.data?.id || null;
    } catch (e) {
      sendError = e instanceof Error ? e.message : 'Unknown send error';
    }

    // Log to email_logs
    try {
      await db.from('email_logs').insert({
        tenant_id: user.tenantId,
        user_id: user.id,
        project_id: body.projectId || null,
        to_email: body.to,
        to_name: body.toName || null,
        cc_emails: body.ccEmails || null,
        subject: body.subject,
        doc_type: body.docType,
        source_type: body.sourceType || null,
        source_id: body.sourceId || null,
        status: sendError ? 'failed' : 'sent',
        error: sendError,
        provider_message_id: emailId,
        sent_at: new Date().toISOString(),
      });
    } catch { /* non-blocking */ }

    if (sendError) {
      return NextResponse.json({ success: false, error: sendError }, { status: 502 });
    }

    return NextResponse.json({ success: true, emailId, sentTo: body.to });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
