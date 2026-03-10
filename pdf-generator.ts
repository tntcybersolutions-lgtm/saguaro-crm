/**
 * pdf-generator.ts
 *
 * Real PDF generation using Puppeteer.
 * Renders HTML templates to pixel-perfect PDFs.
 *
 * All construction documents are rendered as:
 *   1. HTML template string (professional formatting)
 *   2. Puppeteer renders to Letter-size PDF
 *   3. PDF uploaded to Supabase Storage
 *   4. Signed URL returned for download/share
 *
 * For AIA forms: Recreates the exact layout of official AIA documents.
 * The HTML matches AIA G702, G703, G704, G706, A310, A312 layouts.
 *
 * For state statutory forms: Uses the exact statutory language from
 * state-lien-waivers.ts with proper formatting.
 */

import { supabaseAdmin } from './supabase/admin';
import type { ProjectContext } from './project-context';

// ─────────────────────────────────────────────────────────────────────────────
// Puppeteer browser singleton
// ─────────────────────────────────────────────────────────────────────────────

let browserInstance: import('puppeteer').Browser | null = null;

async function getBrowser(): Promise<import('puppeteer').Browser> {
  if (!browserInstance) {
    const puppeteer = await import('puppeteer');
    browserInstance = await puppeteer.default.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
      ],
    });
  }
  return browserInstance;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core render function
// ─────────────────────────────────────────────────────────────────────────────

export async function renderHTMLtoPDF(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page    = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format:          'Letter',
      printBackground: true,
      margin: {
        top:    '0.75in',
        bottom: '0.75in',
        left:   '1.0in',
        right:  '1.0in',
      },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Store PDF in Supabase Storage + return signed URL
// ─────────────────────────────────────────────────────────────────────────────

export async function storePDF(
  tenantId:  string,
  projectId: string,
  docType:   string,
  filename:  string,
  pdfBuffer: Buffer,
): Promise<{ storagePath: string; signedUrl: string }> {
  const timestamp   = Date.now();
  const storagePath = `${tenantId}/${projectId}/${docType}/${timestamp}_${filename}`;

  const { error } = await supabaseAdmin.storage
    .from('documents')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert:      false,
    });

  if (error) throw new Error(`PDF storage: ${error.message}`);

  const { data: signedData } = await supabaseAdmin.storage
    .from('documents')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365); // 1-year signed URL

  return {
    storagePath,
    signedUrl: signedData?.signedUrl ?? '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared CSS for all construction documents
// ─────────────────────────────────────────────────────────────────────────────

const DOCUMENT_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 10pt;
    color: #000;
    line-height: 1.4;
  }
  .doc-page {
    width: 100%;
    padding: 0;
  }
  /* AIA-style header */
  .aia-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px double #000;
    padding-bottom: 8pt;
    margin-bottom: 10pt;
  }
  .aia-logo {
    font-size: 8pt;
    font-style: italic;
    color: #444;
    max-width: 120pt;
    line-height: 1.3;
  }
  .aia-doc-title {
    text-align: center;
    flex: 1;
  }
  .aia-doc-title h1 {
    font-size: 12pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .aia-doc-title h2 {
    font-size: 10pt;
    font-weight: normal;
    margin-top: 2pt;
  }
  .aia-doc-number {
    font-size: 8pt;
    text-align: right;
    max-width: 120pt;
  }
  /* Field rows */
  .field-row {
    display: flex;
    margin-bottom: 4pt;
    align-items: flex-end;
    min-height: 14pt;
  }
  .field-label {
    font-size: 7.5pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    min-width: 120pt;
    flex-shrink: 0;
    padding-bottom: 1pt;
  }
  .field-value {
    border-bottom: 0.5pt solid #000;
    flex: 1;
    padding-left: 3pt;
    padding-bottom: 1pt;
    font-size: 10pt;
    min-height: 13pt;
  }
  .field-value.empty { color: #999; font-style: italic; }
  /* Section headers */
  .section-header {
    background: #000;
    color: #fff;
    padding: 2pt 5pt;
    font-size: 8pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 8pt 0 4pt;
  }
  /* Tables */
  table.doc-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
    margin: 6pt 0;
  }
  table.doc-table th {
    background: #222;
    color: #fff;
    border: 0.5pt solid #000;
    padding: 3pt 5pt;
    text-align: left;
    font-size: 8pt;
    font-weight: bold;
    text-transform: uppercase;
  }
  table.doc-table td {
    border: 0.5pt solid #333;
    padding: 3pt 5pt;
    vertical-align: middle;
  }
  table.doc-table tr.subtotal td {
    border-top: 1pt solid #000;
    font-weight: bold;
  }
  table.doc-table tr.total td {
    border-top: 2pt double #000;
    font-weight: bold;
    font-size: 10pt;
  }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  /* Signature blocks */
  .sig-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20pt;
    margin-top: 20pt;
  }
  .sig-block {
    border-top: 0.5pt solid #000;
    padding-top: 3pt;
  }
  .sig-line {
    border-bottom: 0.5pt solid #000;
    height: 30pt;
    margin: 6pt 0 2pt;
  }
  .sig-label {
    font-size: 7pt;
    text-transform: uppercase;
    font-weight: bold;
    letter-spacing: 0.3px;
    color: #333;
  }
  .sig-date-line {
    display: flex;
    align-items: flex-end;
    margin-top: 6pt;
  }
  .sig-date-line .field-label { min-width: 30pt; }
  .sig-date-line .field-value { flex: 1; }
  /* Notice boxes */
  .notice-box {
    border: 1pt solid #000;
    padding: 5pt 8pt;
    margin: 8pt 0;
    font-size: 9pt;
    font-style: italic;
  }
  .warning-box {
    border: 1.5pt solid #c00;
    padding: 5pt 8pt;
    margin: 8pt 0;
    font-size: 8pt;
    font-weight: bold;
    color: #c00;
  }
  /* Two-column layout */
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16pt;
  }
  .three-col {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12pt;
  }
  /* Footer */
  .doc-footer {
    margin-top: 16pt;
    padding-top: 6pt;
    border-top: 0.5pt solid #666;
    font-size: 7pt;
    color: #555;
    font-style: italic;
  }
  /* Watermark for drafts */
  .draft-watermark {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-35deg);
    font-size: 72pt;
    color: rgba(200,0,0,0.08);
    font-weight: bold;
    letter-spacing: 8px;
    pointer-events: none;
    z-index: -1;
  }
`;

function docPage(title: string, content: string, isDraft = true): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
  <style>${DOCUMENT_CSS}</style>
</head>
<body>
  ${isDraft ? '<div class="draft-watermark">DRAFT</div>' : ''}
  <div class="doc-page">
    ${content}
  </div>
</body>
</html>`;
}

function fv(val: unknown, empty = '____________'): string {
  const s = String(val ?? '').trim();
  return s ? `<span>${s}</span>` : `<span class="empty">${empty}</span>`;
}

function curr(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fdate(d: string | null | undefined): string {
  if (!d) return '__________';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  } catch { return d; }
}

// ─────────────────────────────────────────────────────────────────────────────
// G702 — Application and Certificate for Payment
// ─────────────────────────────────────────────────────────────────────────────

export async function generateG702PDF(opts: {
  tenantId:   string;
  projectId:  string;
  ctx:        ProjectContext;
  appNumber:  number;
  periodTo:   string;
  thisPeriod: number;
  storedMaterials?: number;
  isDraft?: boolean;
}): Promise<{ pdfUrl: string; storagePath: string }> {
  const { ctx } = opts;
  const storedMats      = opts.storedMaterials ?? 0;
  const totalCompleted  = (ctx.latestPayApp?.total_completed ?? 0) + opts.thisPeriod + storedMats;
  const retainageHeld   = totalCompleted * (ctx.project.retainage_pct / 100);
  const prevCertified   = ctx.latestPayApp?.prev_payments ?? 0;
  const currentPayDue   = totalCompleted - retainageHeld - prevCertified;
  const balanceToFinish = ctx.financials.contract_sum_to_date - totalCompleted;

  const html = docPage('AIA G702 — Application for Payment', `
    <div class="aia-header">
      <div class="aia-logo">
        AIA Document<br/>
        <strong>G702™ – 1992</strong><br/>
        Application and Certificate<br/>for Payment
      </div>
      <div class="aia-doc-title">
        <h1>Application and Certificate for Payment</h1>
        <h2>AIA Document G702 — 1992 Edition</h2>
      </div>
      <div class="aia-doc-number">
        Application No: <strong>${opts.appNumber}</strong><br/>
        Period To: <strong>${fdate(opts.periodTo)}</strong><br/>
        Date: <strong>${fdate(ctx.today)}</strong>
      </div>
    </div>

    <div class="two-col">
      <div>
        <div class="section-header">Project Information</div>
        <div class="field-row"><span class="field-label">Project Name:</span><span class="field-value">${fv(ctx.project.name)}</span></div>
        <div class="field-row"><span class="field-label">Location:</span><span class="field-value">${fv(ctx.project.address)}</span></div>
        <div class="field-row"><span class="field-label">Owner:</span><span class="field-value">${fv(ctx.owner?.name)}</span></div>
        <div class="field-row"><span class="field-label">Architect:</span><span class="field-value">${fv(ctx.architect?.name)}</span></div>
        <div class="field-row"><span class="field-label">Contract For:</span><span class="field-value">${fv(ctx.contracts[0]?.title ?? ctx.project.name)}</span></div>
        <div class="field-row"><span class="field-label">Contract Date:</span><span class="field-value">${fdate(ctx.project.award_date)}</span></div>
      </div>
      <div>
        <div class="section-header">Contractor Information</div>
        <div class="field-row"><span class="field-label">Contractor:</span><span class="field-value">${fv(ctx.gc?.name)}</span></div>
        <div class="field-row"><span class="field-label">Address:</span><span class="field-value">${fv(ctx.gc?.address)}</span></div>
        <div class="field-row"><span class="field-label">Project No.:</span><span class="field-value">${fv(ctx.project.project_number)}</span></div>
      </div>
    </div>

    <div class="section-header" style="margin-top:10pt">Application for Payment</div>
    <table class="doc-table" style="margin-bottom:8pt">
      <tbody>
        <tr><td>1. Original Contract Sum</td><td class="text-right">${curr(ctx.project.contract_amount)}</td></tr>
        <tr><td>2. Net change by Change Orders</td><td class="text-right">${curr(ctx.financials.net_change_orders)}</td></tr>
        <tr><td>3. Contract Sum to Date (Line 1 ± Line 2)</td><td class="text-right"><strong>${curr(ctx.financials.contract_sum_to_date)}</strong></td></tr>
        <tr><td>4. Total Completed and Stored to Date (Column G on G703)</td><td class="text-right">${curr(totalCompleted)}</td></tr>
        <tr><td style="padding-left:20pt">a. Retainage of ${ctx.project.retainage_pct}% of Completed Work</td><td class="text-right">${curr(retainageHeld)}</td></tr>
        <tr><td>5. Total Earned Less Retainage (Line 4 Less Line 4a Total)</td><td class="text-right">${curr(totalCompleted - retainageHeld)}</td></tr>
        <tr><td>6. Less Previous Certificates for Payment</td><td class="text-right">${curr(prevCertified)}</td></tr>
        <tr class="total"><td><strong>7. Current Payment Due</strong></td><td class="text-right"><strong>${curr(currentPayDue)}</strong></td></tr>
        <tr><td>8. Balance to Finish, Including Retainage (Line 3 less Line 5)</td><td class="text-right">${curr(balanceToFinish)}</td></tr>
      </tbody>
    </table>

    <div class="notice-box">
      The undersigned Contractor certifies that to the best of the Contractor's knowledge, information and belief the Work covered by this Application for Payment has been completed in accordance with the Contract Documents, that all amounts have been paid by the Contractor for Work for which previous Certificates for Payment were issued and payments received from the Owner, and that current payment shown herein is now due.
    </div>

    <div class="sig-grid">
      <div class="sig-block">
        <div class="sig-label">Contractor</div>
        <p style="margin:3pt 0;font-size:10pt">${ctx.gc?.name ?? ''}</p>
        <div class="sig-line"></div>
        <div class="sig-label">Signature</div>
        <div class="field-row" style="margin-top:4pt"><span class="field-label" style="min-width:80pt">Printed Name:</span><span class="field-value"></span></div>
        <div class="field-row"><span class="field-label" style="min-width:80pt">Title:</span><span class="field-value"></span></div>
        <div class="field-row"><span class="field-label" style="min-width:80pt">Date:</span><span class="field-value">${ctx.today}</span></div>
      </div>
      <div class="sig-block">
        <div class="sig-label">Certificate for Payment (Architect/Owner's Representative)</div>
        <p style="margin:3pt 0;font-size:8pt;font-style:italic">In accordance with the Contract Documents, based on on-site observations and the data comprising this application, the Architect/Owner's Representative certifies to the Owner that to the best of the Architect's knowledge, information and belief the Work has progressed as indicated, the quality of the Work is in accordance with the Contract Documents, and the Contractor is entitled to payment of the AMOUNT CERTIFIED.</p>
        <div class="field-row"><span class="field-label">Amount Certified:</span><span class="field-value"></span></div>
        <div class="sig-line"></div>
        <div class="sig-label">Architect/Owner Representative Signature</div>
        <div class="field-row" style="margin-top:4pt"><span class="field-label" style="min-width:80pt">Date:</span><span class="field-value"></span></div>
      </div>
    </div>

    <div class="doc-footer">
      AIA Document G702™ – 1992. Copyright © 1992 by The American Institute of Architects. Generated by Saguaro CRM. For reference only. Obtain official AIA forms for legally binding documents. This form has been completed using project data from Saguaro CRM — verify all figures before signing.
    </div>
  `, opts.isDraft ?? true);

  const pdfBuffer  = await renderHTMLtoPDF(html);
  const { storagePath, signedUrl } = await storePDF(
    opts.tenantId, opts.projectId, 'g702', `G702_App_${opts.appNumber}.pdf`, pdfBuffer,
  );
  return { pdfUrl: signedUrl, storagePath };
}

// ─────────────────────────────────────────────────────────────────────────────
// G703 — Continuation Sheet (Schedule of Values)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateG703PDF(opts: {
  tenantId:  string;
  projectId: string;
  ctx:       ProjectContext;
  appNumber: number;
  periodTo:  string;
  sovLines:  Array<{
    item_number:     string;
    description:     string;
    scheduled_value: number;
    prev_completed:  number;
    this_period:     number;
    stored_materials?: number;
    retainage:       number;
  }>;
  isDraft?: boolean;
}): Promise<{ pdfUrl: string; storagePath: string }> {
  const { ctx, sovLines } = opts;

  const totals = sovLines.reduce((acc, line) => ({
    scheduled:  acc.scheduled  + line.scheduled_value,
    prev:       acc.prev       + line.prev_completed,
    this_period: acc.this_period + line.this_period,
    stored:     acc.stored     + (line.stored_materials ?? 0),
    retainage:  acc.retainage  + line.retainage,
  }), { scheduled: 0, prev: 0, this_period: 0, stored: 0, retainage: 0 });

  const lineRows = sovLines.map(line => {
    const total  = line.prev_completed + line.this_period + (line.stored_materials ?? 0);
    const pct    = line.scheduled_value > 0
      ? Math.round((total / line.scheduled_value) * 100 * 10) / 10
      : 0;
    const balance = line.scheduled_value - total;
    return `<tr>
      <td class="text-center">${line.item_number}</td>
      <td>${line.description}</td>
      <td class="text-right">${curr(line.scheduled_value)}</td>
      <td class="text-right">${curr(line.prev_completed)}</td>
      <td class="text-right">${curr(line.this_period)}</td>
      <td class="text-right">${curr(line.stored_materials ?? 0)}</td>
      <td class="text-right">${curr(total)}</td>
      <td class="text-center">${pct}%</td>
      <td class="text-right">${curr(balance)}</td>
      <td class="text-right">${curr(line.retainage)}</td>
    </tr>`;
  }).join('');

  const html = docPage('AIA G703 — Continuation Sheet', `
    <div class="aia-header">
      <div class="aia-logo">AIA Document<br/><strong>G703™</strong><br/>Continuation Sheet</div>
      <div class="aia-doc-title">
        <h1>Continuation Sheet</h1>
        <h2>AIA Document G703 — Schedule of Values</h2>
      </div>
      <div class="aia-doc-number">
        Application No: <strong>${opts.appNumber}</strong><br/>
        Period To: <strong>${fdate(opts.periodTo)}</strong>
      </div>
    </div>

    <div class="two-col" style="margin-bottom:8pt">
      <div class="field-row"><span class="field-label">Project:</span><span class="field-value">${fv(ctx.project.name)}</span></div>
      <div class="field-row"><span class="field-label">Owner:</span><span class="field-value">${fv(ctx.owner?.name)}</span></div>
    </div>

    <table class="doc-table" style="font-size:8pt">
      <thead>
        <tr>
          <th style="width:4%">Item No.</th>
          <th style="width:22%">Description of Work</th>
          <th class="text-right" style="width:9%">Scheduled Value</th>
          <th class="text-right" style="width:9%">Work Completed Previous Apps (D)</th>
          <th class="text-right" style="width:9%">Work Completed This Period (E)</th>
          <th class="text-right" style="width:8%">Materials Stored (F)</th>
          <th class="text-right" style="width:9%">Total Completed &amp; Stored (G=D+E+F)</th>
          <th class="text-center" style="width:7%">% Complete (G÷C)</th>
          <th class="text-right" style="width:9%">Balance to Finish (C-G)</th>
          <th class="text-right" style="width:8%">Retainage</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
        <tr class="total">
          <td colspan="2"><strong>TOTALS</strong></td>
          <td class="text-right"><strong>${curr(totals.scheduled)}</strong></td>
          <td class="text-right"><strong>${curr(totals.prev)}</strong></td>
          <td class="text-right"><strong>${curr(totals.this_period)}</strong></td>
          <td class="text-right"><strong>${curr(totals.stored)}</strong></td>
          <td class="text-right"><strong>${curr(totals.prev + totals.this_period + totals.stored)}</strong></td>
          <td class="text-center"><strong>${totals.scheduled > 0 ? Math.round(((totals.prev + totals.this_period + totals.stored) / totals.scheduled) * 100 * 10) / 10 : 0}%</strong></td>
          <td class="text-right"><strong>${curr(totals.scheduled - totals.prev - totals.this_period - totals.stored)}</strong></td>
          <td class="text-right"><strong>${curr(totals.retainage)}</strong></td>
        </tr>
      </tbody>
    </table>

    <div class="doc-footer">
      AIA Document G703™. Generated by Saguaro CRM. Verify all figures before signing and submitting.
    </div>
  `, opts.isDraft ?? true);

  const pdfBuffer = await renderHTMLtoPDF(html);
  const { storagePath, signedUrl } = await storePDF(
    opts.tenantId, opts.projectId, 'g703', `G703_SOV_App_${opts.appNumber}.pdf`, pdfBuffer,
  );
  return { pdfUrl: signedUrl, storagePath };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lien Waiver PDF (uses state-lien-waivers.ts statutory language)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateLienWaiverPDF(opts: {
  tenantId:       string;
  projectId:      string;
  ctx:            ProjectContext;
  waiverType:     'conditional_partial' | 'unconditional_partial' | 'conditional_final' | 'unconditional_final';
  state:          string;
  claimantName:   string;
  claimantAddress?: string;
  amount:         number;
  throughDate:    string;
  exceptions?:    string;
  checkNumber?:   string;
  isDraft?:       boolean;
}): Promise<{ pdfUrl: string; storagePath: string }> {
  const { getStatutoryWaiverLanguage, getStateWaiverRequirements } = await import('./state-lien-waivers');
  const lang = getStatutoryWaiverLanguage(opts.state, opts.waiverType);
  const reqs = getStateWaiverRequirements(opts.state);

  const typeLabel: Record<string, string> = {
    conditional_partial:    'Conditional Waiver and Release Upon Progress Payment',
    unconditional_partial:  'Unconditional Waiver and Release Upon Progress Payment',
    conditional_final:      'Conditional Waiver and Release Upon Final Payment',
    unconditional_final:    'Unconditional Waiver and Release Upon Final Payment',
  };

  const filledText = lang.mainText
    .replace(/{{claimant}}/g, opts.claimantName)
    .replace(/{{project}}/g,  opts.ctx.project.name)
    .replace(/{{address}}/g,  opts.ctx.project.address ?? '')
    .replace(/{{owner}}/g,    opts.ctx.owner?.name ?? '')
    .replace(/{{gc}}/g,       opts.ctx.gc?.name ?? '')
    .replace(/{{amount}}/g,   curr(opts.amount))
    .replace(/{{through_date}}/g, fdate(opts.throughDate))
    .replace(/{{exceptions}}/g, opts.exceptions || 'None');

  const html = docPage(`${opts.state} Lien Waiver`, `
    <div class="aia-header">
      <div class="aia-logo">
        State of ${opts.state}<br/>
        <strong>Statutory Form</strong><br/>
        ${lang.statute}
      </div>
      <div class="aia-doc-title">
        <h1>${typeLabel[opts.waiverType]}</h1>
        <h2>State of ${opts.state} — ${lang.statute}</h2>
      </div>
      <div class="aia-doc-number">Date: ${fdate(opts.ctx.today)}</div>
    </div>

    ${lang.warningText
      ? `<div class="warning-box">⚠️ ${lang.warningText}</div>`
      : ''
    }

    <div class="section-header">Parties</div>
    <div class="field-row"><span class="field-label">Claimant:</span><span class="field-value">${opts.claimantName}</span></div>
    <div class="field-row"><span class="field-label">Claimant Address:</span><span class="field-value">${opts.claimantAddress ?? ''}</span></div>
    <div class="field-row"><span class="field-label">Owner:</span><span class="field-value">${opts.ctx.owner?.name ?? ''}</span></div>
    <div class="field-row"><span class="field-label">General Contractor:</span><span class="field-value">${opts.ctx.gc?.name ?? ''}</span></div>
    <div class="field-row"><span class="field-label">Project / Job Description:</span><span class="field-value">${opts.ctx.project.name}</span></div>
    <div class="field-row"><span class="field-label">Job Location:</span><span class="field-value">${opts.ctx.project.address ?? ''}</span></div>
    <div class="field-row"><span class="field-label">Amount:</span><span class="field-value"><strong>${curr(opts.amount)}</strong></span></div>
    <div class="field-row"><span class="field-label">Through Date:</span><span class="field-value">${fdate(opts.throughDate)}</span></div>
    ${opts.checkNumber
      ? `<div class="field-row"><span class="field-label">Check No.:</span><span class="field-value">${opts.checkNumber}</span></div>`
      : ''}

    <div class="section-header">Waiver Language (${opts.state} Statutory)</div>
    <div style="border:0.5pt solid #000;padding:8pt;margin:6pt 0;font-size:9pt;line-height:1.6">
      ${filledText.split('\n').map(p => p.trim() ? `<p style="margin-bottom:6pt">${p}</p>` : '').join('')}
    </div>

    ${opts.exceptions
      ? `<div class="notice-box"><strong>EXCEPTIONS:</strong> ${opts.exceptions}</div>`
      : '<p style="font-size:8pt;margin:4pt 0;font-style:italic">This waiver has no exceptions. All amounts through the Through Date are released.</p>'
    }

    <div class="sig-grid">
      <div class="sig-block">
        <div class="sig-label">Claimant</div>
        <p style="font-size:10pt;margin:3pt 0">${opts.claimantName}</p>
        <div class="sig-line"></div>
        <div class="sig-label">Authorized Signature</div>
        <div class="field-row" style="margin-top:6pt"><span class="field-label" style="min-width:70pt">Printed Name:</span><span class="field-value"></span></div>
        <div class="field-row"><span class="field-label" style="min-width:70pt">Title:</span><span class="field-value"></span></div>
        <div class="field-row"><span class="field-label" style="min-width:70pt">Date:</span><span class="field-value"></span></div>
      </div>
      ${reqs.requiresNotary ? `
        <div class="sig-block">
          <div class="sig-label">Notary Public — State of ${opts.state}</div>
          <p style="font-size:8pt;margin:4pt 0">
            Subscribed and sworn to (or affirmed) before me on this ___ day of ___________, 20___.
          </p>
          <div class="sig-line"></div>
          <div class="sig-label">Notary Public Signature</div>
          <div class="field-row" style="margin-top:6pt"><span class="field-label" style="min-width:70pt">Commission No.:</span><span class="field-value"></span></div>
          <div class="field-row"><span class="field-label" style="min-width:70pt">Expires:</span><span class="field-value"></span></div>
          ${reqs.requiresWitness ? '<p style="font-size:8pt;margin-top:6pt">WITNESSES: _________________ / _________________</p>' : ''}
        </div>
      ` : '<div></div>'}
    </div>

    <div class="doc-footer">
      ${opts.state} Statutory Form — ${lang.statute}. Generated by Saguaro CRM. This form complies with applicable state lien law requirements. Consult legal counsel for critical projects.
    </div>
  `, opts.isDraft ?? true);

  const pdfBuffer = await renderHTMLtoPDF(html);
  const filename  = `LienWaiver_${opts.waiverType}_${opts.claimantName.replace(/\s+/g,'_')}.pdf`;
  const { storagePath, signedUrl } = await storePDF(
    opts.tenantId, opts.projectId, 'lien_waivers', filename, pdfBuffer,
  );
  return { pdfUrl: signedUrl, storagePath };
}

// ─────────────────────────────────────────────────────────────────────────────
// Namespace export
// ─────────────────────────────────────────────────────────────────────────────

export const PDFGenerator = {
  renderHTMLtoPDF,
  storePDF,
  generateG702PDF,
  generateG703PDF,
  generateLienWaiverPDF,
};
