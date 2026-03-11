import { Resend } from 'resend';

const FROM = 'noreply@saguarocrm.com';

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function baseLayout(body: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Saguaro CRM</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#0D1116;padding:24px 32px;">
              <span style="color:#D5A017;font-size:22px;font-weight:700;letter-spacing:1px;">SAGUARO</span>
              <span style="color:#ffffff;font-size:14px;margin-left:8px;opacity:0.7;">Construction Intelligence</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f4f4f5;padding:16px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                &copy; ${new Date().getFullYear()} Saguaro CRM &mdash; All rights reserved.<br/>
                This email was sent automatically. Please do not reply directly to this message.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function btn(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;margin-top:24px;padding:12px 28px;background:#D5A017;color:#0D1116;font-weight:700;font-size:14px;text-decoration:none;border-radius:6px;">${label}</a>`;
}

function heading(text: string): string {
  return `<h2 style="margin:0 0 16px;color:#0D1116;font-size:20px;">${text}</h2>`;
}

function para(text: string): string {
  return `<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">${text}</p>`;
}

function detail(label: string, value: string): string {
  return `
  <tr>
    <td style="padding:8px 0;font-size:14px;color:#6b7280;width:160px;">${label}</td>
    <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:600;">${value}</td>
  </tr>`.trim();
}

function detailTable(rows: string): string {
  return `
  <table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
    ${rows}
  </table>`.trim();
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// ─── sendPayAppNotification ───────────────────────────────────────────────────

export async function sendPayAppNotification(
  to: string,
  projectName: string,
  appNumber: number,
  amount: number,
  pdfUrl: string,
): Promise<void> {
  try {
    const resend = getResend();
    if (!resend) return;

    const html = baseLayout(`
      ${heading(`Pay Application #${appNumber} — Review Required`)}
      ${para(`A pay application has been submitted for your review on <strong>${projectName}</strong>.`)}
      ${detailTable(`
        ${detail('Project', projectName)}
        ${detail('Application No.', `#${appNumber}`)}
        ${detail('Amount Due', formatCurrency(amount))}
      `)}
      ${para('Please review the attached application and certify or return with comments.')}
      ${btn('View Pay Application', pdfUrl)}
    `);

    await resend.emails.send({
      from: FROM,
      to,
      subject: `Pay Application #${appNumber} Submitted — ${projectName}`,
      html,
    });
  } catch (err) {
    console.error('[sendPayAppNotification] Failed to send email:', err);
  }
}

// ─── sendLienWaiverRequest ────────────────────────────────────────────────────

export async function sendLienWaiverRequest(
  to: string,
  subName: string,
  projectName: string,
  amount: number,
  throughDate: string,
  portalUrl: string,
): Promise<void> {
  try {
    const resend = getResend();
    if (!resend) return;

    const html = baseLayout(`
      ${heading('Lien Waiver Signature Required')}
      ${para(`Hello <strong>${subName}</strong>, a lien waiver has been requested for your work on <strong>${projectName}</strong>.`)}
      ${detailTable(`
        ${detail('Project', projectName)}
        ${detail('Waiver Amount', formatCurrency(amount))}
        ${detail('Through Date', throughDate)}
      `)}
      ${para('Please click the button below to review and sign your lien waiver through our secure portal.')}
      ${btn('Sign Lien Waiver', portalUrl)}
      ${para('<small style="color:#9ca3af;">This link is unique to you and expires in 30 days. Do not forward.</small>')}
    `);

    await resend.emails.send({
      from: FROM,
      to,
      subject: `Lien Waiver Required — ${projectName}`,
      html,
    });
  } catch (err) {
    console.error('[sendLienWaiverRequest] Failed to send email:', err);
  }
}

// ─── sendW9Request ────────────────────────────────────────────────────────────

export async function sendW9Request(
  to: string,
  vendorName: string,
  projectName: string,
  portalUrl: string,
): Promise<void> {
  try {
    const resend = getResend();
    if (!resend) return;

    const html = baseLayout(`
      ${heading('W-9 Form Requested')}
      ${para(`Hello <strong>${vendorName}</strong>, we need a completed W-9 form on file for your work on <strong>${projectName}</strong>.`)}
      ${para('A W-9 is required before we can process any payments to your company. Please complete the secure form at the link below — it only takes a few minutes.')}
      ${detailTable(`
        ${detail('Project', projectName)}
        ${detail('Requesting Party', 'Saguaro CRM')}
      `)}
      ${btn('Complete W-9 Form', portalUrl)}
      ${para('<small style="color:#9ca3af;">This link is secure and unique to your account. Your information is encrypted and stored safely.</small>')}
    `);

    await resend.emails.send({
      from: FROM,
      to,
      subject: `W-9 Form Required — ${projectName}`,
      html,
    });
  } catch (err) {
    console.error('[sendW9Request] Failed to send email:', err);
  }
}

// ─── sendInsuranceExpiring ────────────────────────────────────────────────────

export async function sendInsuranceExpiring(
  to: string,
  subName: string,
  projectName: string,
  expiryDate: string,
  daysLeft: number,
): Promise<void> {
  try {
    const resend = getResend();
    if (!resend) return;

    const urgency = daysLeft <= 7 ? 'URGENT: ' : '';
    const urgencyColor = daysLeft <= 7 ? '#dc2626' : '#D5A017';

    const html = baseLayout(`
      ${heading(`${urgency}Insurance Certificate Expiring Soon`)}
      <p style="margin:0 0 16px;padding:12px 16px;background:${urgencyColor}18;border-left:4px solid ${urgencyColor};border-radius:4px;font-size:14px;color:#374151;">
        <strong>${subName}</strong>'s certificate of insurance expires in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>.
      </p>
      ${detailTable(`
        ${detail('Subcontractor', subName)}
        ${detail('Project', projectName)}
        ${detail('Expiry Date', expiryDate)}
        ${detail('Days Remaining', String(daysLeft))}
      `)}
      ${para('Please upload an updated certificate of insurance as soon as possible to avoid work stoppages.')}
      ${btn('Upload Updated COI', `https://app.saguarocrm.com/insurance`)}
    `);

    await resend.emails.send({
      from: FROM,
      to,
      subject: `${urgency}Insurance Expiring in ${daysLeft} Days — ${subName} on ${projectName}`,
      html,
    });
  } catch (err) {
    console.error('[sendInsuranceExpiring] Failed to send email:', err);
  }
}

// ─── sendDocumentReady ────────────────────────────────────────────────────────

export async function sendDocumentReady(
  to: string,
  projectName: string,
  docType: string,
  pdfUrl: string,
): Promise<void> {
  try {
    const resend = getResend();
    if (!resend) return;

    const html = baseLayout(`
      ${heading(`${docType} Ready for Download`)}
      ${para(`Your <strong>${docType}</strong> for project <strong>${projectName}</strong> has been generated and is ready.`)}
      ${detailTable(`
        ${detail('Document', docType)}
        ${detail('Project', projectName)}
        ${detail('Generated', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}
      `)}
      ${para('Click the button below to download your document.')}
      ${btn('Download Document', pdfUrl)}
      ${para('<small style="color:#9ca3af;">This document link may expire. We recommend downloading and saving a local copy.</small>')}
    `);

    await resend.emails.send({
      from: FROM,
      to,
      subject: `${docType} Ready — ${projectName}`,
      html,
    });
  } catch (err) {
    console.error('[sendDocumentReady] Failed to send email:', err);
  }
}

// ─── Generic sendEmail (used by document-triggers and other callers) ──────────

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
}

export async function sendEmail(
  opts: EmailOptions
): Promise<{ id: string } | null> {
  if (!process.env.RESEND_API_KEY) {
    console.log(
      '[Email] RESEND_API_KEY not set \u2014 skipping send:',
      opts.subject,
      'to',
      opts.to
    );
    return null;
  }
  try {
    const resend = getResend();
    if (!resend) return null;
    const result = await resend.emails.send({
      from: opts.from || FROM,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
      replyTo: opts.replyTo,
    });
    return result.data;
  } catch (err) {
    console.error('[Email] Send failed:', err);
    return null;
  }
}

// ─── Template helpers used by document-triggers ──────────────────────────────

export function payAppSubmittedEmail(data: {
  ownerName: string;
  projectName: string;
  appNumber: number;
  amount: number;
  periodTo: string;
  downloadUrl: string;
}): string {
  return baseLayout(`
    ${heading(`Pay Application #${data.appNumber} Submitted`)}
    ${para(`Dear ${data.ownerName},`)}
    ${para(`A new Pay Application has been submitted for your review:`)}
    ${detailTable(`
      ${detail('Project', data.projectName)}
      ${detail('Application #', String(data.appNumber))}
      ${detail('Period Through', data.periodTo)}
      ${detail('Amount Due', formatCurrency(data.amount))}
    `)}
    ${btn('Review &amp; Download', data.downloadUrl)}
    ${para('<small style="color:#9ca3af;">This is an automated notification from Saguaro CRM.</small>')}
  `);
}

export function lienWaiverRequestEmail(data: {
  subName: string;
  projectName: string;
  waiverType: string;
  amount: number;
  portalUrl: string;
}): string {
  return baseLayout(`
    ${heading('Lien Waiver Request')}
    ${para(`Dear ${data.subName},`)}
    ${para(`Please sign and return a <strong>${data.waiverType.replace(/_/g, ' ').toUpperCase()}</strong> lien waiver for:`)}
    ${detailTable(`
      ${detail('Project', data.projectName)}
      ${detail('Amount', formatCurrency(data.amount))}
    `)}
    ${btn('Sign Lien Waiver', data.portalUrl)}
    ${para('<small style="color:#9ca3af;">Saguaro CRM &mdash; automated lien waiver request.</small>')}
  `);
}

export function trialExpiringEmail(data: {
  userName: string;
  daysLeft: number;
  upgradeUrl: string;
}): string {
  const urgencyColor = data.daysLeft <= 1 ? '#dc2626' : '#D5A017';
  return baseLayout(`
    <h2 style="margin:0 0 16px;color:${urgencyColor};font-size:20px;">
      Your Saguaro trial ends in ${data.daysLeft} day${data.daysLeft !== 1 ? 's' : ''}
    </h2>
    ${para(`Hi ${data.userName},`)}
    ${para(`Your Saguaro free trial ${data.daysLeft <= 0 ? 'has expired' : `expires in ${data.daysLeft} day${data.daysLeft !== 1 ? 's' : ''}`}. Upgrade now to keep access to all your projects, documents, and AI features.`)}
    ${btn('Upgrade Now &mdash; Keep Everything', data.upgradeUrl)}
    ${para('<small style="color:#9ca3af;">Questions? Reply to this email.</small>')}
  `);
}

export function welcomeEmail(data: {
  userName: string;
  companyName: string;
  loginUrl: string;
}): string {
  return baseLayout(`
    ${heading(`Welcome to Saguaro CRM, ${data.userName}!`)}
    ${para(`Your account for <strong>${data.companyName}</strong> is ready.`)}
    ${para('Here&rsquo;s what you can do right now:')}
    <ul style="color:#374151;font-size:14px;line-height:2.2;margin:16px 0;">
      <li>Upload a blueprint and get an AI-powered takeoff in minutes</li>
      <li>Create AIA G702/G703 pay applications with auto-calculated totals</li>
      <li>Autopilot monitors your projects 24/7 for risks and deadlines</li>
      <li>Manage RFIs, change orders, and lien waivers in one place</li>
    </ul>
    ${btn('Go to Your Dashboard &rarr;', data.loginUrl)}
  `);
}
