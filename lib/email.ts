/**
 * lib/email.ts
 * Complete Saguaro CRM email system — all templates + Resend sender
 * Graceful fallback to console.log when RESEND_API_KEY is not set
 */
import { Resend } from 'resend';

const FROM = process.env.EMAIL_FROM || 'Saguaro CRM <noreply@saguarocrm.com>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saguaro-crm-rho.vercel.app';

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

// ─── HTML Template Helpers ────────────────────────────────────────────────────
function layout(body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Saguaro CRM</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:#0D1116;padding:22px 32px;">
  <span style="color:#D4A017;font-size:22px;font-weight:700;letter-spacing:1px;">SAGUARO</span>
  <span style="color:#fff;font-size:13px;margin-left:8px;opacity:0.65;">Construction Intelligence</span>
</td></tr>
<tr><td style="padding:32px;">${body}</td></tr>
<tr><td style="background:#f4f4f5;padding:16px 32px;border-top:1px solid #e5e7eb;">
  <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
    &copy; ${new Date().getFullYear()} Saguaro CRM &mdash; All rights reserved.<br>
    <a href="${APP_URL}/unsubscribe" style="color:#9ca3af;">Unsubscribe</a> &middot;
    <a href="${APP_URL}" style="color:#9ca3af;">saguarocrm.com</a>
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
  return `<a href="${url}" style="display:inline-block;margin-top:20px;padding:13px 30px;background:#D4A017;color:#0D1116;font-weight:700;font-size:14px;text-decoration:none;border-radius:6px;">${label}</a>`;
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
async function send(to: string | string[], subject: string, html: string): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.log(`[Email SKIPPED — no RESEND_API_KEY] To: ${to} | Subject: ${subject}`);
    return;
  }
  try {
    await resend.emails.send({ from: FROM, to: Array.isArray(to) ? to : [to], subject, html });
  } catch (err) {
    console.error('[Email] Send failed:', err);
  }
}

// ─── All Email Functions ──────────────────────────────────────────────────────

export async function sendWelcome(to: string, name: string, company: string) {
  await send(to, `Welcome to Saguaro CRM, ${name}!`, layout(`
    ${h(`Welcome to Saguaro CRM, ${name}!`)}
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
  await send(to, `Pay Application #${appNumber} Submitted — ${projectName}`, layout(`
    ${h(`Pay Application #${appNumber} Submitted`)}
    ${p(`Dear ${ownerName},`)}
    ${p(`A new Pay Application has been submitted on <strong>${projectName}</strong> and requires your review.`)}
    ${table(row('Project', projectName) + row('Application No.', `#${appNumber}`) + row('Amount Due', fmt(amount)))}
    ${p('Please review and certify or return with comments via the link below.')}
    ${btn('Review Pay Application', pdfUrl)}
  `));
}

export async function sendPayAppApproved(to: string, gcName: string, projectName: string, appNumber: number, amount: number) {
  await send(to, `Pay App #${appNumber} Approved — ${projectName}`, layout(`
    ${h(`Pay Application #${appNumber} Approved`)}
    ${p(`Your Pay Application has been approved by the owner.`)}
    ${table(row('Contractor', gcName) + row('Project', projectName) + row('App Number', `#${appNumber}`) + row('Certified Amount', fmt(amount)))}
    ${p('Conditional lien waivers have been automatically generated for your subcontractors.')}
    ${btn('View Pay Application', `${APP_URL}/app`)}
  `));
}

export async function sendPayAppCertified(to: string, gcName: string, projectName: string, amount: number, certDate: string) {
  await send(to, `Payment Certified — ${projectName}`, layout(`
    ${h('Payment Certified')}
    ${p(`Dear ${gcName}, your payment has been certified by the architect.`)}
    ${table(row('Project', projectName) + row('Certified Amount', fmt(amount)) + row('Certification Date', certDate))}
    ${btn('View Details', `${APP_URL}/app`)}
  `));
}

export async function sendLienWaiverRequest(to: string, subName: string, projectName: string, amount: number, portalUrl: string) {
  await send(to, `Lien Waiver Required — ${projectName}`, layout(`
    ${h('Lien Waiver Signature Required')}
    ${p(`Hello <strong>${subName}</strong>, a lien waiver is required for your work on <strong>${projectName}</strong>.`)}
    ${table(row('Project', projectName) + row('Waiver Amount', fmt(amount)))}
    ${p('Click below to review and sign your lien waiver through our secure portal.')}
    ${btn('Sign Lien Waiver', portalUrl)}
    ${p('<small style="color:#9ca3af;">This link is unique to you. Do not forward.</small>')}
  `));
}

export async function sendLienWaiverSigned(to: string, gcName: string, subName: string, projectName: string) {
  await send(to, `Lien Waiver Signed — ${subName} on ${projectName}`, layout(`
    ${h('Lien Waiver Signed')}
    ${p(`<strong>${subName}</strong> has signed and returned their lien waiver for <strong>${projectName}</strong>.`)}
    ${table(row('GC', gcName) + row('Subcontractor', subName) + row('Project', projectName))}
    ${btn('View Lien Waivers', `${APP_URL}/app`)}
  `));
}

export async function sendBidPackageCreated(to: string, gcName: string, projectName: string, tradeName: string, dueDate: string) {
  await send(to, `Bid Package Created — ${tradeName} — ${projectName}`, layout(`
    ${h('New Bid Package Created')}
    ${p(`A new bid package for <strong>${tradeName}</strong> has been created on <strong>${projectName}</strong>.`)}
    ${table(row('GC', gcName) + row('Project', projectName) + row('Trade', tradeName) + row('Due Date', dueDate))}
    ${p('The bid jacket PDF has been auto-generated and sub invitations are being sent.')}
    ${btn('View Bid Package', `${APP_URL}/app`)}
  `));
}

export async function sendSubInvitedToBid(to: string, subName: string, projectName: string, tradeName: string, dueDate: string, scopeSummary: string, portalUrl: string) {
  await send(to, `Bid Invitation — ${tradeName} — ${projectName}`, layout(`
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
  await send(to, `New Bid Received — ${subName} — ${projectName}`, layout(`
    ${h('New Bid Submitted')}
    ${p(`<strong>${subName}</strong> has submitted a bid on <strong>${projectName}</strong>.`)}
    ${table(row('GC', gcName) + row('Subcontractor', subName) + row('Project', projectName) + row('Bid Amount', fmt(bidAmount)))}
    ${btn('View Bid', `${APP_URL}/app`)}
  `));
}

export async function sendBidAwarded(to: string, subName: string, projectName: string, amount: number, startDate: string) {
  await send(to, `Bid Awarded — Congratulations! — ${projectName}`, layout(`
    ${h('🏆 Congratulations — Bid Awarded!')}
    ${p(`Dear <strong>${subName}</strong>, we are pleased to inform you that your bid has been selected for <strong>${projectName}</strong>.`)}
    ${table(row('Project', projectName) + row('Contract Amount', fmt(amount)) + row('Anticipated Start', startDate))}
    ${p('Our team will be in touch shortly with contract documents and next steps.')}
    ${btn('View Project Details', `${APP_URL}/app`)}
  `));
}

export async function sendBidNotAwarded(to: string, subName: string, projectName: string) {
  await send(to, `Bid Result — ${projectName}`, layout(`
    ${h('Bid Result')}
    ${p(`Dear <strong>${subName}</strong>, thank you for submitting your bid on <strong>${projectName}</strong>.`)}
    ${p('After careful review, we have selected another subcontractor for this scope. We appreciate your time and look forward to working with you on future opportunities.')}
    ${btn('View Other Opportunities', `${APP_URL}/app`)}
  `));
}

export async function sendRFISubmitted(to: string, projectName: string, rfiNumber: number, subject: string, submittedBy: string) {
  await send(to, `RFI #${rfiNumber} Submitted — ${projectName}`, layout(`
    ${h(`RFI #${rfiNumber} Submitted`)}
    ${p(`A new Request for Information has been submitted and requires your response.`)}
    ${table(row('Project', projectName) + row('RFI Number', `#${rfiNumber}`) + row('Subject', subject) + row('Submitted By', submittedBy))}
    ${btn('View & Answer RFI', `${APP_URL}/app`)}
  `));
}

export async function sendRFIAnswered(to: string, submitterName: string, projectName: string, rfiNumber: number, answer: string) {
  await send(to, `RFI #${rfiNumber} Answered — ${projectName}`, layout(`
    ${h(`RFI #${rfiNumber} Answered`)}
    ${p(`Dear ${submitterName}, your RFI on <strong>${projectName}</strong> has been answered.`)}
    ${table(row('Project', projectName) + row('RFI Number', `#${rfiNumber}`) + row('Answer', answer.slice(0, 200)))}
    ${btn('View Full RFI Response', `${APP_URL}/app`)}
  `));
}

export async function sendChangeOrderApproved(to: string, projectName: string, coNumber: number, amount: number) {
  await send(to, `Change Order #${coNumber} Approved — ${projectName}`, layout(`
    ${h(`Change Order #${coNumber} Approved`)}
    ${p(`Change Order #${coNumber} has been approved. The contract sum has been updated accordingly.`)}
    ${table(row('Project', projectName) + row('CO Number', `#${coNumber}`) + row('Amount', fmt(amount)))}
    ${btn('View Change Order', `${APP_URL}/app`)}
  `));
}

export async function sendInsuranceExpiring(to: string, subName: string, projectName: string, policyType: string, expiryDate: string, daysLeft: number) {
  const urgent = daysLeft <= 7;
  await send(to, `${urgent ? 'URGENT: ' : ''}Insurance Expiring in ${daysLeft} Days — ${subName}`, layout(`
    ${h(`${urgent ? '⚠ URGENT: ' : ''}Insurance Certificate Expiring`)}
    <p style="margin:0 0 16px;padding:12px 16px;background:${urgent ? '#fef2f2' : '#fffbeb'};border-left:4px solid ${urgent ? '#dc2626' : '#D4A017'};font-size:14px;color:#374151;">
      <strong>${subName}</strong>'s ${policyType} expires in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>.
    </p>
    ${table(row('Subcontractor', subName) + row('Project', projectName) + row('Policy Type', policyType) + row('Expiry Date', expiryDate) + row('Days Remaining', String(daysLeft)))}
    ${p('Please upload a renewed certificate immediately to avoid work stoppages.')}
    ${btn('Upload Renewed COI', `${APP_URL}/app`)}
  `));
}

export async function sendW9Request(to: string, vendorName: string, projectName: string, portalUrl: string) {
  await send(to, `W-9 Form Required — ${projectName}`, layout(`
    ${h('W-9 Tax Form Required')}
    ${p(`Hello <strong>${vendorName}</strong>, we need a completed W-9 form before we can process payments.`)}
    ${table(row('Project', projectName) + row('Required Before', 'First payment'))}
    ${p('Click below to securely complete your W-9 form online. It takes less than 5 minutes.')}
    ${btn('Complete W-9 Form', portalUrl)}
    ${p('<small style="color:#9ca3af;">Your information is encrypted and stored securely. We require W-9s for all vendors with payments exceeding $600.</small>')}
  `));
}

export async function sendTrialExpiring(to: string, userName: string, daysLeft: number, upgradeUrl: string) {
  const urgent = daysLeft <= 3;
  await send(to, `Your Saguaro trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`, layout(`
    <h2 style="margin:0 0 16px;color:${urgent ? '#dc2626' : '#D4A017'};font-size:20px;">
      Your trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}
    </h2>
    ${p(`Hi ${userName},`)}
    ${p(`Your Saguaro free trial expires in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>. Upgrade now to keep all your projects, documents, and AI features.`)}
    ${p('Plans start at $199/month — save 30% when you upgrade before your trial ends.')}
    ${btn('Upgrade Now — Keep Everything', upgradeUrl)}
    ${p('<small style="color:#9ca3af;">Questions? Reply to this email and our team will help.</small>')}
  `));
}

export async function sendInviteTeamMember(to: string, inviterName: string, companyName: string, role: string, acceptUrl: string) {
  await send(to, `You're invited to join ${companyName} on Saguaro CRM`, layout(`
    ${h(`You've been invited to join ${companyName}`)}
    ${p(`<strong>${inviterName}</strong> has invited you to collaborate on <strong>${companyName}</strong>'s projects on Saguaro CRM.`)}
    ${table(row('Company', companyName) + row('Your Role', role) + row('Invited By', inviterName))}
    ${p('Saguaro CRM is a construction project management platform for GCs and subs — manage projects, documents, bids, and more.')}
    ${btn('Accept Invitation', acceptUrl)}
    ${p('<small style="color:#9ca3af;">This invitation expires in 7 days.</small>')}
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
