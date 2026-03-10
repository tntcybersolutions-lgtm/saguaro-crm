/**
 * email-service.ts
 *
 * Saguaro CRM — Complete Transactional Email Engine
 *
 * Sends all outbound project emails via Resend.
 * Every event in the CRM that requires a notification routes through here.
 *
 * Events handled:
 *   BID         → sendBidInvitation, sendBidReceivedConfirmation, sendBidDueReminder
 *   AWARD       → sendAwardNotice, sendRejectionNotice
 *   CONTRACT    → sendContractForSignature, sendContractExecutedNotice
 *   RFI         → sendRfiTransmittal, sendRfiResponse, sendRfiOverdueNotice, sendRfiClosedNotice
 *   INVOICE     → sendInvoiceReceived, sendInvoiceOverdueNotice, sendPaymentConfirmation
 *   PUNCH LIST  → sendPunchListItemAssigned, sendPunchListReadyForReview
 *   SAFETY      → sendSafetyIncidentReport, sendSafetyCorrectiveActionDue
 *   AUTOPILOT   → sendAutopilotAlertDigest, sendCriticalAlertImmediate
 *   CHANGE ORDER→ sendChangeOrderCreated, sendChangeOrderApproved
 *
 * All functions are safe to call — they no-op with a console.warn if
 * RESEND_API_KEY is not configured, so development works without email.
 *
 * Usage:
 *   import { EmailService } from './email-service';
 *   await EmailService.sendBidInvitation({ ... });
 */

import { Resend } from 'resend';

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[EmailService] RESEND_API_KEY not set — email sending disabled.');
    return null;
  }
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM = process.env.EMAIL_FROM ?? 'Saguaro CRM <noreply@mail.saguarocrm.com>';
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? undefined;
const COMPANY = process.env.COMPANY_NAME ?? 'Saguaro CRM';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.saguarocrm.com';

// ─────────────────────────────────────────────────────────────────────────────
// HTML template helpers
// ─────────────────────────────────────────────────────────────────────────────

function baseLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; }
    .wrapper { max-width: 640px; margin: 32px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #1b3a5c; padding: 28px 36px; }
    .header h1 { margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
    .header p { margin: 4px 0 0; color: #a8c4e0; font-size: 13px; }
    .body { padding: 32px 36px; }
    .body p { margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #2d3748; }
    .body h2 { margin: 24px 0 8px; font-size: 16px; font-weight: 700; color: #1b3a5c; }
    .infobox { background: #f0f4f8; border-left: 4px solid #1b3a5c; border-radius: 4px; padding: 16px 20px; margin: 20px 0; }
    .infobox p { margin: 4px 0; font-size: 14px; color: #4a5568; }
    .infobox strong { color: #1b3a5c; }
    .btn { display: inline-block; margin: 20px 0 8px; padding: 13px 28px; background: #e07b39; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 600; }
    .alert-critical { border-left-color: #e53e3e; background: #fff5f5; }
    .alert-high     { border-left-color: #dd6b20; background: #fffaf0; }
    .alert-medium   { border-left-color: #d69e2e; background: #fffff0; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
    th { background: #1b3a5c; color: #fff; text-align: left; padding: 10px 12px; }
    td { padding: 9px 12px; border-bottom: 1px solid #e2e8f0; color: #2d3748; }
    tr:last-child td { border-bottom: none; }
    .footer { padding: 20px 36px; background: #f4f5f7; border-top: 1px solid #e2e8f0; text-align: center; }
    .footer p { margin: 0; font-size: 12px; color: #718096; }
    .footer a { color: #1b3a5c; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>${escHtml(COMPANY)}</h1>
      <p>Construction Intelligence Platform</p>
    </div>
    <div class="body">${body}</div>
    <div class="footer">
      <p>This email was sent by <a href="${APP_URL}">${escHtml(COMPANY)}</a> on behalf of your project team.</p>
      <p style="margin-top:6px">
        <a href="${APP_URL}/preferences">Manage email preferences</a> &nbsp;·&nbsp;
        <a href="${APP_URL}/unsubscribe">Unsubscribe</a>
      </p>
      <p style="margin-top:4px;font-size:11px;color:#a0aec0">
        ${escHtml(COMPANY)} · Phoenix, AZ · This message may contain project-sensitive information.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function actionLink(href: string, label: string): string {
  return `<a class="btn" href="${href}">${escHtml(label)}</a>`;
}

function infoBox(rows: [string, string][], alertClass = ''): string {
  const rowsHtml = rows
    .map(([k, v]) => `<p><strong>${escHtml(k)}:</strong> ${escHtml(v)}</p>`)
    .join('');
  return `<div class="infobox ${alertClass}">${rowsHtml}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core send helper
// ─────────────────────────────────────────────────────────────────────────────

async function send(opts: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<boolean> {
  const client = getResendClient();
  if (!client) return false;

  const toAddresses = Array.isArray(opts.to) ? opts.to : [opts.to];
  // Filter out blank/invalid addresses
  const validTo = toAddresses.filter((addr) => addr && addr.includes('@'));
  if (validTo.length === 0) {
    console.warn('[EmailService] No valid recipients — skipping send.');
    return false;
  }

  try {
    const { error } = await client.emails.send({
      from: FROM,
      to: validTo,
      replyTo: opts.replyTo ?? REPLY_TO,
      subject: opts.subject,
      html: opts.html,
    });

    if (error) {
      console.error('[EmailService] Send error:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[EmailService] Exception:', err instanceof Error ? err.message : err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BID INVITATION
// ─────────────────────────────────────────────────────────────────────────────

export type BidInvitationParams = {
  to: string;
  contactName: string;
  companyName: string;
  projectName: string;
  projectAddress: string;
  packageName: string;
  packageCode: string;
  bidDueDate: string;
  invitationLetter: string;        // AI-generated letter from bid jacket
  portalUrl: string;               // Link to subcontractor bid portal
  inviteToken?: string;
};

export async function sendBidInvitation(p: BidInvitationParams): Promise<boolean> {
  const html = baseLayout(
    `Bid Invitation: ${p.packageName}`,
    `
    <p>Dear ${escHtml(p.contactName || p.companyName)},</p>
    ${p.invitationLetter
      .split('\n\n')
      .map((para) => `<p>${escHtml(para.trim())}</p>`)
      .join('')}
    ${infoBox([
      ['Project', p.projectName],
      ['Location', p.projectAddress],
      ['Bid Package', `${p.packageCode} — ${p.packageName}`],
      ['Bid Due', p.bidDueDate],
    ])}
    ${actionLink(p.portalUrl, 'View Bid Package & Submit Bid')}
    <p style="color:#718096;font-size:13px;margin-top:8px;">
      If the button above does not work, copy and paste this link:<br/>
      <a href="${p.portalUrl}" style="color:#1b3a5c;">${p.portalUrl}</a>
    </p>
    `,
  );

  return send({
    to: p.to,
    subject: `Bid Invitation: ${p.packageName} — ${p.projectName}`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BID RECEIVED CONFIRMATION  (to the sub)
// ─────────────────────────────────────────────────────────────────────────────

export async function sendBidReceivedConfirmation(p: {
  to: string;
  contactName: string;
  projectName: string;
  packageName: string;
  submittedAt: string;
  totalAmount: number;
  gcEmail: string;
}): Promise<boolean> {
  const html = baseLayout(
    'Bid Received Confirmation',
    `
    <p>Dear ${escHtml(p.contactName)},</p>
    <p>Thank you — we have received your bid submission and it has been logged in our system.</p>
    ${infoBox([
      ['Project', p.projectName],
      ['Bid Package', p.packageName],
      ['Submitted', p.submittedAt],
      ['Total Bid Amount', `$${p.totalAmount.toLocaleString()}`],
    ])}
    <p>We will review all bids after the due date and notify you of the award decision.
    If you have questions, reply to this email or contact ${escHtml(p.gcEmail)}.</p>
    `,
  );

  return send({
    to: p.to,
    subject: `Bid Received: ${p.packageName} — ${p.projectName}`,
    html,
    replyTo: p.gcEmail,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BID DUE REMINDER  (to all invited subs who haven't submitted)
// ─────────────────────────────────────────────────────────────────────────────

export async function sendBidDueReminder(p: {
  to: string;
  contactName: string;
  projectName: string;
  packageName: string;
  bidDueDate: string;
  hoursRemaining: number;
  portalUrl: string;
}): Promise<boolean> {
  const html = baseLayout(
    `Reminder: Bid Due in ${p.hoursRemaining} Hours`,
    `
    <p>Dear ${escHtml(p.contactName)},</p>
    <p>This is a reminder that your bid submission for the following package is due soon.
    We have not yet received your bid.</p>
    ${infoBox([
      ['Project', p.projectName],
      ['Package', p.packageName],
      ['Due Date', p.bidDueDate],
      ['Time Remaining', `~${p.hoursRemaining} hours`],
    ])}
    ${actionLink(p.portalUrl, 'Submit Your Bid Now')}
    <p>If you have decided not to bid, please let us know so we can update our records.</p>
    `,
  );

  return send({
    to: p.to,
    subject: `Reminder: Bid Due in ${p.hoursRemaining}h — ${p.packageName}`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BID AWARD NOTICE  (to winning subcontractor)
// ─────────────────────────────────────────────────────────────────────────────

export async function sendAwardNotice(p: {
  to: string;
  contactName: string;
  companyName: string;
  projectName: string;
  packageName: string;
  contractNumber: string;
  awardedAmount: number;
  startDate: string;
  gcName: string;
  gcEmail: string;
  contractUrl?: string;
}): Promise<boolean> {
  const html = baseLayout(
    `Bid Award Notice — ${p.packageName}`,
    `
    <p>Dear ${escHtml(p.contactName)},</p>
    <p>Congratulations! ${escHtml(p.companyName)} has been selected for the following bid package.</p>
    ${infoBox([
      ['Project', p.projectName],
      ['Package', p.packageName],
      ['Contract Number', p.contractNumber],
      ['Awarded Amount', `$${p.awardedAmount.toLocaleString()}`],
      ['Anticipated Start', p.startDate],
      ['General Contractor', `${p.gcName} (${p.gcEmail})`],
    ])}
    <h2>Required Actions — Please Complete Within 5 Business Days</h2>
    <p>To keep your start date, please complete the following by <strong>${new Date(Date.now() + 5*86400000).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</strong>:</p>
    <p>☐ &nbsp;<strong>Step 1</strong> — Review and execute the subcontract agreement<br/>
       ☐ &nbsp;<strong>Step 2</strong> — Submit Certificate of Insurance naming GC and Owner as Additional Insured<br/>
       ☐ &nbsp;<strong>Step 3</strong> — Deliver Performance &amp; Payment Bond (if required by contract)<br/>
       ☐ &nbsp;<strong>Step 4</strong> — Submit contractor's license number and state registration<br/>
       ☐ &nbsp;<strong>Step 5</strong> — Confirm mobilization date and crew availability</p>
    ${p.contractUrl ? actionLink(p.contractUrl, '→ Review & Sign Contract Now') : ''}
    <p style="color:#718096;font-size:13px;margin-top:16px">Failure to return executed documents within 5 business days may result in award being rescinded. Contact ${escHtml(p.gcEmail)} with any questions.</p>
    `,
  );

  return send({
    to: p.to,
    subject: `Award Notice: ${p.packageName} — ${p.projectName}`,
    html,
    replyTo: p.gcEmail,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BID REJECTION NOTICE  (to non-awarded subcontractors)
// ─────────────────────────────────────────────────────────────────────────────

export async function sendRejectionNotice(p: {
  to: string;
  contactName: string;
  projectName: string;
  packageName: string;
  gcName: string;
  gcEmail: string;
}): Promise<boolean> {
  const html = baseLayout(
    `Bid Result: ${p.packageName}`,
    `
    <p>Dear ${escHtml(p.contactName)},</p>
    <p>Thank you for submitting a bid for the following package. After careful review
    we have selected another contractor for this scope of work.</p>
    ${infoBox([
      ['Project', p.projectName],
      ['Package', p.packageName],
    ])}
    <p>We appreciate the time you invested in preparing your bid and we hope to work
    together on future opportunities. We will keep your company in our qualified vendor
    database for upcoming projects.</p>
    <p>If you would like feedback on your submission, please contact
    ${escHtml(p.gcEmail)}.</p>
    `,
  );

  return send({
    to: p.to,
    subject: `Bid Result: ${p.packageName} — ${p.projectName}`,
    html,
    replyTo: p.gcEmail,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RFI TRANSMITTAL  (GC → Architect/Engineer)
// ─────────────────────────────────────────────────────────────────────────────

export async function sendRfiTransmittal(p: {
  to: string | string[];
  fromParty: string;
  projectName: string;
  rfiNumber: string;
  rfiTitle: string;
  rfiDescription: string;
  responseRequiredBy: string;
  transmittalNumber: string;
  rfiUrl?: string;
}): Promise<boolean> {
  const html = baseLayout(
    `RFI ${p.rfiNumber}: ${p.rfiTitle}`,
    `
    <p>Please find attached Request for Information (RFI) requiring your response.</p>
    ${infoBox([
      ['Project', p.projectName],
      ['RFI Number', p.rfiNumber],
      ['Transmittal', p.transmittalNumber],
      ['Subject', p.rfiTitle],
      ['From', p.fromParty],
      ['Response Required By', p.responseRequiredBy],
    ])}
    <h2>RFI Description</h2>
    ${p.rfiDescription
      .split('\n')
      .map((line) => `<p>${escHtml(line)}</p>`)
      .join('')}
    ${p.rfiUrl ? actionLink(p.rfiUrl, 'View & Respond to RFI') : ''}
    <p>Please confirm receipt and provide your response by the date indicated above.
    If an extension is required, contact us immediately.</p>
    `,
  );

  return send({
    to: p.to,
    subject: `RFI ${p.rfiNumber}: ${p.rfiTitle} — Response Required by ${p.responseRequiredBy}`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RFI RESPONSE  (Architect → GC team)
// ─────────────────────────────────────────────────────────────────────────────

export async function sendRfiResponse(p: {
  to: string | string[];
  projectName: string;
  rfiNumber: string;
  rfiTitle: string;
  responseBody: string;
  costImpactAmount?: number;
  scheduleImpactDays?: number;
  respondedBy: string;
  rfiUrl?: string;
}): Promise<boolean> {
  const impactRows: [string, string][] = [];
  if (p.costImpactAmount !== undefined && p.costImpactAmount !== 0) {
    impactRows.push([
      'Cost Impact',
      `${p.costImpactAmount >= 0 ? '+' : ''}$${Math.abs(p.costImpactAmount).toLocaleString()}`,
    ]);
  }
  if (p.scheduleImpactDays !== undefined && p.scheduleImpactDays !== 0) {
    impactRows.push([
      'Schedule Impact',
      `${p.scheduleImpactDays >= 0 ? '+' : ''}${p.scheduleImpactDays} calendar day(s)`,
    ]);
  }

  const alertClass =
    impactRows.length > 0
      ? p.costImpactAmount && Math.abs(p.costImpactAmount) > 10000
        ? 'alert-high'
        : 'alert-medium'
      : '';

  const html = baseLayout(
    `RFI Response: ${p.rfiNumber}`,
    `
    <p>A response has been received for the following RFI. Please review and take action.</p>
    ${infoBox([
      ['Project', p.projectName],
      ['RFI Number', p.rfiNumber],
      ['Subject', p.rfiTitle],
      ['Responded By', p.respondedBy],
    ])}
    <h2>Response</h2>
    ${p.responseBody
      .split('\n')
      .map((line) => `<p>${escHtml(line)}</p>`)
      .join('')}
    ${impactRows.length > 0 ? `<h2>Potential Impacts</h2>${infoBox(impactRows, alertClass)}` : ''}
    ${p.rfiUrl ? actionLink(p.rfiUrl, 'View Full RFI in Saguaro') : ''}
    <p>If this response affects cost or schedule, a Change Order may be required.
    Review with your project team and update the project records accordingly.</p>
    `,
  );

  return send({
    to: p.to,
    subject: `RFI Response Received: ${p.rfiNumber} — ${p.rfiTitle}`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RFI OVERDUE NOTICE
// ─────────────────────────────────────────────────────────────────────────────

export async function sendRfiOverdueNotice(p: {
  to: string | string[];
  projectName: string;
  rfiNumber: string;
  rfiTitle: string;
  overdueDays: number;
  responseRequiredBy: string;
  assignedTo?: string;
  rfiUrl?: string;
}): Promise<boolean> {
  const alertClass = p.overdueDays >= 8 ? 'alert-critical' : p.overdueDays >= 4 ? 'alert-high' : 'alert-medium';

  const html = baseLayout(
    `OVERDUE: RFI ${p.rfiNumber} — ${p.overdueDays} Days Past Due`,
    `
    <p><strong>Action Required:</strong> The following RFI is overdue and requires immediate attention.</p>
    ${infoBox([
      ['Project', p.projectName],
      ['RFI Number', p.rfiNumber],
      ['Subject', p.rfiTitle],
      ['Was Due', p.responseRequiredBy],
      ['Days Overdue', `${p.overdueDays} day(s)`],
      ...(p.assignedTo ? [['Assigned To', p.assignedTo] as [string, string]] : []),
    ], alertClass)}
    <p>Please follow up immediately with the responsible party and either obtain a response
    or formally request an extension in writing.</p>
    ${p.rfiUrl ? actionLink(p.rfiUrl, 'View RFI & Send Follow-Up') : ''}
    `,
  );

  return send({
    to: p.to,
    subject: `⚠️ OVERDUE RFI ${p.rfiNumber}: ${p.overdueDays} Days Past Due — ${p.projectName}`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RFI CLOSED NOTICE
// ─────────────────────────────────────────────────────────────────────────────

export async function sendRfiClosedNotice(p: {
  to: string | string[];
  projectName: string;
  rfiNumber: string;
  rfiTitle: string;
  closedBy?: string;
  rfiUrl?: string;
}): Promise<boolean> {
  const html = baseLayout(
    `RFI Closed: ${p.rfiNumber}`,
    `
    <p>The following RFI has been closed and archived in Saguaro.</p>
    ${infoBox([
      ['Project', p.projectName],
      ['RFI Number', p.rfiNumber],
      ['Subject', p.rfiTitle],
      ...(p.closedBy ? [['Closed By', p.closedBy] as [string, string]] : []),
    ])}
    ${p.rfiUrl ? actionLink(p.rfiUrl, 'View Closed RFI') : ''}
    `,
  );

  return send({
    to: p.to,
    subject: `RFI Closed: ${p.rfiNumber} — ${p.projectName}`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// INVOICE OVERDUE NOTICE
// ─────────────────────────────────────────────────────────────────────────────

export async function sendInvoiceOverdueNotice(p: {
  to: string | string[];
  projectName: string;
  invoiceNumber: string;
  vendorName: string;
  balanceDue: number;
  overdueDays: number;
  dueDate: string;
  invoiceUrl?: string;
}): Promise<boolean> {
  const alertClass = p.balanceDue >= 50000 || p.overdueDays >= 14 ? 'alert-critical' : 'alert-high';

  const html = baseLayout(
    `Invoice Overdue: ${p.invoiceNumber}`,
    `
    <p>The following invoice requires your immediate attention.</p>
    ${infoBox([
      ['Project', p.projectName],
      ['Invoice Number', p.invoiceNumber],
      ['Vendor / Subcontractor', p.vendorName],
      ['Balance Due', `$${p.balanceDue.toLocaleString()}`],
      ['Original Due Date', p.dueDate],
      ['Days Overdue', `${p.overdueDays} day(s)`],
    ], alertClass)}
    ${p.invoiceUrl ? actionLink(p.invoiceUrl, '→ Review Invoice &amp; Approve Payment') : ''}
    <p><strong>To pay this invoice:</strong> Log into Saguaro → Invoices → Approve &amp; Pay. ACH, check, or wire transfer accepted. Contact your AP team if payment has already been issued and confirm clearance.</p>
    <p style="color:#c92a2a;font-size:13px"><strong>Important:</strong> Unpaid invoices beyond 30 days may trigger mechanic's lien rights under state law. Resolving promptly protects the project from lien claims.</p>
    `,
  );

  return send({
    to: p.to,
    subject: `Invoice Overdue: ${p.invoiceNumber} — $${p.balanceDue.toLocaleString()} — ${p.overdueDays} Days Past Due`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE ORDER CREATED  (notifies architect + owner)
// ─────────────────────────────────────────────────────────────────────────────

export async function sendChangeOrderCreated(p: {
  to: string | string[];
  projectName: string;
  changeOrderNumber: string;
  description: string;
  costImpact: number;
  scheduleImpactDays: number;
  requestedBy: string;
  coUrl?: string;
}): Promise<boolean> {
  const alertClass = Math.abs(p.costImpact) > 25000 ? 'alert-high' : 'alert-medium';

  const html = baseLayout(
    `Change Order Submitted: ${p.changeOrderNumber}`,
    `
    <p>A Change Order has been submitted and requires your review and approval.</p>
    ${infoBox([
      ['Project', p.projectName],
      ['Change Order', p.changeOrderNumber],
      ['Description', p.description],
      ['Cost Impact', `${p.costImpact >= 0 ? '+' : ''}$${p.costImpact.toLocaleString()}`],
      ['Schedule Impact', `${p.scheduleImpactDays >= 0 ? '+' : ''}${p.scheduleImpactDays} calendar day(s)`],
      ['Requested By', p.requestedBy],
    ], alertClass)}
    ${p.coUrl ? actionLink(p.coUrl, 'Review & Approve Change Order') : ''}
    <p>Please review the supporting documentation and respond with your approval or rejection
    within 3 business days per contract requirements.</p>
    `,
  );

  return send({
    to: p.to,
    subject: `Change Order ${p.changeOrderNumber} Submitted: ${p.costImpact >= 0 ? '+' : ''}$${p.costImpact.toLocaleString()} — ${p.projectName}`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SAFETY INCIDENT REPORT  (immediate notice to project leadership)
// ─────────────────────────────────────────────────────────────────────────────

export async function sendSafetyIncidentReport(p: {
  to: string | string[];
  projectName: string;
  incidentNumber: string;
  incidentType: string;
  severity: string;
  incidentDate: string;
  location: string;
  description: string;
  reportedBy: string;
  oshaReportable: boolean;
  incidentUrl?: string;
}): Promise<boolean> {
  const alertClass =
    p.severity === 'critical' || p.incidentType === 'fatality'
      ? 'alert-critical'
      : p.severity === 'high'
      ? 'alert-high'
      : 'alert-medium';

  const html = baseLayout(
    `Safety Incident Report: ${p.incidentNumber}`,
    `
    ${p.oshaReportable ? '<p style="color:#e53e3e;font-weight:700;font-size:16px;">⚠️ THIS INCIDENT MAY BE OSHA REPORTABLE. Notify your safety officer immediately.</p>' : ''}
    <p>A safety incident has been reported and logged in Saguaro. Immediate review is required.</p>
    ${infoBox([
      ['Project', p.projectName],
      ['Incident Number', p.incidentNumber],
      ['Type', p.incidentType.replace(/_/g, ' ').toUpperCase()],
      ['Severity', p.severity.toUpperCase()],
      ['Date / Time', p.incidentDate],
      ['Location', p.location],
      ['Reported By', p.reportedBy],
      ['OSHA Reportable', p.oshaReportable ? 'YES — Action Required' : 'No'],
    ], alertClass)}
    <h2>Description</h2>
    ${p.description.split('\n').map((l) => `<p>${escHtml(l)}</p>`).join('')}
    ${p.incidentUrl ? actionLink(p.incidentUrl, 'View Full Incident Report') : ''}
    <p>Ensure corrective actions are documented and the incident investigation is initiated
    within 24 hours per your safety program requirements.</p>
    `,
  );

  return send({
    to: p.to,
    subject: `SAFETY INCIDENT — ${p.incidentType.replace(/_/g, ' ')} — ${p.projectName} [${p.incidentNumber}]`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTOPILOT CRITICAL ALERT  (immediate single-alert email)
// ─────────────────────────────────────────────────────────────────────────────

export async function sendCriticalAlertImmediate(p: {
  to: string | string[];
  projectName: string;
  alertTitle: string;
  alertSummary: string;
  severity: 'critical' | 'high';
  ruleCode: string;
  dashboardUrl?: string;
}): Promise<boolean> {
  const alertClass = p.severity === 'critical' ? 'alert-critical' : 'alert-high';

  const html = baseLayout(
    `${p.severity === 'critical' ? '🚨' : '⚠️'} ${p.alertTitle}`,
    `
    <p>Autopilot has detected a ${p.severity.toUpperCase()} risk condition on your project that requires immediate attention.</p>
    ${infoBox([
      ['Project', p.projectName],
      ['Alert', p.alertTitle],
      ['Severity', p.severity.toUpperCase()],
      ['Rule', p.ruleCode.replace(/_/g, ' ')],
    ], alertClass)}
    <h2>Details</h2>
    <p>${escHtml(p.alertSummary)}</p>
    ${p.dashboardUrl ? actionLink(p.dashboardUrl, 'View in Autopilot Dashboard') : ''}
    `,
  );

  return send({
    to: p.to,
    subject: `${p.severity === 'critical' ? '🚨 CRITICAL' : '⚠️ HIGH'}: ${p.alertTitle} — ${p.projectName}`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTOPILOT DAILY/WEEKLY DIGEST  (summary of all open alerts)
// ─────────────────────────────────────────────────────────────────────────────

export type AlertDigestItem = {
  projectName: string;
  title: string;
  summary: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  ruleCode: string;
};

export async function sendAutopilotAlertDigest(p: {
  to: string | string[];
  period: 'daily' | 'weekly';
  alerts: AlertDigestItem[];
  dashboardUrl?: string;
}): Promise<boolean> {
  if (p.alerts.length === 0) return true; // nothing to send

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...p.alerts].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
  );

  const badge = (s: string) => {
    const colors: Record<string, string> = {
      critical: '#e53e3e',
      high: '#dd6b20',
      medium: '#d69e2e',
      low: '#38a169',
    };
    return `<span style="background:${colors[s] ?? '#718096'};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;">${s.toUpperCase()}</span>`;
  };

  const rows = sorted
    .map(
      (a) => `<tr>
        <td>${badge(a.severity)}</td>
        <td>${escHtml(a.projectName)}</td>
        <td>${escHtml(a.title)}</td>
        <td style="color:#718096;font-size:13px;">${escHtml(a.summary)}</td>
      </tr>`,
    )
    .join('');

  const critCount = sorted.filter((a) => a.severity === 'critical').length;
  const highCount = sorted.filter((a) => a.severity === 'high').length;

  const html = baseLayout(
    `Autopilot ${p.period === 'daily' ? 'Daily' : 'Weekly'} Risk Summary`,
    `
    <p>Here is your ${p.period} Autopilot risk summary. ${p.alerts.length} active alert(s) detected across your projects.</p>
    ${infoBox([
      ['Total Active Alerts', String(p.alerts.length)],
      ['Critical', String(critCount)],
      ['High', String(highCount)],
    ], critCount > 0 ? 'alert-critical' : highCount > 0 ? 'alert-high' : '')}
    <table>
      <thead>
        <tr><th>Severity</th><th>Project</th><th>Alert</th><th>Summary</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${p.dashboardUrl ? actionLink(p.dashboardUrl, 'View Autopilot Dashboard') : ''}
    `,
  );

  const prefix = critCount > 0 ? '🚨' : highCount > 0 ? '⚠️' : '📋';

  return send({
    to: p.to,
    subject: `${prefix} Autopilot ${p.period === 'daily' ? 'Daily' : 'Weekly'} Summary: ${p.alerts.length} alert(s) — ${critCount} critical`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUNCH LIST ITEM ASSIGNED
// ─────────────────────────────────────────────────────────────────────────────

export async function sendPunchListItemAssigned(p: {
  to: string;
  contactName: string;
  projectName: string;
  itemNumber: string;
  description: string;
  location: string;
  priority: string;
  dueDate?: string;
  punchListUrl?: string;
}): Promise<boolean> {
  const alertClass = p.priority === 'critical' ? 'alert-critical' : p.priority === 'high' ? 'alert-high' : '';

  const html = baseLayout(
    `Punch List Item Assigned: ${p.itemNumber}`,
    `
    <p>Dear ${escHtml(p.contactName)},</p>
    <p>A punch list item has been assigned to you and requires your attention.</p>
    ${infoBox([
      ['Project', p.projectName],
      ['Item Number', p.itemNumber],
      ['Location', p.location],
      ['Priority', p.priority.toUpperCase()],
      ...(p.dueDate ? [['Due Date', p.dueDate] as [string, string]] : []),
    ], alertClass)}
    <h2>Description</h2>
    <p>${escHtml(p.description)}</p>
    ${p.punchListUrl ? actionLink(p.punchListUrl, 'View Punch List Item') : ''}
    <p>Once completed, mark the item as "Ready for Review" in Saguaro so the project manager
    can inspect and accept it.</p>
    `,
  );

  return send({
    to: p.to,
    subject: `Punch List ${p.itemNumber} Assigned — ${p.projectName} [${p.priority.toUpperCase()}]`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Namespace export for clean import usage
// ─────────────────────────────────────────────────────────────────────────────

export const EmailService = {
  sendBidInvitation,
  sendBidReceivedConfirmation,
  sendBidDueReminder,
  sendAwardNotice,
  sendRejectionNotice,
  sendRfiTransmittal,
  sendRfiResponse,
  sendRfiOverdueNotice,
  sendRfiClosedNotice,
  sendInvoiceOverdueNotice,
  sendChangeOrderCreated,
  sendSafetyIncidentReport,
  sendCriticalAlertImmediate,
  sendAutopilotAlertDigest,
  sendPunchListItemAssigned,
};
