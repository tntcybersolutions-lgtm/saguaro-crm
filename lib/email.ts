/**
 * lib/email.ts
 * Complete Saguaro Control Systems email system — all templates + Resend sender
 * Graceful fallback to console.log when RESEND_API_KEY is not set
 */
import { Resend } from 'resend';
import { currentComm, htmlToText, logComm } from '@/lib/comm-log';

// Fallbacks use the VERIFIED Resend domain (saguarocontrol.net). Prod sets EMAIL_FROM
// explicitly; these defaults just keep sends valid if the env var is ever missing.
const FROM = process.env.EMAIL_FROM || 'Saguaro Control Systems <noreply@saguarocontrol.net>';
/* The sending address (from EMAIL_FROM, verified in Resend). The display name is
   set here, not by the env var, so every email reads "Saguaro Control Systems"
   (or "<inviter> via Saguaro") instead of an internal name like "Saguaro CRM". */
const FROM_ADDRESS = (FROM.match(/<([^>]+)>/)?.[1] || FROM).trim();
const REPLY_TO = (process.env.EMAIL_REPLY_TO || '').trim() || undefined;
function fromWithName(name: string): string {
  return `${name.replace(/["<>\r\n]/g, '').trim() || 'Saguaro Control Systems'} <${FROM_ADDRESS}>`;
}

/** Optional per-email sender details that help mail land in the inbox. */
export type SendOptions = {
  /** Display name, e.g. "Robert Zilm via Saguaro". */
  fromName?: string;
  /** Where a reply goes (the person who triggered the email, when known). */
  replyTo?: string | null;
  /** Add a one-click unsubscribe header (alerts and reminders, not invites). */
  unsubscribe?: boolean;
};
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net';

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

// ─── HTML Template Helpers ────────────────────────────────────────────────────
function layout(body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Saguaro Control Systems</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:#0D1116;padding:22px 32px;">
  <span style="color:#FFE600;font-size:22px;font-weight:700;letter-spacing:1px;">SAGUARO</span>
  <span style="color:#fff;font-size:13px;margin-left:8px;opacity:0.65;">Construction Intelligence</span>
</td></tr>
<tr><td style="padding:32px;">${body}</td></tr>
<tr><td style="background:#f4f4f5;padding:16px 32px;border-top:1px solid #e5e7eb;">
  <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
    &copy; ${new Date().getFullYear()} Saguaro Control Systems &mdash; All rights reserved.<br>
    <a href="${APP_URL}/app/notification-settings" style="color:#9ca3af;">Email settings</a> &middot;
    <a href="${APP_URL}" style="color:#9ca3af;">saguarocontrol.net</a>
  </p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function h(text: string) {
  return `<h2 style="margin:0 0 16px;color:#0D1116;font-size:20px;">${text}</h2>`;
}
function p(text: string) {
  return `<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.65;">${text}</p>`;
}
function btn(label: string, url: string) {
  return `<a href="${url}" style="display:inline-block;margin-top:20px;padding:13px 30px;background:#FFE600;color:#0D1116;font-weight:700;font-size:14px;text-decoration:none;border-radius:6px;">${label}</a>`;
}
function row(label: string, value: string) {
  return `<tr><td style="padding:8px 0;font-size:13px;color:#6b7280;width:180px;">${label}</td><td style="padding:8px 0;font-size:13px;color:#111827;font-weight:600;">${value}</td></tr>`;
}
function table(rows: string) {
  return `<table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">${rows}</table>`;
}
function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

// ─── Core send function ───────────────────────────────────────────────────────
export type SendResult = { sent: boolean; error?: string };

/**
 * Returns whether the mail actually went out.
 *
 * This used to return void and swallow both failure modes — no RESEND_API_KEY,
 * and a rejected send — so a caller could report "invited 12 subcontractors"
 * when zero emails existed. That is worse than an error: the GC believes the
 * bids are coming and finds out at the deadline.
 *
 * Every helper below returns this result, so a caller that tells the user an
 * email went out can (and must) check it first.
 */
async function send(to: string | string[], subject: string, html: string, opts: SendOptions = {}): Promise<SendResult> {
  const result = await deliver(to, subject, html, opts);
  // When the caller said what this mail is about (lib/comm-log withComm), it
  // goes on the record — a bid jacket shows every email sent about it.
  if (currentComm()) {
    await logComm({
      to, subject, body: htmlToText(html),
      status: result.sent ? 'sent' : result.error === NOT_CONFIGURED ? 'not_sent' : 'failed',
      error: result.sent ? null : result.error ?? null,
    });
  }
  return result;
}

const NOT_CONFIGURED = 'Email is not configured on this deployment.';

async function deliver(to: string | string[], subject: string, html: string, opts: SendOptions = {}): Promise<SendResult> {
  const resend = getResend();
  if (!resend) {
    console.log(`[Email SKIPPED — no RESEND_API_KEY] To: ${to} | Subject: ${subject}`);
    return { sent: false, error: NOT_CONFIGURED };
  }
  try {
    /* Resend's SDK does not throw when the API refuses a send (bad address,
       unverified domain, rate limit) — it resolves with { error }. Awaiting it
       and returning sent:true reported every refused invitation, award notice
       and reminder as delivered. Read the error it hands back. */
    /* Inbox placement: a real display name, a reply-to a person can answer, a
       plain-text copy next to the HTML, and (for alerts) a one-click unsubscribe
       header. Gmail and Outlook weigh all four when deciding Inbox vs Spam. */
    const replyTo = (opts.replyTo || '').trim() || REPLY_TO;
    const { error } = await resend.emails.send({
      from: fromWithName(opts.fromName || 'Saguaro Control Systems'),
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: htmlToText(html),
      ...(replyTo ? { replyTo } : {}),
      ...(opts.unsubscribe
        ? { headers: { 'List-Unsubscribe': `<${APP_URL}/app/notification-settings>, <mailto:${FROM_ADDRESS}?subject=unsubscribe>` } }
        : {}),
    });
    if (error) {
      const msg = typeof error === 'string' ? error : (error as { message?: string }).message || 'Email provider rejected the send.';
      console.error('[Email] Send refused:', msg);
      return { sent: false, error: msg };
    }
    return { sent: true };
  } catch (err) {
    console.error('[Email] Send failed:', err);
    return { sent: false, error: err instanceof Error ? err.message : 'Send failed.' };
  }
}

// ─── All Email Functions ──────────────────────────────────────────────────────

/**
 * The email copy of an in-app notification (RFI submitted, pay app approved,
 * a teammate joined…). Before this, notifications only showed inside the app
 * and as phone pushes, so a GC who was not signed in heard nothing at all.
 */
export async function sendNotificationEmail(to: string, title: string, body: string, url: string): Promise<SendResult> {
  const safe = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  return send(to, title, layout(`
    ${h(safe(title))}
    ${body ? p(safe(body)) : ''}
    ${btn('Open in Saguaro →', url)}
  `), { unsubscribe: true });
}

export async function sendWelcome(to: string, name: string, company: string) {
  return send(to, `Welcome to Saguaro Control Systems, ${name}!`, layout(`
    ${h(`Welcome to Saguaro Control Systems, ${name}!`)}
    ${p(`Your account for <strong>${company}</strong> is ready. Here's what you can do right now:`)}
    <ul style="color:#374151;font-size:14px;line-height:2.2;margin:12px 0;">
      <li>Upload blueprints for instant AI takeoffs</li>
      <li>Generate AIA G702/G703 pay applications automatically</li>
      <li>Manage lien waivers, RFIs, and change orders in one place</li>
      <li>Score bid opportunities with AI win prediction</li>
    </ul>
    ${btn('Go to Your Dashboard →', `${APP_URL}/app`)}
  `));
}

export async function sendPayAppSubmitted(to: string, ownerName: string, projectName: string, appNumber: number, amount: number, pdfUrl: string) {
  return send(to, `Pay Application #${appNumber} Submitted — ${projectName}`, layout(`
    ${h(`Pay Application #${appNumber} Submitted`)}
    ${p(`Dear ${ownerName},`)}
    ${p(`A new Pay Application has been submitted on <strong>${projectName}</strong> and requires your review.`)}
    ${table(row('Project', projectName) + row('Application No.', `#${appNumber}`) + row('Amount Due', fmt(amount)))}
    ${p('Please review and certify or return with comments via the link below.')}
    ${btn('Review Pay Application', pdfUrl)}
  `));
}

export async function sendPayAppApproved(to: string, gcName: string, projectName: string, appNumber: number, amount: number) {
  return send(to, `Pay App #${appNumber} Approved — ${projectName}`, layout(`
    ${h(`Pay Application #${appNumber} Approved`)}
    ${p(`Your Pay Application has been approved by the owner.`)}
    ${table(row('Contractor', gcName) + row('Project', projectName) + row('App Number', `#${appNumber}`) + row('Certified Amount', fmt(amount)))}
    ${p('Conditional lien waivers have been automatically generated for your subcontractors.')}
    ${btn('View Pay Application', `${APP_URL}/app`)}
  `));
}

export async function sendPayAppCertified(to: string, gcName: string, projectName: string, amount: number, certDate: string) {
  return send(to, `Payment Certified — ${projectName}`, layout(`
    ${h('Payment Certified')}
    ${p(`Dear ${gcName}, your payment has been certified by the architect.`)}
    ${table(row('Project', projectName) + row('Certified Amount', fmt(amount)) + row('Certification Date', certDate))}
    ${btn('View Details', `${APP_URL}/app`)}
  `));
}

export async function sendLienWaiverRequest(to: string, subName: string, projectName: string, amount: number, portalUrl: string) {
  return send(to, `Lien Waiver Required — ${projectName}`, layout(`
    ${h('Lien Waiver Signature Required')}
    ${p(`Hello <strong>${subName}</strong>, a lien waiver is required for your work on <strong>${projectName}</strong>.`)}
    ${table(row('Project', projectName) + row('Waiver Amount', fmt(amount)))}
    ${p('Click below to review and sign your lien waiver through our secure portal.')}
    ${btn('Sign Lien Waiver', portalUrl)}
    ${p('<small style="color:#9ca3af;">This link is unique to you. Do not forward.</small>')}
  `));
}

export async function sendLienWaiverSigned(to: string, gcName: string, subName: string, projectName: string) {
  return send(to, `Lien Waiver Signed — ${subName} on ${projectName}`, layout(`
    ${h('Lien Waiver Signed')}
    ${p(`<strong>${subName}</strong> has signed and returned their lien waiver for <strong>${projectName}</strong>.`)}
    ${table(row('GC', gcName) + row('Subcontractor', subName) + row('Project', projectName))}
    ${btn('View Lien Waivers', `${APP_URL}/app`)}
  `));
}

export async function sendBidPackageCreated(to: string, gcName: string, projectName: string, tradeName: string, dueDate: string) {
  return send(to, `Bid Package Created — ${tradeName} — ${projectName}`, layout(`
    ${h('New Bid Package Created')}
    ${p(`A new bid package for <strong>${tradeName}</strong> has been created on <strong>${projectName}</strong>.`)}
    ${table(row('GC', gcName) + row('Project', projectName) + row('Trade', tradeName) + row('Due Date', dueDate))}
    ${p('The bid jacket PDF has been auto-generated and sub invitations are being sent.')}
    ${btn('View Bid Package', `${APP_URL}/app`)}
  `));
}

/** Returns whether the invitation actually reached the sub — the caller reports
 *  a count to the GC, and that count must not include mail that never sent. */
export async function sendSubInvitedToBid(to: string, subName: string, projectName: string, tradeName: string, dueDate: string, scopeSummary: string, portalUrl: string): Promise<SendResult> {
  return send(to, `Bid Invitation — ${tradeName} — ${projectName}`, layout(`
    ${h(`Bid Invitation: ${tradeName}`)}
    ${p(`Hello <strong>${subName}</strong>, you have been invited to bid on a project.`)}
    ${table(row('Project', projectName) + row('Trade', tradeName) + row('Bid Due Date', dueDate))}
    ${p(`<strong>Scope:</strong> ${scopeSummary}`)}
    ${p('Click below to access the bid package, download drawings, and submit your bid.')}
    ${btn('View Bid Package & Submit Bid', portalUrl)}
    ${p('<small style="color:#9ca3af;">You can decline this invitation through the portal if you are not interested.</small>')}
  `));
}

export async function sendBidSubmitted(to: string, gcName: string, subName: string, projectName: string, bidAmount: number) {
  return send(to, `New Bid Received — ${subName} — ${projectName}`, layout(`
    ${h('New Bid Submitted')}
    ${p(`<strong>${subName}</strong> has submitted a bid on <strong>${projectName}</strong>.`)}
    ${table(row('GC', gcName) + row('Subcontractor', subName) + row('Project', projectName) + row('Bid Amount', fmt(bidAmount)))}
    ${btn('View Bid', `${APP_URL}/app`)}
  `));
}

export async function sendBidAwarded(to: string, subName: string, projectName: string, amount: number, startDate: string): Promise<SendResult> {
  return send(to, `Bid Awarded — Congratulations! — ${projectName}`, layout(`
    ${h('🏆 Congratulations — Bid Awarded!')}
    ${p(`Dear <strong>${subName}</strong>, we are pleased to inform you that your bid has been selected for <strong>${projectName}</strong>.`)}
    ${table(row('Project', projectName) + row('Contract Amount', fmt(amount)) + row('Anticipated Start', startDate))}
    ${p('Our team will be in touch shortly with contract documents and next steps.')}
    ${btn('View Project Details', `${APP_URL}/app`)}
  `));
}

export async function sendBidNotAwarded(to: string, subName: string, projectName: string): Promise<SendResult> {
  return send(to, `Bid Result — ${projectName}`, layout(`
    ${h('Bid Result')}
    ${p(`Dear <strong>${subName}</strong>, thank you for submitting your bid on <strong>${projectName}</strong>.`)}
    ${p('After careful review, we have selected another subcontractor for this scope. We appreciate your time and look forward to working with you on future opportunities.')}
    ${btn('View Other Opportunities', `${APP_URL}/app`)}
  `));
}

export async function sendRFISubmitted(to: string, projectName: string, rfiNumber: number, subject: string, submittedBy: string) {
  return send(to, `RFI #${rfiNumber} Submitted — ${projectName}`, layout(`
    ${h(`RFI #${rfiNumber} Submitted`)}
    ${p(`A new Request for Information has been submitted and requires your response.`)}
    ${table(row('Project', projectName) + row('RFI Number', `#${rfiNumber}`) + row('Subject', subject) + row('Submitted By', submittedBy))}
    ${btn('View & Answer RFI', `${APP_URL}/app`)}
  `));
}

export async function sendRFIAnswered(to: string, submitterName: string, projectName: string, rfiNumber: number, answer: string) {
  return send(to, `RFI #${rfiNumber} Answered — ${projectName}`, layout(`
    ${h(`RFI #${rfiNumber} Answered`)}
    ${p(`Dear ${submitterName}, your RFI on <strong>${projectName}</strong> has been answered.`)}
    ${table(row('Project', projectName) + row('RFI Number', `#${rfiNumber}`) + row('Answer', answer.slice(0, 200)))}
    ${btn('View Full RFI Response', `${APP_URL}/app`)}
  `));
}

export async function sendChangeOrderApproved(to: string, projectName: string, coNumber: number, amount: number) {
  return send(to, `Change Order #${coNumber} Approved — ${projectName}`, layout(`
    ${h(`Change Order #${coNumber} Approved`)}
    ${p(`Change Order #${coNumber} has been approved. The contract sum has been updated accordingly.`)}
    ${table(row('Project', projectName) + row('CO Number', `#${coNumber}`) + row('Amount', fmt(amount)))}
    ${btn('View Change Order', `${APP_URL}/app`)}
  `));
}

export async function sendInsuranceExpiring(to: string, subName: string, projectName: string, policyType: string, expiryDate: string, daysLeft: number) {
  const urgent = daysLeft <= 7;
  return send(to, `${urgent ? 'URGENT: ' : ''}Insurance Expiring in ${daysLeft} Days — ${subName}`, layout(`
    ${h(`${urgent ? '⚠ URGENT: ' : ''}Insurance Certificate Expiring`)}
    <p style="margin:0 0 16px;padding:12px 16px;background:${urgent ? '#fef2f2' : '#fffbeb'};border-left:4px solid ${urgent ? '#FF3B30' : '#FFE600'};font-size:14px;color:#374151;">
      <strong>${subName}</strong>'s ${policyType} expires in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>.
    </p>
    ${table(row('Subcontractor', subName) + row('Project', projectName) + row('Policy Type', policyType) + row('Expiry Date', expiryDate) + row('Days Remaining', String(daysLeft)))}
    ${p('Please upload a renewed certificate immediately to avoid work stoppages.')}
    ${btn('Upload Renewed COI', `${APP_URL}/app`)}
  `));
}

export async function sendLienDeadlineReminder(
  to: string,
  recipientName: string,
  projectName: string,
  deadlineType: string,
  state: string,
  dueDate: string,
  daysLeft: number,
  link: string,
) {
  const urgent = daysLeft <= 7;
  const dueFmt = (() => {
    const d = new Date(dueDate + 'T00:00:00');
    return isNaN(d.getTime())
      ? dueDate
      : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  })();
  return send(to, `${urgent ? 'URGENT: ' : ''}Lien Deadline in ${daysLeft} Day${daysLeft !== 1 ? 's' : ''} — ${projectName}`, layout(`
    ${h(`${urgent ? 'URGENT: ' : ''}Lien Deadline Approaching`)}
    ${p(`Dear ${recipientName},`)}
    <p style="margin:0 0 16px;padding:12px 16px;background:${urgent ? '#fef2f2' : '#fffbeb'};border-left:4px solid ${urgent ? '#FF3B30' : '#FFE600'};font-size:14px;color:#374151;">
      The <strong>${deadlineType}</strong> deadline on <strong>${projectName}</strong> is due in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>. Missing a statutory lien deadline can forfeit your right to payment.
    </p>
    ${table(row('Project', projectName) + row('Deadline Type', deadlineType) + (state ? row('State', state) : '') + row('Due Date', dueFmt) + row('Days Remaining', String(daysLeft)))}
    ${p('Take action now to preserve your lien or bond claim rights.')}
    ${btn('View Lien Deadlines', link)}
  `));
}

/**
 * Email an invoice to its vendor.
 *
 * Like every helper here, this returns an HONEST result so the caller can
 * tell the user the truth: if email isn't configured, or Resend rejects the send,
 * `sent` is false with a human-readable `error`. Never report a phantom success.
 */
export async function sendInvoiceEmail(opts: {
  to: string;
  vendorName?: string | null;
  invoiceNumber: string;
  amountDue: number;
  dueDate?: string | null;
  description?: string | null;
  fromCompany?: string | null;
  viewUrl?: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    return {
      sent: false,
      error: 'Email delivery is not configured (RESEND_API_KEY is missing), so the invoice was not sent. Contact your administrator to enable email.',
    };
  }

  const { to, vendorName, invoiceNumber, amountDue, dueDate, description, fromCompany, viewUrl } = opts;
  if (!to) return { sent: false, error: 'No vendor email address on this invoice.' };

  const dueFmt = (() => {
    if (!dueDate) return '—';
    const d = new Date(dueDate);
    return isNaN(d.getTime())
      ? dueDate
      : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  })();

  const html = layout(`
    ${h(`Invoice ${invoiceNumber}`)}
    ${p(`Hello${vendorName ? ` <strong>${vendorName}</strong>` : ''},`)}
    ${p(`Please find your invoice details below${fromCompany ? ` from <strong>${fromCompany}</strong>` : ''}.`)}
    ${table(
      row('Invoice #', invoiceNumber) +
      (description ? row('Description', description) : '') +
      row('Amount Due', fmt(amountDue)) +
      row('Due Date', dueFmt),
    )}
    ${viewUrl ? btn('View Invoice', viewUrl) : ''}
    ${p('<small style="color:#9ca3af;">Please remit payment by the due date above. Reply to this email with any questions.</small>')}
  `);

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: `Invoice ${invoiceNumber} — ${fmt(amountDue)} due`,
      html,
    });
    if (error) {
      const msg = typeof error === 'string' ? error : (error as { message?: string })?.message ?? 'Email provider rejected the send.';
      return { sent: false, error: msg };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'Email send failed.' };
  }
}

/**
 * Project correspondence (letter / transmittal / notice / memo).
 *
 * The field correspondence composer used to say "Correspondence sent." while
 * only writing a row to the database — no message ever left the building. This
 * is the actual transmission, and like sendInvoiceEmail it reports HONESTLY:
 * `sent: false` with a readable reason when email is unconfigured or rejected,
 * so the composer can say "logged but not emailed" instead of "sent".
 */
/** Sends a correspondence email; on the record (lib/comm-log) when the caller set a context. */
export async function sendCorrespondenceEmail(opts: Parameters<typeof correspondenceEmail>[0]): ReturnType<typeof correspondenceEmail> {
  const res = await correspondenceEmail(opts);
  if (currentComm()) {
    await logComm({
      to: [...(opts.to || []), ...(opts.cc || [])].filter(Boolean),
      subject: opts.subject, body: String(opts.body || ''),
      status: res.sent ? 'sent' : /not configured/i.test(res.error || '') ? 'not_sent' : 'failed',
      error: res.sent ? null : res.error ?? null,
    });
  }
  return res;
}

async function correspondenceEmail(opts: {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  fromName?: string | null;
  replyTo?: string | null;
  correspondenceType?: string | null;
  projectName?: string | null;
  referenceNumber?: string | null;
}): Promise<{ sent: boolean; recipients: number; error?: string }> {
  const to = (opts.to || []).map((e) => String(e || '').trim()).filter(Boolean);
  const cc = (opts.cc || []).map((e) => String(e || '').trim()).filter(Boolean);
  if (to.length === 0) {
    return { sent: false, recipients: 0, error: 'No recipient email address on this correspondence.' };
  }

  const resend = getResend();
  if (!resend) {
    return {
      sent: false,
      recipients: 0,
      error: 'Email delivery is not configured (RESEND_API_KEY is missing), so nothing was transmitted. The correspondence is on the project record.',
    };
  }

  // The composer's body is plain text typed by a human — escape it, then keep
  // the author's line breaks.
  const escaped = String(opts.body || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

  const meta =
    (opts.correspondenceType ? row('Type', opts.correspondenceType) : '') +
    (opts.projectName ? row('Project', opts.projectName) : '') +
    (opts.referenceNumber ? row('Reference', opts.referenceNumber) : '');

  const html = layout(`
    ${h(opts.subject)}
    ${meta ? table(meta) : ''}
    ${p(escaped)}
    ${p(`<small style="color:#9ca3af;">Sent by ${opts.fromName || 'the project team'} via Saguaro Control Systems.</small>`)}
  `);

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      ...(cc.length ? { cc } : {}),
      subject: opts.subject,
      html,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    });
    if (error) {
      const msg = typeof error === 'string' ? error : (error as { message?: string }).message || 'Email provider rejected the send.';
      return { sent: false, recipients: 0, error: msg };
    }
    return { sent: true, recipients: to.length + cc.length };
  } catch (e) {
    return { sent: false, recipients: 0, error: e instanceof Error ? e.message : 'Email send failed.' };
  }
}

/**
 * Prequalification invitation.
 *
 * Sent to a subcontractor when a GC invites them to complete a prequal
 * questionnaire. Returns an HONEST result (like sendInvoiceEmail) so the caller
 * never reports a phantom "sent": if RESEND_API_KEY is missing or Resend rejects
 * the send, `sent` is false with a human-readable `error`. The invite row + token
 * are still created either way, so the admin can copy the portal link manually.
 */
export async function sendPrequalInvite(opts: {
  to: string;
  subName?: string | null;
  companyName: string;
  templateName?: string | null;
  portalUrl: string;
  isResend?: boolean;
}): Promise<{ sent: boolean; error?: string }> {
  const { to, subName, companyName, templateName, portalUrl, isResend } = opts;
  if (!to) return { sent: false, error: 'No subcontractor email address on this invite.' };

  const resend = getResend();
  if (!resend) {
    return {
      sent: false,
      error: 'Email delivery is not configured (RESEND_API_KEY is missing), so the invitation was not sent. You can copy the portal link and send it manually.',
    };
  }

  const greetName = subName || 'there';
  const subjectPrefix = isResend ? 'Reminder: ' : '';
  const html = layout(`
    <div style="background:#0D1116;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0;font-size:12px;color:#FFE600;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Subcontractor Prequalification</p>
      <h1 style="margin:6px 0 0;font-size:24px;font-weight:800;color:#ffffff;line-height:1.2;">${companyName} invites you to prequalify</h1>
    </div>
    ${p(`Hi <strong>${greetName}</strong>,`)}
    ${p(`<strong>${companyName}</strong> has invited your company to complete a prequalification questionnaire${templateName ? ` (<strong>${templateName}</strong>)` : ''}. Completing it lets us qualify you for upcoming bid opportunities.`)}
    <p style="margin:0 0 8px;font-size:14px;color:#374151;font-weight:600;">What you'll provide:</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">
      ${[
        'Company information and trade details',
        'Insurance, bonding, and safety records',
        'References and certifications',
      ].map(text => `<tr><td style="padding:5px 0;width:20px;font-size:14px;color:#2CFF7A;vertical-align:top;">&#10003;</td><td style="padding:5px 0;font-size:14px;color:#374151;">${text}</td></tr>`).join('')}
    </table>
    ${p('No account or password is required — the link below is unique to you.')}
    <a href="${portalUrl}" style="display:block;text-align:center;padding:16px 30px;background:#FFE600;color:#0D1116;font-weight:800;font-size:16px;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">
      Complete Prequalification &rarr;
    </a>
    ${p('<small style="color:#9ca3af;">This link is unique to your company. Please do not forward it.</small>')}
  `);

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: `${subjectPrefix}Prequalification Invitation — ${companyName}`,
      html,
    });
    if (error) {
      const msg = typeof error === 'string' ? error : (error as { message?: string })?.message ?? 'Email provider rejected the send.';
      return { sent: false, error: msg };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'Email send failed.' };
  }
}

export async function sendW9Request(to: string, vendorName: string, projectName: string, portalUrl: string) {
  return send(to, `W-9 Form Required — ${projectName}`, layout(`
    ${h('W-9 Tax Form Required')}
    ${p(`Hello <strong>${vendorName}</strong>, we need a completed W-9 form before we can process payments.`)}
    ${table(row('Project', projectName) + row('Required Before', 'First payment'))}
    ${p('Click below to securely complete your W-9 form online. It takes less than 5 minutes.')}
    ${btn('Complete W-9 Form', portalUrl)}
    ${p('<small style="color:#9ca3af;">Your information is encrypted and stored securely. We require W-9s for all vendors with payments exceeding $600.</small>')}
  `));
}

export async function sendSignatureRequest(opts: {
  to: string;
  signerName: string;
  senderName: string;
  docTitle: string;
  projectName: string;
  signUrl: string;
  message?: string;
}) {
  const note = opts.message
    ? p(`<em>&ldquo;${opts.message}&rdquo;</em>`)
    : '';
  return send(opts.to, `Signature requested: ${opts.docTitle}`, layout(`
    ${h('A document is waiting for your signature')}
    ${p(`Hello <strong>${opts.signerName}</strong>, ${opts.senderName} has sent you <strong>${opts.docTitle}</strong> to review and sign.`)}
    ${table(row('Document', opts.docTitle) + row('Project', opts.projectName) + row('Sent by', opts.senderName))}
    ${note}
    ${p('You can read the whole document before signing. Nothing is committed until you sign it.')}
    ${btn('Review and sign', opts.signUrl)}
    ${p('<small style="color:#9ca3af;">This link is unique to you and expires in 30 days. If you were not expecting it, you can ignore this message.</small>')}
  `));
}

/**
 * A proposal sent for e-signature (lib/proposal-esign). Built separately from
 * the send so the exact message can be rendered and checked without mailing
 * anyone. Every value that came from a person is escaped.
 */
export function proposalSignatureEmail(opts: {
  signerName: string;
  companyName: string;
  proposalTitle: string;
  amount: number;
  signUrl: string;
  expiresAt: string;
  message?: string | null;
}): { subject: string; html: string } {
  const esc = (t: string) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const company = esc(opts.companyName);
  const title = esc(opts.proposalTitle);
  const until = new Date(opts.expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const note = opts.message && opts.message.trim()
    ? p(`<em>&ldquo;${esc(opts.message.trim()).replace(/\n/g, '<br>')}&rdquo;</em>`)
    : '';
  return {
    subject: `${opts.companyName} sent you a proposal to sign: ${opts.proposalTitle}`.replace(/[\r\n]+/g, ' '),
    html: layout(`
    ${h('Your proposal is ready to review and sign')}
    ${p(`Hello <strong>${esc(opts.signerName)}</strong>, ${company} has sent you <strong>${title}</strong>.`)}
    ${table(row('Proposal', title) + row('Total', fmt(opts.amount)) + row('From', company) + row('Link valid until', until))}
    ${note}
    ${p('Read the whole proposal first. You can accept and sign it on your phone or computer, or decline it and tell them why. Nothing is committed until you sign.')}
    ${btn('Review and sign', opts.signUrl)}
    ${p('<small style="color:#9ca3af;">This link is unique to you. Do not forward it. If you were not expecting it, you can ignore this message.</small>')}
  `),
  };
}

export async function sendProposalSignatureRequest(opts: Parameters<typeof proposalSignatureEmail>[0] & { to: string; replyTo?: string | null }): Promise<SendResult> {
  const { subject, html } = proposalSignatureEmail(opts);
  return send(opts.to, subject, html, { fromName: `${opts.companyName} via Saguaro`, replyTo: opts.replyTo });
}

/** The PM-approved progress update to a homeowner (lib/owner-update). Text is
 *  the PM's, so it is escaped; blank lines become paragraphs, "- " lines bullets. */
export async function sendOwnerUpdate(opts: {
  to: string;
  clientName: string;
  companyName: string;
  projectName: string;
  title: string;
  body: string;
  portalUrl: string;
}): Promise<SendResult> {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const blocks = opts.body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => {
    const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.every((l) => /^[-•*]\s+/.test(l))) {
      return `<ul style="margin:0 0 12px;padding-left:20px;color:#374151;font-size:15px;line-height:1.65;">${lines.map((l) => `<li>${esc(l.replace(/^[-•*]\s+/, ''))}</li>`).join('')}</ul>`;
    }
    return p(esc(lines.join(' ')));
  }).join('');
  return send(opts.to, `${opts.projectName}: ${opts.title}`, layout(`
    ${h(esc(opts.title))}
    ${p(`Hello <strong>${esc(opts.clientName)}</strong>, here is the latest on <strong>${esc(opts.projectName)}</strong> from ${esc(opts.companyName)}.`)}
    ${blocks}
    ${btn('Open your project portal', opts.portalUrl)}
  `));
}

export async function sendTrialExpiring(to: string, userName: string, daysLeft: number, upgradeUrl: string) {
  const urgent = daysLeft <= 3;
  return send(to, `Your Saguaro trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`, layout(`
    <h2 style="margin:0 0 16px;color:${urgent ? '#FF3B30' : '#FFE600'};font-size:20px;">
      Your trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}
    </h2>
    ${p(`Hi ${userName},`)}
    ${p(`Your Saguaro free trial expires in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>. Upgrade now to keep all your projects, documents, and AI features.`)}
    ${p('Plans start at $499/month, flat — unlimited users, no per-seat fees. Lock in annual pricing before your trial ends.')}
    ${btn('Upgrade Now — Keep Everything', upgradeUrl)}
    ${p('<small style="color:#9ca3af;">Questions? Reply to this email and our team will help.</small>')}
  `));
}

/** Says whether the invitation email went out (the invite routes tell the GC). */
export async function sendInviteTeamMember(to: string, inviterName: string, companyName: string, role: string, acceptUrl: string, inviterEmail?: string | null): Promise<SendResult> {
  /* Sent as "<inviter> via Saguaro" with replies going to the inviter: a named
     person the recipient knows reads as trusted, not as bulk mail. */
  const viaName = inviterName && !inviterName.includes('@') ? `${inviterName} via Saguaro` : 'Saguaro Control Systems';
  /* Saguaro's own company is named "Saguaro Control Systems"; don't say it twice. */
  const onSaguaro = /saguaro/i.test(companyName) ? '' : ' on Saguaro';
  return send(to, `${inviterName && !inviterName.includes('@') ? inviterName : 'Your team'} invited you to join ${companyName}${onSaguaro}`, layout(`
    ${h(`You've been invited to join ${companyName}`)}
    ${p(`<strong>${inviterName}</strong> invited you to work on <strong>${companyName}</strong>'s jobs${onSaguaro}. Set a password and you're in.`)}
    ${table(row('Company', companyName) + row('Your Role', role) + row('Invited By', inviterName))}
    ${p('Saguaro Control Systems is a construction project management platform for GCs and subs — manage projects, documents, bids, and more.')}
    ${btn('Accept Invitation', acceptUrl)}
    ${p('<small style="color:#9ca3af;">This invitation expires in 7 days.</small>')}
  `), { fromName: viaName, replyTo: inviterEmail || null });
}

// ─── Portal Invite Emails ─────────────────────────────────────────────────────

/**
 * Sent to a client when a GC grants them portal access.
 * Replaces the "copy link manually" workflow — fires automatically on invite.
 */
export async function sendClientPortalInvite(opts: {
  to: string;
  clientName: string;
  gcCompanyName: string;
  projectName: string;
  portalUrl: string;
  expiresAt?: string | null;
  isResend?: boolean;
}): Promise<SendResult> {
  const { to, clientName, gcCompanyName, projectName, portalUrl, expiresAt, isResend } = opts;
  const subjectPrefix = isResend ? 'Reminder: ' : '';
  const expiryLine = expiresAt
    ? `<tr><td style="padding:8px 0;font-size:13px;color:#6b7280;width:180px;">Access Valid Until</td><td style="padding:8px 0;font-size:13px;color:#111827;font-weight:600;">${new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</td></tr>`
    : '';

  return send(to, `${subjectPrefix}Your Project Portal is Ready — ${projectName}`, layout(`
    <div style="background:#0D1116;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0;font-size:12px;color:#FFE600;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Client Portal Access</p>
      <h1 style="margin:6px 0 0;font-size:24px;font-weight:800;color:#ffffff;line-height:1.2;">${projectName}</h1>
      <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.55);">Managed by ${gcCompanyName}</p>
    </div>

    ${p(`Hi <strong>${clientName}</strong>,`)}
    ${p(`<strong>${gcCompanyName}</strong> has granted you access to your dedicated project portal for <strong>${projectName}</strong>. Your portal is ready — no password or account required.`)}

    <p style="margin:0 0 8px;font-size:14px;color:#374151;font-weight:600;">What you can do in your portal:</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">
      ${[
        ['✓', 'View live project status, schedule, and milestones'],
        ['✓', 'Approve change orders and pay applications digitally'],
        ['✓', 'See budget tracking and financial summaries in real time'],
        ['✓', 'Send and receive messages directly with your GC team'],
        ['✓', 'Download project documents and photos'],
        ['✓', 'Submit and track warranty claims after completion'],
      ].map(([icon, text]) => `<tr><td style="padding:5px 0;width:20px;font-size:14px;color:#2CFF7A;vertical-align:top;">${icon}</td><td style="padding:5px 0;font-size:14px;color:#374151;">${text}</td></tr>`).join('')}
    </table>

    <div style="margin:0 0 20px;">${table(
      row('Project', projectName) +
      row('General Contractor', gcCompanyName) +
      expiryLine
    )}</div>

    <a href="${portalUrl}" style="display:block;text-align:center;padding:16px 30px;background:#FFE600;color:#0D1116;font-weight:800;font-size:16px;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">
      Access Your Project Portal →
    </a>

    <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
      This link is unique to you. Bookmark it for easy access.<br>
      You can also log in any time at <a href="${APP_URL}/portals/client/login" style="color:#9ca3af;">${APP_URL.replace('https://', '')}/portals/client/login</a> using this email address.
    </p>
  `));
}

/**
 * Sent to a subcontractor when a GC grants them portal access.
 */
export async function sendSubPortalInvite(opts: {
  to: string;
  contactName: string;
  companyName: string;
  gcCompanyName: string;
  projectName: string;
  portalUrl: string;
  isResend?: boolean;
}): Promise<SendResult> {
  const { to, contactName, companyName, gcCompanyName, projectName, portalUrl, isResend } = opts;
  const subjectPrefix = isResend ? 'Reminder: ' : '';
  const displayName = contactName || companyName;

  return send(to, `${subjectPrefix}Subcontractor Portal Access — ${projectName}`, layout(`
    <div style="background:#0D1116;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0;font-size:12px;color:#FF8A00;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Subcontractor Portal Access</p>
      <h1 style="margin:6px 0 0;font-size:24px;font-weight:800;color:#ffffff;line-height:1.2;">${projectName}</h1>
      <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.55);">Managed by ${gcCompanyName}</p>
    </div>

    ${p(`Hi <strong>${displayName}</strong>,`)}
    ${p(`<strong>${gcCompanyName}</strong> has granted <strong>${companyName}</strong> access to the subcontractor portal for <strong>${projectName}</strong>. Manage everything from bids to pay apps — all in one place.`)}

    <p style="margin:0 0 8px;font-size:14px;color:#374151;font-weight:600;">Your portal includes:</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">
      ${[
        ['✓', 'View and respond to bid invitations with scope documents'],
        ['✓', 'Submit daily logs, crew counts, and site photos'],
        ['✓', 'Track your schedule and flag conflicts'],
        ['✓', 'Submit and track pay applications with line-item detail'],
        ['✓', 'Upload compliance documents — COI, bonds, licenses'],
        ['✓', 'View your performance scorecard and RFI tracking'],
      ].map(([icon, text]) => `<tr><td style="padding:5px 0;width:20px;font-size:14px;color:#FF8A00;vertical-align:top;">${icon}</td><td style="padding:5px 0;font-size:14px;color:#374151;">${text}</td></tr>`).join('')}
    </table>

    <div style="margin:0 0 20px;">${table(
      row('Project', projectName) +
      row('General Contractor', gcCompanyName) +
      row('Your Company', companyName)
    )}</div>

    <a href="${portalUrl}" style="display:block;text-align:center;padding:16px 30px;background:#FF8A00;color:#ffffff;font-weight:800;font-size:16px;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">
      Access Your Sub Portal →
    </a>

    <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
      This link is unique to your company. Do not forward.<br>
      You can also log in at <a href="${APP_URL}/portals/sub/login" style="color:#9ca3af;">${APP_URL.replace('https://', '')}/portals/sub/login</a> using this email address.
    </p>
  `));
}

// Re-export the existing specialized functions from send.ts
export {
  sendEmail,
  sendPayAppNotification,
  sendLienWaiverRequest as sendLienWaiverRequestLegacy,
  sendW9Request as sendW9RequestLegacy,
  sendInsuranceExpiring as sendInsuranceExpiringLegacy,
  sendDocumentReady,
  payAppSubmittedEmail,
  lienWaiverRequestEmail,
  trialExpiringEmail,
  welcomeEmail,
} from './email/send';
