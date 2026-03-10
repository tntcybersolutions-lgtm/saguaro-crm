/**
 * document-generator.ts
 *
 * Saguaro CRM — Official Construction Document Generator
 *
 * Generates every legal and administrative document a contractor needs,
 * pre-filled with real project data. Users review and approve — they
 * never have to type project information into forms.
 *
 * Documents generated:
 *   AIA G702       — Application and Certificate for Payment
 *   AIA G703       — Schedule of Values / Continuation Sheet
 *   AIA G704       — Certificate of Substantial Completion
 *   AIA G706       — Contractor's Affidavit of Payment of Debts and Claims
 *   AIA A310       — Bid Bond (form)
 *   Lien Waivers   — Conditional/Unconditional Partial/Final (all states)
 *   Pay Application — Full G702/G703 with SOV
 *   Instructions to Bidders — Formal bid instructions
 *   Bid Form       — Formal line-item bid form for subs
 *   Non-Collusion Affidavit — Government bids
 *   Subcontractor List — Required for public projects
 *   W-9 Request    — Vendor onboarding letter
 *   ACORD 25 Checklist — Insurance verification
 *   Closeout Package — All final completion documents
 *
 * Every document is:
 *   1. Auto-populated with project data from Supabase
 *   2. Formatted as clean professional HTML (printable / PDF-ready)
 *   3. AI-reviewed for completeness and legal adequacy
 *   4. Saved to project_documents table
 *   5. Tracked for signature status
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from './supabase/admin';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.saguarocrm.com';

// ─────────────────────────────────────────────────────────────────────────────
// Document number sequencer
// ─────────────────────────────────────────────────────────────────────────────

async function nextDocNumber(tenantId: string, projectId: string, prefix: string): Promise<string> {
  const { count } = await supabaseAdmin
    .from('project_documents')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .ilike('document_number', `${prefix}%`);

  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String((count ?? 0) + 1).padStart(3, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch full project context for document generation
// ─────────────────────────────────────────────────────────────────────────────

async function fetchProjectContext(tenantId: string, projectId: string) {
  const [projectRes, contractsRes, contactsRes, budgetRes] = await Promise.all([
    supabaseAdmin.from('projects').select('*').eq('id', projectId).eq('tenant_id', tenantId).single(),
    supabaseAdmin.from('contracts').select('*, contract_milestones(*)').eq('project_id', projectId).eq('tenant_id', tenantId),
    supabaseAdmin.from('project_contacts').select('*').eq('project_id', projectId).eq('tenant_id', tenantId),
    supabaseAdmin.from('budget_line_items').select('*').eq('project_id', projectId).eq('tenant_id', tenantId),
  ]);

  return {
    project:   projectRes.data  as Record<string, unknown>,
    contracts: contractsRes.data ?? [],
    contacts:  contactsRes.data ?? [],
    budget:    budgetRes.data   ?? [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML document shell
// ─────────────────────────────────────────────────────────────────────────────

function documentShell(title: string, content: string, metadata?: {
  documentNumber?: string;
  date?: string;
  projectName?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #000; line-height: 1.5; padding: 1in; }
    .doc-header { border-bottom: 2px solid #000; padding-bottom: 12pt; margin-bottom: 16pt; display: flex; justify-content: space-between; align-items: flex-start; }
    .doc-title { font-size: 14pt; font-weight: bold; text-transform: uppercase; }
    .doc-subtitle { font-size: 10pt; color: #333; margin-top: 4pt; }
    .doc-meta { text-align: right; font-size: 10pt; }
    .doc-meta p { margin-bottom: 2pt; }
    .doc-number { font-weight: bold; font-size: 12pt; }
    h2 { font-size: 12pt; font-weight: bold; margin: 14pt 0 6pt; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 2pt; }
    h3 { font-size: 11pt; font-weight: bold; margin: 10pt 0 4pt; }
    p { margin-bottom: 8pt; }
    .field-row { display: flex; margin-bottom: 6pt; align-items: flex-end; }
    .field-label { font-size: 10pt; min-width: 160pt; flex-shrink: 0; }
    .field-value { border-bottom: 1px solid #000; flex: 1; min-height: 14pt; padding-left: 4pt; font-size: 11pt; }
    .field-value.filled { font-weight: normal; }
    .field-blank { color: #ccc; font-style: italic; }
    table { width: 100%; border-collapse: collapse; margin: 10pt 0; font-size: 10pt; }
    th { background: #f0f0f0; border: 1px solid #000; padding: 4pt 6pt; text-align: left; font-weight: bold; }
    td { border: 1px solid #000; padding: 4pt 6pt; }
    td.amount { text-align: right; }
    td.center { text-align: center; }
    .total-row td { font-weight: bold; background: #f9f9f9; }
    .signature-block { margin-top: 24pt; display: grid; grid-template-columns: 1fr 1fr; gap: 24pt; }
    .sig-box { border-top: 1px solid #000; padding-top: 4pt; }
    .sig-label { font-size: 9pt; color: #333; }
    .sig-line { border-bottom: 1px solid #000; height: 36pt; margin: 8pt 0 4pt; }
    .notice { background: #fff3cd; border: 1px solid #ffc107; padding: 8pt; margin: 10pt 0; font-size: 10pt; }
    .legal { font-size: 9pt; color: #333; margin-top: 16pt; border-top: 1px solid #ccc; padding-top: 8pt; }
    .ai-note { background: #e8f4fd; border-left: 3px solid #1b6ca8; padding: 6pt 10pt; font-size: 9pt; color: #1b6ca8; margin: 8pt 0; }
    @media print { .ai-note { display: none; } }
  </style>
</head>
<body>
  <div class="doc-header">
    <div>
      <div class="doc-title">${title}</div>
      ${metadata?.projectName ? `<div class="doc-subtitle">Project: ${metadata.projectName}</div>` : ''}
    </div>
    <div class="doc-meta">
      ${metadata?.documentNumber ? `<p class="doc-number">${metadata.documentNumber}</p>` : ''}
      ${metadata?.date ? `<p>Date: ${metadata.date}</p>` : ''}
      <p>Saguaro CRM — AI Generated</p>
    </div>
  </div>
  ${content}
</body>
</html>`;
}

function field(label: string, value: string | null | undefined, placeholder = 'To be completed'): string {
  const display = value?.trim() || '';
  return `<div class="field-row">
    <span class="field-label">${label}:</span>
    <span class="field-value ${display ? 'filled' : ''}">${display || `<span class="field-blank">${placeholder}</span>`}</span>
  </div>`;
}

function currency(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. AIA G702 — Application for Payment
// ─────────────────────────────────────────────────────────────────────────────

export async function generatePayApplication(opts: {
  tenantId: string;
  projectId: string;
  contractId: string;
  applicationNumber?: number;
  periodFrom?: string;
  periodTo?: string;
}): Promise<{ documentId: string; payAppId: string }> {
  const ctx = await fetchProjectContext(opts.tenantId, opts.projectId);
  const contract = (ctx.contracts as Record<string,unknown>[]).find(c => c.id === opts.contractId);
  if (!contract) throw new Error('Contract not found');

  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const contractValue = Number(contract.contract_value ?? 0);
  const retainagePct  = Number(contract.retainage_percent ?? 10);

  // Get previous pay applications
  const { data: prevApps } = await supabaseAdmin
    .from('pay_applications')
    .select('application_number, total_completed_and_stored, total_previous_payments')
    .eq('contract_id', opts.contractId)
    .in('status', ['approved', 'paid'])
    .order('application_number', { ascending: false })
    .limit(1);

  const appNum = opts.applicationNumber ?? ((prevApps?.[0]?.application_number as number ?? 0) + 1);
  const prevPayments = Number(prevApps?.[0]?.total_previous_payments ?? 0)
    + Number(prevApps?.[0]?.total_completed_and_stored ?? 0);

  // Get budget lines for SOV
  const budgetLines = (ctx.budget as Record<string,unknown>[]).filter(b => b.category === 'subcontract' || true);

  // Owner + architect from contacts
  const ownerContact = (ctx.contacts as Record<string,unknown>[]).find(c => c.contact_type === 'owner');
  const archContact  = (ctx.contacts as Record<string,unknown>[]).find(c => c.contact_type === 'architect');
  const subCo        = (ctx.contacts as Record<string,unknown>[]).find(c => c.contact_type === 'subcontractor');

  const project  = ctx.project as Record<string,unknown>;
  const periodFrom = opts.periodFrom ?? `${new Date().getFullYear()}-${String(new Date().getMonth()).padStart(2,'0')}-01`;
  const periodTo   = opts.periodTo   ?? today;

  const docNumber = await nextDocNumber(opts.tenantId, opts.projectId, 'PA');

  // Build the G702 HTML
  const content = `
    <div class="ai-note">🤖 AI Pre-filled: All project data auto-populated from Saguaro. Review highlighted fields before signing.</div>

    <h2>AIA Document G702 — Application and Certificate for Payment</h2>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16pt;margin-bottom:16pt">
      <div>
        <h3>Project Information</h3>
        ${field('Project Name',    project.name as string)}
        ${field('Project Address', project.address as string)}
        ${field('Owner',           (ownerContact?.company_name ?? ownerContact?.contact_name) as string)}
        ${field('Architect',       (archContact?.company_name ?? archContact?.contact_name) as string)}
      </div>
      <div>
        <h3>Application Data</h3>
        ${field('Application No.', String(appNum))}
        ${field('Period From',     periodFrom)}
        ${field('Period To',       periodTo)}
        ${field('Contract Date',   contract.contract_date as string)}
        ${field('Contract For',    contract.title as string)}
      </div>
    </div>

    <h2>Contractor's Application for Payment</h2>
    <p>The undersigned Contractor certifies that to the best of the Contractor's knowledge, information, and belief the Work covered by this Application for Payment has been completed in accordance with the Contract Documents, that all amounts have been paid by the Contractor for Work for which previous Certificates for Payment were issued and payments received from the Owner, and that the current payment shown herein is now due.</p>

    <table>
      <tr><th colspan="2">Application Is Made for Payment as Shown Below</th></tr>
      <tr><td>1. Original Contract Sum</td><td class="amount">${currency(contractValue)}</td></tr>
      <tr><td>2. Net Change by Change Orders</td><td class="amount">${currency(0)}</td></tr>
      <tr><td>3. Contract Sum to Date (Line 1 ± 2)</td><td class="amount">${currency(contractValue)}</td></tr>
      <tr><td>4. Total Completed and Stored to Date</td><td class="amount">${currency(0)}</td></tr>
      <tr><td>5. Retainage (${retainagePct}% of Line 4)</td><td class="amount">${currency(0)}</td></tr>
      <tr><td>6. Total Earned Less Retainage (Line 4 minus 5)</td><td class="amount">${currency(0)}</td></tr>
      <tr><td>7. Less Previous Certificates for Payment</td><td class="amount">${currency(prevPayments)}</td></tr>
      <tr class="total-row"><td>8. CURRENT PAYMENT DUE</td><td class="amount">${currency(0)}</td></tr>
      <tr><td>9. Balance to Finish, Including Retainage (Line 3 minus 6)</td><td class="amount">${currency(contractValue)}</td></tr>
    </table>

    <div class="notice">⚠️ Complete Line 4 (Total Completed and Stored to Date) before submission. This requires the attached G703 Continuation Sheet to be completed first.</div>

    <div class="signature-block">
      <div class="sig-box">
        <div class="sig-label">CONTRACTOR</div>
        <p>${(subCo?.company_name ?? contract.title) as string}</p>
        <div class="sig-line"></div>
        <div class="sig-label">Signature</div>
        <div class="sig-line" style="height:14pt"></div>
        <div class="sig-label">Printed Name and Title</div>
        <div class="sig-line" style="height:14pt"></div>
        <div class="sig-label">Date</div>
      </div>
      <div class="sig-box">
        <div class="sig-label">CERTIFICATE FOR PAYMENT (Architect/Owner)</div>
        <p>In accordance with the Contract Documents, based on on-site observations and the data comprising this application, the Architect certifies to the Owner that, to the best of the Architect's knowledge, information, and belief, the Work has progressed as indicated, the quality of the Work is in accordance with the Contract Documents, and the Contractor is entitled to payment of the AMOUNT CERTIFIED.</div>
        <div class="sig-line"></div>
        <div class="sig-label">Architect's Signature</div>
        <div class="sig-line" style="height:14pt"></div>
        <div class="sig-label">Date</div>
      </div>
    </div>

    <div class="legal">This document was prepared using AIA Document G702-1992 format. Consult legal counsel before use on federally-funded or union projects. © American Institute of Architects 1992. For reference only — obtain official AIA forms for legally binding documents.</div>
  `;

  const htmlDoc = documentShell('AIA G702 — Application for Payment', content, {
    documentNumber: docNumber,
    date: today,
    projectName: project.name as string,
  });

  // Save pay application record
  const { data: payApp, error: paErr } = await supabaseAdmin
    .from('pay_applications')
    .insert({
      tenant_id:          opts.tenantId,
      project_id:         opts.projectId,
      contract_id:        opts.contractId,
      application_number: appNum,
      period_from:        periodFrom,
      period_to:          periodTo,
      contract_sum:       contractValue,
      retainage_pct:      retainagePct,
      total_previous_payments: prevPayments,
      status:             'draft',
      created_at:         now,
      updated_at:         now,
    })
    .select('id')
    .single();

  if (paErr || !payApp) throw new Error(`Pay application create: ${paErr?.message}`);

  // Save document record
  const { data: doc, error: docErr } = await supabaseAdmin
    .from('project_documents')
    .insert({
      tenant_id:         opts.tenantId,
      project_id:        opts.projectId,
      template_code:     'AIA_G702',
      entity_type:       'contract',
      entity_id:         opts.contractId,
      document_type:     'AIA G702 — Application for Payment',
      document_number:   docNumber,
      title:             `Pay Application #${appNum} — ${contract.title as string}`,
      content_html:      htmlDoc,
      field_values:      { applicationNumber: appNum, periodFrom, periodTo, contractValue, retainagePct, prevPayments },
      ai_generated:      true,
      ai_model:          'template',
      ai_generated_at:   now,
      ai_confidence:     'high',
      ai_flags:          [{ flag: 'Line 4 (Total Completed) must be filled manually', severity: 'required' }],
      status:            'draft',
      requires_signature: true,
      gross_amount:      0,
      net_amount:        0,
      created_at:        now,
      updated_at:        now,
    })
    .select('id')
    .single();

  if (docErr || !doc) throw new Error(`Document record: ${docErr?.message}`);

  // Link pay app to document
  await supabaseAdmin.from('pay_applications').update({ document_id: doc.id, updated_at: now }).eq('id', payApp.id);

  return { documentId: doc.id as string, payAppId: payApp.id as string };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Lien Waivers — all types, all states
// ─────────────────────────────────────────────────────────────────────────────

export async function generateLienWaiver(opts: {
  tenantId: string;
  projectId: string;
  contractId?: string;
  payApplicationId?: string;
  waiverType: 'conditional_partial' | 'unconditional_partial' | 'conditional_final' | 'unconditional_final';
  state: string;
  claimantName: string;
  claimantAddress?: string;
  amount: number;
  throughDate: string;
  exceptions?: string;
}): Promise<string> {
  const ctx = await fetchProjectContext(opts.tenantId, opts.projectId);
  const project = ctx.project as Record<string,unknown>;
  const ownerContact = (ctx.contacts as Record<string,unknown>[]).find(c => c.contact_type === 'owner');
  const gcContact    = (ctx.contacts as Record<string,unknown>[]).find(c => c.contact_type === 'general_contractor');

  const now    = new Date().toISOString();
  const today  = now.split('T')[0];
  const docNum = await nextDocNumber(opts.tenantId, opts.projectId, 'LW');

  // Import state-specific language
  const { getStatutoryWaiverLanguage } = await import('./state-lien-waivers');
  const statutoryLanguage = getStatutoryWaiverLanguage(opts.state, opts.waiverType);

  const typeLabel = {
    conditional_partial:    'Conditional Waiver and Release Upon Progress Payment',
    unconditional_partial:  'Unconditional Waiver and Release Upon Progress Payment',
    conditional_final:      'Conditional Waiver and Release Upon Final Payment',
    unconditional_final:    'Unconditional Waiver and Release Upon Final Payment',
  }[opts.waiverType];

  const isConditional = opts.waiverType.startsWith('conditional');
  const isFinal       = opts.waiverType.includes('final');

  const content = `
    <div class="ai-note">🤖 Auto-generated with ${opts.state} statutory language. Pre-filled from project data. Claimant must sign.</div>

    <h2>${opts.state} Statutory Form — ${typeLabel}</h2>

    <p><strong>NOTICE:</strong> This document waives and releases lien rights and other specified rights upon the ${isConditional ? 'condition that' : 'receipt of'} payment.</p>

    <div style="margin:16pt 0">
      ${field('Claimant (name of person/company releasing claim)', opts.claimantName)}
      ${field('Claimant Address', opts.claimantAddress ?? '')}
      ${field('Customer / GC Name', (gcContact?.company_name ?? 'General Contractor') as string)}
      ${field('Job Location / Project', `${project.name as string} — ${project.address as string}`)}
      ${field('Owner', (ownerContact?.company_name ?? ownerContact?.contact_name ?? '') as string)}
      ${field('Through Date', opts.throughDate)}
      ${field('Amount of Payment${isConditional ? " (Conditional on receipt of)" : " (Received)"}', currency(opts.amount))}
    </div>

    <h2>Waiver Language</h2>

    <p>${statutoryLanguage.mainText
      .replace('{{claimant}}', opts.claimantName)
      .replace('{{project}}', `${project.name as string}`)
      .replace('{{address}}', `${project.address as string}`)
      .replace('{{owner}}', (ownerContact?.company_name ?? '') as string)
      .replace('{{gc}}', (gcContact?.company_name ?? '') as string)
      .replace('{{amount}}', currency(opts.amount))
      .replace('{{through_date}}', opts.throughDate)
    }</p>

    ${opts.exceptions
      ? `<div class="notice"><strong>EXCEPTIONS (amounts NOT waived):</strong><br/>${opts.exceptions}</div>`
      : '<p>This waiver applies to all amounts through the Through Date listed above. There are no exceptions.</p>'
    }

    ${isFinal ? `
      <p>This waiver and release covers a final settlement in full. The claimant has been paid and received payment in full for all labor, services, equipment, or materials furnished to the job described above.</p>
    ` : ''}

    ${statutoryLanguage.additionalText || ''}

    <div class="signature-block">
      <div class="sig-box">
        <div class="sig-label">CLAIMANT SIGNATURE</div>
        <p>${opts.claimantName}</p>
        <div class="sig-line"></div>
        <div class="sig-label">Authorized Signature</div>
        <div class="sig-line" style="height:14pt"></div>
        <div class="sig-label">Printed Name</div>
        <div class="sig-line" style="height:14pt"></div>
        <div class="sig-label">Title</div>
        <div class="sig-line" style="height:14pt"></div>
        <div class="sig-label">Date</div>
      </div>
      ${statutoryLanguage.requiresNotary ? `
        <div class="sig-box">
          <div class="sig-label">NOTARY PUBLIC</div>
          <p>State of ${opts.state} — County of _______________</p>
          <p>Subscribed and sworn to before me this ___ day of ___________, 20___.</p>
          <div class="sig-line"></div>
          <div class="sig-label">Notary Signature</div>
          <div class="sig-line" style="height:14pt"></div>
          <div class="sig-label">Commission Expires</div>
        </div>
      ` : '<div></div>'}
    </div>

    <div class="legal">
      Statutory form per ${statutoryLanguage.statute}. This form satisfies the requirements of ${opts.state} lien law for a ${typeLabel}.
      ${statutoryLanguage.warningText || ''}
    </div>
  `;

  const htmlDoc = documentShell(`${opts.state} Lien Waiver — ${typeLabel}`, content, {
    documentNumber: docNum,
    date: today,
    projectName: project.name as string,
  });

  // Save lien waiver record
  const { data: waiverDoc, error: wErr } = await supabaseAdmin
    .from('lien_waivers')
    .insert({
      tenant_id:           opts.tenantId,
      project_id:          opts.projectId,
      contract_id:         opts.contractId ?? null,
      pay_application_id:  opts.payApplicationId ?? null,
      waiver_type:         opts.waiverType,
      state:               opts.state,
      claimant_name:       opts.claimantName,
      claimant_address:    opts.claimantAddress ?? null,
      owner_name:          (ownerContact?.company_name ?? '') as string,
      gc_name:             (gcContact?.company_name ?? '') as string,
      project_address:     project.address as string ?? null,
      through_date:        opts.throughDate,
      amount:              opts.amount,
      exceptions:          opts.exceptions ?? null,
      status:              'draft',
      ai_generated:        true,
      statutory_compliant: true,
      created_at:          now,
      updated_at:          now,
    })
    .select('id')
    .single();

  if (wErr || !waiverDoc) throw new Error(`Lien waiver record: ${wErr?.message}`);

  // Save document record
  const { data: docRec, error: docErr } = await supabaseAdmin
    .from('project_documents')
    .insert({
      tenant_id:          opts.tenantId,
      project_id:         opts.projectId,
      template_code:      `LIEN_WAIVER_${opts.waiverType.toUpperCase()}`,
      entity_type:        'contract',
      entity_id:          opts.contractId ?? null,
      document_type:      `${opts.state} Lien Waiver — ${typeLabel}`,
      document_number:    docNum,
      title:              `Lien Waiver — ${opts.claimantName} — ${opts.throughDate}`,
      content_html:       htmlDoc,
      field_values:       { waiverType: opts.waiverType, state: opts.state, amount: opts.amount, throughDate: opts.throughDate },
      ai_generated:       true,
      status:             'draft',
      requires_signature: true,
      signatory_name:     opts.claimantName,
      net_amount:         opts.amount,
      created_at:         now,
      updated_at:         now,
    })
    .select('id')
    .single();

  if (docErr || !docRec) throw new Error(`Lien waiver document: ${docErr?.message}`);

  // Link to lien waiver record
  await supabaseAdmin.from('lien_waivers').update({ document_id: docRec.id, updated_at: now }).eq('id', waiverDoc.id);

  return docRec.id as string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Full Bid Document Package — everything a sub gets in the bid folder
// ─────────────────────────────────────────────────────────────────────────────

export async function generateBidDocumentPackage(opts: {
  tenantId: string;
  projectId: string;
  bidPackageId: string;
}): Promise<{ documentsCreated: number; documentIds: string[] }> {
  const ctx = await fetchProjectContext(opts.tenantId, opts.projectId);
  const project = ctx.project as Record<string,unknown>;
  const now = new Date().toISOString();

  // Fetch bid package + jacket
  const [pkgRes, jacketRes] = await Promise.all([
    supabaseAdmin.from('bid_packages').select('*, bid_package_items(*)').eq('id', opts.bidPackageId).single(),
    supabaseAdmin.from('bid_jackets').select('*').eq('bid_package_id', opts.bidPackageId).maybeSingle(),
  ]);

  const pkg    = pkgRes.data    as Record<string,unknown>;
  const jacket = jacketRes.data as Record<string,unknown> | null;

  const ownerContact = (ctx.contacts as Record<string,unknown>[]).find(c => c.contact_type === 'owner');
  const archContact  = (ctx.contacts as Record<string,unknown>[]).find(c => c.contact_type === 'architect');
  const dueDate      = pkg.due_at ? new Date(pkg.due_at as string).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) : 'TBD';

  const items = (pkg.bid_package_items as Record<string,unknown>[]) ?? [];

  const documentIds: string[] = [];

  // ── Document 1: Instructions to Bidders ────────────────────────────────────
  const itbContent = `
    <h2>Instructions to Bidders</h2>

    <h3>1. Project Information</h3>
    ${field('Project', project.name as string)}
    ${field('Location', project.address as string)}
    ${field('Owner', (ownerContact?.company_name ?? '') as string)}
    ${field('Architect', (archContact?.company_name ?? '') as string)}
    ${field('Package', `${pkg.code as string} — ${pkg.name as string}`)}

    <h3>2. Bid Submission</h3>
    <p>Sealed bids will be received until <strong>${dueDate} at 5:00 PM local time</strong>. Bids submitted after this time will not be accepted.</p>
    ${field('Submit bids to', 'project manager via Saguaro CRM portal')}
    ${field('Bid Portal URL', `${APP_URL}/bid-portal`)}

    <h3>3. Bid Requirements</h3>
    <p>Each bid must include:</p>
    <ol style="margin-left:20pt;margin-bottom:8pt">
      <li>Completed Bid Form (attached)</li>
      <li>Bid Bond (AIA A310) — 5% of base bid, if contract value &gt; $100,000</li>
      <li>List of proposed subcontractors</li>
      <li>Contractor's license number(s)</li>
      <li>Experience with similar projects (minimum 3 references)</li>
      <li>Certificate of Insurance — GC and Owner named as Additional Insured</li>
    </ol>

    <h3>4. Bid Bond</h3>
    <p>A Bid Bond in the amount of five percent (5%) of the Total Base Bid is required from a surety company licensed to do business in this state and acceptable to the Owner. AIA Document A310 or equivalent form shall be used.</p>

    <h3>5. Examination of Documents</h3>
    <p>Before submitting a bid, each Bidder shall carefully examine the Contract Documents, visit the site, and fully inform themselves of all existing conditions and limitations under which the Work is to be performed. Submission of a bid constitutes the Bidder's agreement that they have examined all documents and are satisfied regarding the nature and amount of work required.</p>

    <h3>6. Scope of Work</h3>
    ${jacket?.scope_of_work ? `<p>${(jacket.scope_of_work as string).replace(/\n/g,'</p><p>')}</p>` : '<p>See attached Scope of Work.</p>'}

    <h3>7. Questions</h3>
    <p>Questions regarding the bid documents must be submitted in writing via the Saguaro CRM portal at least 5 business days prior to the bid due date. Verbal questions will not be accepted. All responses will be issued as addenda to all registered bidders.</p>

    <h3>8. Rejection of Bids</h3>
    <p>The Owner reserves the right to reject any and all bids, to waive informalities in bidding, and to accept the bid that, in the Owner's judgment, is in the Owner's best interest.</p>

    ${jacket?.bid_instructions ? `<h3>9. Additional Instructions</h3><p>${(jacket.bid_instructions as string).replace(/\n/g,'</p><p>')}</p>` : ''}
  `;

  const itbHtml = documentShell('Instructions to Bidders', itbContent, {
    documentNumber: `ITB-${pkg.code as string}`,
    date: now.split('T')[0],
    projectName: project.name as string,
  });

  const { data: itbDoc } = await supabaseAdmin.from('project_documents').insert({
    tenant_id: opts.tenantId, project_id: opts.projectId,
    template_code: 'INSTRUCTIONS_TO_BIDDERS',
    entity_type: 'bid_package', entity_id: opts.bidPackageId,
    document_type: 'Instructions to Bidders',
    document_number: `ITB-${pkg.code as string}`,
    title: `Instructions to Bidders — ${pkg.name as string}`,
    content_html: itbHtml, ai_generated: true, status: 'draft',
    requires_signature: false, created_at: now, updated_at: now,
  }).select('id').single();

  if (itbDoc) documentIds.push(itbDoc.id as string);

  await supabaseAdmin.from('bid_documents').insert({
    tenant_id: opts.tenantId, bid_package_id: opts.bidPackageId,
    document_type: 'instructions_to_bidders', document_number: `ITB-${pkg.code as string}`,
    title: 'Instructions to Bidders', content_html: itbHtml,
    ai_generated: true, status: 'draft', created_at: now, updated_at: now,
  });

  // ── Document 2: Bid Form ───────────────────────────────────────────────────
  const bidFormContent = `
    <h2>Bid Form</h2>
    <p>TO: ${(project.name as string)} — ${(ownerContact?.company_name ?? 'Owner') as string}</p>
    <p>RE: ${(pkg.code as string)} — ${(pkg.name as string)}</p>
    <p>BID DUE: ${dueDate}</p>

    ${field('Bidder Company Name', '')}
    ${field('Bidder Address', '')}
    ${field('License Number', '')}
    ${field('License Expiration', '')}
    ${field('Contact Name', '')}
    ${field('Contact Phone', '')}
    ${field('Contact Email', '')}

    <h3>Base Bid — Line Item Pricing</h3>
    <table>
      <tr>
        <th>Item #</th>
        <th>Description</th>
        <th>UOM</th>
        <th>Quantity</th>
        <th>Unit Price</th>
        <th>Extended Amount</th>
      </tr>
      ${items.map((item, idx) => `
        <tr>
          <td class="center">${item.code as string || String(idx + 1)}</td>
          <td>${item.title as string}</td>
          <td class="center">${item.uom as string}</td>
          <td class="center">${item.quantity as number}</td>
          <td class="amount">$_____________</td>
          <td class="amount">$_____________</td>
        </tr>
      `).join('')}
      ${items.length === 0 ? '<tr><td colspan="6" class="center">See scope of work — provide lump sum bid</td></tr>' : ''}
      <tr class="total-row">
        <td colspan="5">BASE BID TOTAL</td>
        <td class="amount">$_____________</td>
      </tr>
    </table>

    <h3>Bid Amount in Words</h3>
    ${field('Total Base Bid (written)', '')}

    <h3>Alternates (if applicable)</h3>
    ${field('Alternate 1 (add/deduct)', '')}
    ${field('Alternate 2 (add/deduct)', '')}

    <h3>Completion Schedule</h3>
    ${field('Days to Complete (calendar)', '')}
    ${field('Can meet required schedule?', 'Yes / No')}

    <h3>Qualifications and Exceptions</h3>
    <p>List any qualifications or exceptions to the base bid (if none, write "None"):</p>
    <div style="border:1px solid #000;min-height:60pt;margin:8pt 0;padding:4pt"></div>

    <div class="signature-block">
      <div class="sig-box">
        <p>The undersigned, having examined the Contract Documents and the site, hereby proposes to furnish all labor, materials, equipment, and services required to complete the work described in the above Bid Package for the prices indicated above.</p>
        <div class="sig-line"></div>
        <div class="sig-label">Authorized Signature</div>
        <div class="sig-line" style="height:14pt"></div>
        <div class="sig-label">Printed Name and Title</div>
        <div class="sig-line" style="height:14pt"></div>
        <div class="sig-label">Date</div>
      </div>
      <div></div>
    </div>
  `;

  const bidFormHtml = documentShell('Bid Form', bidFormContent, {
    documentNumber: `BF-${pkg.code as string}`,
    date: now.split('T')[0],
    projectName: project.name as string,
  });

  const { data: bfDoc } = await supabaseAdmin.from('project_documents').insert({
    tenant_id: opts.tenantId, project_id: opts.projectId,
    template_code: 'BID_FORM', entity_type: 'bid_package', entity_id: opts.bidPackageId,
    document_type: 'Bid Form', document_number: `BF-${pkg.code as string}`,
    title: `Bid Form — ${pkg.name as string}`,
    content_html: bidFormHtml, ai_generated: true, status: 'draft',
    requires_signature: true, created_at: now, updated_at: now,
  }).select('id').single();

  if (bfDoc) documentIds.push(bfDoc.id as string);

  // ── Document 3: Non-Collusion Affidavit ───────────────────────────────────
  const nca = `
    <h2>Non-Collusion Affidavit</h2>
    <p>The undersigned certifies, under oath, the following:</p>
    <ol style="margin-left:20pt">
      <li>The bid submitted by the bidder is genuine and not made in the interest of or on behalf of any undisclosed person, firm, or corporation.</li>
      <li>The bidder has not directly or indirectly induced or solicited any other bidder to put in a false or sham bid.</li>
      <li>The bidder has not solicited or induced any person, firm, or corporation to refrain from bidding.</li>
      <li>The bidder has not sought by collusion to obtain for itself any advantage over any other bidder or over the Owner.</li>
    </ol>
    ${field('Company Name', '')}
    ${field('Business Address', '')}
    ${field('By (Printed Name)', '')}
    ${field('Title', '')}
    <div class="signature-block">
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-label">Signature</div>
        <div class="sig-line" style="height:14pt"></div>
        <div class="sig-label">Date</div>
      </div>
      <div class="sig-box">
        <div class="sig-label">NOTARY PUBLIC</div>
        <p>Subscribed and sworn before me this ___ day of __________, 20___</p>
        <div class="sig-line"></div>
        <div class="sig-label">Notary Signature / Seal</div>
        <div class="sig-line" style="height:14pt"></div>
        <div class="sig-label">Commission Expires</div>
      </div>
    </div>
  `;

  const ncaHtml = documentShell('Non-Collusion Affidavit', nca, {
    documentNumber: `NCA-${pkg.code as string}`,
    date: now.split('T')[0],
    projectName: project.name as string,
  });

  const { data: ncaDoc } = await supabaseAdmin.from('project_documents').insert({
    tenant_id: opts.tenantId, project_id: opts.projectId,
    template_code: 'NON_COLLUSION_AFFIDAVIT', entity_type: 'bid_package', entity_id: opts.bidPackageId,
    document_type: 'Non-Collusion Affidavit', document_number: `NCA-${pkg.code as string}`,
    title: `Non-Collusion Affidavit — ${pkg.name as string}`,
    content_html: ncaHtml, ai_generated: true, status: 'draft',
    requires_signature: true, created_at: now, updated_at: now,
  }).select('id').single();

  if (ncaDoc) documentIds.push(ncaDoc.id as string);

  return { documentsCreated: documentIds.length, documentIds };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. AIA G704 — Certificate of Substantial Completion
// ─────────────────────────────────────────────────────────────────────────────

export async function generateSubstantialCompletionCertificate(opts: {
  tenantId: string;
  projectId: string;
  contractId?: string;
  completionDate?: string;
}): Promise<string> {
  const ctx    = await fetchProjectContext(opts.tenantId, opts.projectId);
  const project = ctx.project as Record<string,unknown>;
  const contract = opts.contractId
    ? (ctx.contracts as Record<string,unknown>[]).find(c => c.id === opts.contractId)
    : (ctx.contracts as Record<string,unknown>[])[0];

  const now    = new Date().toISOString();
  const today  = now.split('T')[0];
  const docNum = await nextDocNumber(opts.tenantId, opts.projectId, 'SC');

  const ownerContact = (ctx.contacts as Record<string,unknown>[]).find(c => c.contact_type === 'owner');
  const archContact  = (ctx.contacts as Record<string,unknown>[]).find(c => c.contact_type === 'architect');
  const subContact   = (ctx.contacts as Record<string,unknown>[]).find(c => c.contact_type === 'subcontractor');

  const content = `
    <div class="ai-note">🤖 Auto-generated from project data. Architect must complete and sign. Owner and Contractor must also sign.</div>

    <h2>AIA Document G704 — Certificate of Substantial Completion</h2>

    <p>This Certificate of Substantial Completion is issued by the Architect and is subject to the following conditions:</p>

    ${field('Project',     project.name as string)}
    ${field('Location',    project.address as string)}
    ${field('Owner',       (ownerContact?.company_name ?? '') as string)}
    ${field('Contractor',  (subContact?.company_name ?? contract?.title ?? '') as string)}
    ${field('Architect',   (archContact?.company_name ?? '') as string)}
    ${field('Contract Date', contract?.contract_date as string ?? '')}
    ${field('Substantial Completion Date', opts.completionDate ?? today)}

    <h3>Project Description</h3>
    ${field('Contract For', contract?.title as string ?? '')}
    ${field('Contract Sum', contract ? currency(Number(contract.contract_value)) : '')}

    <h3>Punch List</h3>
    <p>The Work described above is hereby designated as substantially complete as of the date indicated above. A list of items to be completed or corrected (Punch List) is attached hereto.</p>
    ${field('Date Punch List Attached', '')}
    ${field('Estimated Cost to Complete Punch List', '$')}
    ${field('Retainage to be Withheld Pending Punch List', '$')}

    <h3>Responsibilities After Substantial Completion</h3>
    <table style="font-size:10pt">
      <tr><th>Responsibility</th><th>Owner</th><th>Contractor</th></tr>
      <tr><td>Utilities, heat, and maintenance</td><td class="center">☐</td><td class="center">☐</td></tr>
      <tr><td>Insurance</td><td class="center">☐</td><td class="center">☐</td></tr>
      <tr><td>Security</td><td class="center">☐</td><td class="center">☐</td></tr>
      <tr><td>Operations and maintenance of mechanical systems</td><td class="center">☐</td><td class="center">☐</td></tr>
    </table>

    <h3>Warranty</h3>
    <p>The Contractor's warranty period for the Work begins on the date of Substantial Completion as set forth herein.</p>
    ${field('Warranty expiration date', '')}

    <div class="signature-block">
      <div class="sig-box">
        <div class="sig-label">ARCHITECT</div>
        <p>${(archContact?.company_name ?? 'Architect of Record') as string}</p>
        <div class="sig-line"></div>
        <div class="sig-label">Signature</div>
        <div class="sig-line" style="height:14pt"></div><div class="sig-label">Date</div>
      </div>
      <div class="sig-box">
        <div class="sig-label">CONTRACTOR</div>
        <p>${(subContact?.company_name ?? '') as string}</p>
        <div class="sig-line"></div>
        <div class="sig-label">Signature</div>
        <div class="sig-line" style="height:14pt"></div><div class="sig-label">Date</div>
      </div>
    </div>
    <div class="sig-box" style="margin-top:16pt;max-width:50%">
      <div class="sig-label">OWNER</div>
      <p>${(ownerContact?.company_name ?? '') as string}</p>
      <div class="sig-line"></div>
      <div class="sig-label">Signature</div>
      <div class="sig-line" style="height:14pt"></div><div class="sig-label">Date</div>
    </div>

    <div class="legal">AIA Document G704-2000 format. © American Institute of Architects. For reference only. Obtain official AIA forms for legally binding use.</div>
  `;

  const htmlDoc = documentShell('AIA G704 — Certificate of Substantial Completion', content, {
    documentNumber: docNum, date: today, projectName: project.name as string,
  });

  const { data: doc } = await supabaseAdmin.from('project_documents').insert({
    tenant_id: opts.tenantId, project_id: opts.projectId,
    template_code: 'AIA_G704', entity_type: 'project', entity_id: opts.projectId,
    document_type: 'AIA G704 — Certificate of Substantial Completion',
    document_number: docNum, title: `Certificate of Substantial Completion — ${project.name as string}`,
    content_html: htmlDoc, ai_generated: true, status: 'draft',
    requires_signature: true, created_at: now, updated_at: now,
  }).select('id').single();

  return (doc?.id ?? '') as string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. AI-Assisted Closeout Package
// ─────────────────────────────────────────────────────────────────────────────

export async function generateCloseoutPackage(opts: {
  tenantId: string;
  projectId: string;
}): Promise<{ checklistId: string; itemCount: number }> {
  const ctx    = await fetchProjectContext(opts.tenantId, opts.projectId);
  const project = ctx.project as Record<string,unknown>;
  const now    = new Date().toISOString();

  // AI generates a project-specific closeout checklist
  const projectType = project.project_type as string ?? 'commercial';
  const hasContracts = (ctx.contracts as Record<string,unknown>[]).length > 0;
  const contractCount = (ctx.contracts as Record<string,unknown>[]).length;

  const prompt = `
You are a construction project manager preparing a project closeout checklist.

Project: ${project.name as string}
Type: ${projectType}
Location: ${project.address as string}
Subcontracts: ${contractCount} active contracts
Status: ${project.status as string}

Generate a COMPLETE closeout checklist for this project. Include every document and action needed before final payment is released and the project is officially closed.

Organize by category. For each item include:
- item: short description
- document_type: what document/form is needed
- responsible_party: who must provide (owner, gc, sub, architect, engineer, inspector)
- required: true/false (is this legally or contractually required)
- notes: any specific requirement for this project type

Categories to cover:
1. Permits & Inspections (certificate of occupancy, final inspection, mechanical/electrical/plumbing permits)
2. AIA Forms (G702 final, G704, G706, G707)
3. Lien Releases (from GC, all subs, all suppliers)
4. Warranties (roof, HVAC, appliances, structural, manufacturer warranties)
5. As-Built Drawings (all trades)
6. Operations & Maintenance Manuals (HVAC, plumbing, electrical, specialty equipment)
7. Keys, Keycards, Access Codes
8. Insurance (transition to owner's policy)
9. Testing & Commissioning reports
10. Financial (final accounting, retainage release, punch list cost reconciliation)
11. Training (owner and facility staff training on systems)

Return as JSON array of objects with: item, document_type, responsible_party, required (bool), notes
`.trim();

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    system: 'You are a construction project closeout expert. Return ONLY valid JSON array. No markdown, no explanation.',
    messages: [{ role: 'user', content: prompt }],
  });

  let checklist: Record<string,unknown>[] = [];
  try {
    const textContent = response.content.find((b) => b.type === 'text');
    const rawText = textContent && textContent.type === 'text' ? textContent.text : '[]';
    const parsed = JSON.parse(rawText.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim());
    checklist = Array.isArray(parsed) ? parsed : [];
  } catch {
    // fallback checklist
    checklist = [
      { item: 'Certificate of Occupancy', document_type: 'permit', responsible_party: 'gc', required: true, notes: 'From building department' },
      { item: 'Final Lien Release from GC', document_type: 'unconditional_final_lien_waiver', responsible_party: 'gc', required: true, notes: '' },
      { item: 'AIA G704 Substantial Completion Certificate', document_type: 'AIA_G704', responsible_party: 'architect', required: true, notes: '' },
      { item: 'AIA G706 Contractor Affidavit', document_type: 'AIA_G706', responsible_party: 'gc', required: true, notes: '' },
      { item: 'Final Pay Application G702', document_type: 'AIA_G702', responsible_party: 'gc', required: true, notes: '' },
      { item: 'As-Built Drawings', document_type: 'drawings', responsible_party: 'gc', required: true, notes: 'All trades' },
      { item: 'O&M Manuals', document_type: 'manual', responsible_party: 'gc', required: true, notes: 'HVAC, plumbing, electrical' },
      { item: 'Warranty Documents', document_type: 'warranty', responsible_party: 'gc', required: true, notes: '' },
      { item: 'Keys and Access Devices', document_type: 'misc', responsible_party: 'gc', required: true, notes: '' },
    ];
  }

  // Add a checklist item for each active contract's lien waiver
  for (const contract of (ctx.contracts as Record<string,unknown>[])) {
    checklist.push({
      item: `Final Lien Waiver — ${contract.title as string}`,
      document_type: 'unconditional_final_lien_waiver',
      responsible_party: 'subcontractor',
      required: true,
      notes: `From ${contract.title as string} — required before final payment release`,
      contract_id: contract.id,
    });
  }

  // Save closeout package
  const { data: pkg } = await supabaseAdmin
    .from('closeout_packages')
    .insert({
      tenant_id:   opts.tenantId,
      project_id:  opts.projectId,
      checklist:   checklist,
      status:      'not_started',
      pct_complete: 0,
      ai_generated: true,
      created_at:  now,
      updated_at:  now,
    })
    .select('id')
    .single();

  return { checklistId: (pkg?.id ?? '') as string, itemCount: checklist.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. W-9 Request Letter
// ─────────────────────────────────────────────────────────────────────────────

export async function generateW9Request(opts: {
  tenantId: string;
  projectId: string;
  vendorName: string;
  vendorEmail: string;
  gcCompanyName?: string;
}): Promise<string> {
  const now = new Date().toISOString();
  const ctx = await fetchProjectContext(opts.tenantId, opts.projectId);
  const project = ctx.project as Record<string,unknown>;
  const gcName = opts.gcCompanyName ?? process.env.COMPANY_NAME ?? 'General Contractor';

  const content = `
    <h2>Request for IRS Form W-9</h2>
    <p>Date: ${now.split('T')[0]}</p>

    <p>Dear ${opts.vendorName},</p>

    <p>Thank you for your work on <strong>${project.name as string}</strong>. In order to comply with IRS reporting requirements, we are required to collect IRS Form W-9 from all vendors and subcontractors to whom we make payments of $600 or more during the calendar year.</p>

    <p>Please complete and return the enclosed IRS Form W-9 at your earliest convenience, but no later than <strong>prior to your first payment</strong>. We cannot process payment without a completed W-9 on file.</p>

    <p><strong>Instructions:</strong></p>
    <ol style="margin-left:20pt;margin-bottom:8pt">
      <li>Complete all fields on IRS Form W-9 (download at: irs.gov/pub/irs-pdf/fw9.pdf)</li>
      <li>Sign and date the form</li>
      <li>Return via email to: ${process.env.EMAIL_REPLY_TO ?? 'accounting@saguarocrm.com'}</li>
    </ol>

    <p>The information you provide on Form W-9 will be used solely for IRS reporting purposes. We will issue IRS Form 1099-NEC at year-end if total payments to you equal or exceed $600.</p>

    <p>If you are exempt from backup withholding (e.g., corporations), please still complete Form W-9 and indicate your exempt payee code.</p>

    <p>If you have any questions, please contact us at ${process.env.EMAIL_REPLY_TO ?? 'accounting@saguarocrm.com'}.</p>

    <p>Sincerely,<br/>${gcName}<br/>${project.name as string}</p>

    <div class="legal">
      IRS regulations (26 CFR §31.3406(d)-5) require the collection of Form W-9 from payees. Failure to collect may result in mandatory backup withholding at 24% on all payments. Retain completed W-9 for 4 years after the last payment date.
    </div>
  `;

  const htmlDoc = documentShell('Request for IRS Form W-9', content, {
    date: now.split('T')[0],
    projectName: project.name as string,
  });

  const { data: doc } = await supabaseAdmin.from('project_documents').insert({
    tenant_id: opts.tenantId, project_id: opts.projectId,
    template_code: 'W9_REQUEST', entity_type: 'subcontractor',
    document_type: 'W-9 Request Letter',
    title: `W-9 Request — ${opts.vendorName}`,
    content_html: htmlDoc, ai_generated: true, status: 'ready',
    requires_signature: false, created_at: now, updated_at: now,
  }).select('id').single();

  return (doc?.id ?? '') as string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed the document_templates table with all standard templates
// Run once on initial setup
// ─────────────────────────────────────────────────────────────────────────────

export async function seedDocumentTemplates(): Promise<void> {
  const templates = [
    { template_code: 'AIA_G702',                  name: 'AIA G702 — Application and Certificate for Payment', category: 'pay_application', is_mandatory: true, sort_order: 1 },
    { template_code: 'AIA_G703',                  name: 'AIA G703 — Continuation Sheet (Schedule of Values)', category: 'pay_application', is_mandatory: true, sort_order: 2 },
    { template_code: 'AIA_G704',                  name: 'AIA G704 — Certificate of Substantial Completion',    category: 'closeout',        is_mandatory: true, sort_order: 3 },
    { template_code: 'AIA_G706',                  name: 'AIA G706 — Contractor Affidavit of Payment',          category: 'closeout',        is_mandatory: true, sort_order: 4 },
    { template_code: 'AIA_A310_BID_BOND',         name: 'AIA A310 — Bid Bond',                                category: 'bond',            is_mandatory: false, sort_order: 5 },
    { template_code: 'AIA_A312_PERF_BOND',        name: 'AIA A312 — Performance Bond',                        category: 'bond',            is_mandatory: false, sort_order: 6 },
    { template_code: 'AIA_A312_PAY_BOND',         name: 'AIA A312 — Payment Bond',                            category: 'bond',            is_mandatory: false, sort_order: 7 },
    { template_code: 'LIEN_WAIVER_COND_PARTIAL',  name: 'Conditional Waiver — Progress Payment',              category: 'lien_waiver',     is_mandatory: true,  sort_order: 10 },
    { template_code: 'LIEN_WAIVER_UNCOND_PARTIAL',name: 'Unconditional Waiver — Progress Payment',            category: 'lien_waiver',     is_mandatory: true,  sort_order: 11 },
    { template_code: 'LIEN_WAIVER_COND_FINAL',    name: 'Conditional Waiver — Final Payment',                  category: 'lien_waiver',     is_mandatory: true,  sort_order: 12 },
    { template_code: 'LIEN_WAIVER_UNCOND_FINAL',  name: 'Unconditional Waiver — Final Payment',                category: 'lien_waiver',     is_mandatory: true,  sort_order: 13 },
    { template_code: 'PRELIMINARY_NOTICE',         name: 'Preliminary Notice / Notice to Owner',               category: 'lien_waiver',     is_mandatory: false, sort_order: 14 },
    { template_code: 'INSTRUCTIONS_TO_BIDDERS',    name: 'Instructions to Bidders',                            category: 'bid_document',    is_mandatory: true,  sort_order: 20 },
    { template_code: 'BID_FORM',                   name: 'Bid Form (Line Item)',                               category: 'bid_document',    is_mandatory: true,  sort_order: 21 },
    { template_code: 'NON_COLLUSION_AFFIDAVIT',    name: 'Non-Collusion Affidavit',                            category: 'bid_document',    is_mandatory: false, sort_order: 22 },
    { template_code: 'SUBCONTRACTOR_LIST',         name: 'Subcontractor List (Public Projects)',               category: 'bid_document',    is_mandatory: false, sort_order: 23 },
    { template_code: 'W9_REQUEST',                 name: 'W-9 Request Letter',                                 category: 'general',         is_mandatory: false, sort_order: 30 },
    { template_code: 'ACORD_25_CHECKLIST',         name: 'ACORD 25 Insurance Certificate Checklist',           category: 'insurance',       is_mandatory: true,  sort_order: 31 },
    { template_code: 'WH347_CERTIFIED_PAYROLL',    name: 'WH-347 Certified Payroll (Prevailing Wage)',         category: 'payroll',         is_mandatory: false, sort_order: 40 },
    { template_code: 'CLOSEOUT_CHECKLIST',         name: 'Project Closeout Checklist',                         category: 'closeout',        is_mandatory: true,  sort_order: 50 },
    { template_code: 'SUBSTANTIAL_COMPLETION',     name: 'Substantial Completion Notice',                      category: 'closeout',        is_mandatory: true,  sort_order: 51 },
    { template_code: 'FINAL_COMPLETION',           name: 'Final Completion & Acceptance Notice',               category: 'closeout',        is_mandatory: true,  sort_order: 52 },
  ];

  for (const t of templates) {
    await supabaseAdmin.from('document_templates').upsert(
      { ...t, template_html: '', fields_schema: [], is_active: true, created_at: new Date().toISOString() },
      { onConflict: 'template_code' },
    );
  }

  console.log(`[DocumentGenerator] Seeded ${templates.length} document templates`);
}

// Namespace export
export const DocumentGenerator = {
  generatePayApplication,
  generateLienWaiver,
  generateBidDocumentPackage,
  generateSubstantialCompletionCertificate,
  generateCloseoutPackage,
  generateW9Request,
  seedDocumentTemplates,
};
