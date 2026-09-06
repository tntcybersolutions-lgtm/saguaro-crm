import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'
import Anthropic from '@anthropic-ai/sdk'
import { getLienLaw, getCaliforniaStatutoryWaiverText, STATES_WITH_STATUTORY_FORMS } from '@/lib/lien-law/states'

export const runtime = 'nodejs'
export const maxDuration = 30

const WAIVER_TYPE_LABELS: Record<string, string> = {
  conditional_partial:   'Conditional Waiver and Release on Progress Payment',
  unconditional_partial: 'Unconditional Waiver and Release on Progress Payment',
  conditional_final:     'Conditional Waiver and Release on Final Payment',
  unconditional_final:   'Unconditional Waiver and Release on Final Payment',
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { id } = await params

  const { data: waiver } = await supabase.from('lien_waivers')
    .select('*').eq('id', id).eq('tenant_id', tenantId).single()
  if (!waiver) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: gc }, { data: project }] = await Promise.all([
    supabase.from('tenant_settings')
      .select('company_name, company_address, company_city, company_state, company_zip, company_phone, company_email, license_number, license_state, ein, signature_name, signature_title')
      .eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('projects')
      .select('name, address, city, state, owner_name, owner_company').eq('tenant_id', tenantId)
      .eq('id', waiver.project_id).maybeSingle(),
  ])

  const stateCode = waiver.state || project?.state || gc?.company_state || 'XX'
  const law = getLienLaw(stateCode)
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const waiverTitle = WAIVER_TYPE_LABELS[waiver.waiver_type as string] || 'Lien Waiver'
  const amount = Number(waiver.amount || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  const isConditional = String(waiver.waiver_type || '').startsWith('conditional')
  const isFinal = String(waiver.waiver_type || '').endsWith('final')
  const gcName = gc?.company_name || waiver.gc_company_name || waiver.gc_name || 'General Contractor'
  const gcFullAddress = gc?.company_address
    ? `${gc.company_address}, ${gc.company_city || ''}, ${gc.company_state || ''} ${gc.company_zip || ''}`.trim()
    : ''

  // ── Generate waiver body content ──────────────────────────────
  let waiverBodyContent = ''

  if (STATES_WITH_STATUTORY_FORMS.includes(stateCode)) {
    // California — use EXACT mandatory statutory language
    waiverBodyContent = getCaliforniaStatutoryWaiverText(
      waiver.waiver_type,
      amount,
      waiver.through_date || today,
      waiver.company_name || waiver.claimant_name || 'Claimant',
    )
  } else {
    // All other states — Claude generates state-specific content
    const client = new Anthropic()
    const notarizationNote = law.notarizationRequired
      ? '\n\nIMPORTANT: This document must be notarized to be enforceable under state law.'
      : ''
    const lienAgentNote = law.lienAgentRequired
      ? `\n\nNOTE: This project may require a designated Lien Agent under ${law.stateName} law (${law.lienStatute}).`
      : ''
    const monthlyNote = law.monthlyNoticeRequired
      ? `\n\nTEXAS COMPLIANCE: Monthly notices must be served by the 15th of each month for unpaid work.`
      : ''

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: `You are a construction law expert. Generate a professional lien waiver document body.
Use precise legal language appropriate for ${law.stateName} (${law.lienStatute}).
Do not include HTML — return plain text with clear paragraph breaks.
Include all legally required elements for a ${waiverTitle} in ${law.stateName}.`,
      messages: [{
        role: 'user',
        content: `Generate the legal body text for a ${waiverTitle} in ${law.stateName}.
Statute: ${law.lienStatute}

PARTIES:
Claimant (Sub): ${waiver.company_name || waiver.claimant_name || 'Subcontractor'}
General Contractor: ${gcName}
Owner: ${waiver.owner_name || project?.owner_name || 'Owner'}
Project Address: ${waiver.project_address || [project?.address, project?.city ? `${project.city}, ${project.state}` : ''].filter(Boolean).join(', ')}

PAYMENT DETAILS:
Amount: ${amount}
Through Date: ${waiver.through_date || today}
Payment Date: ${waiver.payment_date || (isConditional ? 'Upon receipt of payment' : today)}
Check/Payment No.: ${waiver.check_number || '________________________'}

Include:
1. Recital identifying all parties and the project
2. ${isConditional
  ? 'Conditional release language — this waiver is effective ONLY upon actual receipt of payment'
  : 'Unconditional release — claimant confirms payment was received and unconditionally waives all lien rights'}
3. ${isFinal
  ? 'Final release of ALL lien rights, claims, and demands through project completion'
  : 'Partial release for work and materials furnished through the through date only'}
4. Exceptions clause (blank line for any exceptions to be noted)
5. State-specific language required under ${law.lienStatute}
6. Warranty that no other liens have been filed or will be filed for amounts covered
${notarizationNote}${lienAgentNote}${monthlyNote}

Be specific to ${law.stateName} law. Do not use Arizona statutory language.`,
      }],
    })
    const firstBlock = msg.content[0]
    waiverBodyContent = firstBlock && firstBlock.type === 'text' ? firstBlock.text : ''
  }

  // ── Build full HTML document ──────────────────────────────────
  const notarizationBlock = law.notarizationRequired ? `
    <div style="margin-top:28px;padding:16px;border:2px solid #333;page-break-inside:avoid">
      <div style="font-size:11pt;font-weight:900;text-transform:uppercase;margin-bottom:12px">
        NOTARIZATION (Required under ${law.stateName} Law)
      </div>
      <div style="margin-bottom:8px">State of __________________________ County of __________________________</div>
      <div style="margin-bottom:12px">On this _____ day of __________________, 20____, before me personally appeared __________________________, known to me to be the person whose name is subscribed to the within instrument and acknowledged that they executed the same for the purposes therein contained.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:16px">
        <div>
          <div style="border-bottom:1px solid #333;margin-bottom:4px;min-height:32px"></div>
          <div style="font-size:9pt;color:#666">Notary Public Signature</div>
        </div>
        <div>
          <div style="border-bottom:1px solid #333;margin-bottom:4px;min-height:32px"></div>
          <div style="font-size:9pt;color:#666">Commission Expiration Date</div>
        </div>
      </div>
      <div style="margin-top:12px">Notary Seal:</div>
    </div>` : ''

  const lienAgentBlock = law.lienAgentRequired && waiver.lien_agent_name ? `
    <div style="margin-top:16px;padding:12px;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px">
      <div style="font-size:10pt;font-weight:700;color:#92400e">
        ${law.stateName} Lien Agent (Required for projects over ${law.lienAgentThreshold ? '$' + law.lienAgentThreshold.toLocaleString() : '$30,000'})
      </div>
      <div style="font-size:9.5pt;color:#92400e;margin-top:4px">
        Lien Agent: ${waiver.lien_agent_name || '________________________'}<br/>
        Address: ${waiver.lien_agent_address || '________________________'}
      </div>
    </div>` : ''

  const stateWarningBlock = law.preliminaryNoticeRequired ? `
    <div style="margin-bottom:16px;padding:10px 14px;background:#fef3c7;border-left:4px solid #F0B429;font-size:9pt;color:#92400e">
      <strong>${law.stateName} Notice:</strong> Preliminary notice (${law.preliminaryNoticeStatute}) required within
      ${law.preliminaryNoticeDays} days of first furnishing. Recipients: ${law.preliminaryNoticeRecipients.join(', ')}.
    </div>` : ''

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${waiverTitle} — ${law.stateName}</title>
  <style>
    @page { size: letter portrait; margin: 0.75in; }
    @media print { .no-print { display:none!important; } }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #1a1a1a; background: #fff; line-height: 1.55; }
    .header { background: linear-gradient(135deg, #1a1a2e, #16213e); color: #fff; padding: 16px 22px; display: flex; justify-content: space-between; align-items: flex-start; }
    .company { font-size: 13pt; font-weight: 900; color: #fff; }
    .sub-info { font-size: 8pt; color: rgba(255,255,255,.65); margin-top: 3px; line-height: 1.6; }
    .gold-bar { height: 4px; background: linear-gradient(90deg, #D4A017, #F0C040); }
    .title-bar { background: #f7f8fa; border-bottom: 2px solid #D4A017; padding: 12px 22px; }
    .doc-title { font-size: 12.5pt; font-weight: 900; color: #1a1a2e; text-transform: uppercase; letter-spacing: 0.03em; }
    .state-label { font-size: 9pt; color: #666; margin-top: 3px; }
    .content { padding: 18px 22px; }
    .badge { display: inline-block; padding: 3px 12px; border-radius: 12px; font-size: 8.5pt; font-weight: 700; margin-bottom: 14px; }
    .badge-conditional { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
    .badge-unconditional { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
    .badge-statutory { background: #ede9fe; color: #5b21b6; border: 1px solid #c4b5fd; }
    .info-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 9.5pt; }
    .info-table td { padding: 5px 10px; border: 1px solid #ddd; }
    .info-table td:first-child { font-weight: 700; color: #555; background: #f8f8f8; width: 140px; }
    .waiver-body { font-size: 9.5pt; line-height: 1.65; white-space: pre-wrap; margin-bottom: 20px; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 24px; }
    .sig-line { border-bottom: 1px solid #333; margin-bottom: 4px; min-height: 36px; }
    .sig-label { font-size: 8.5pt; color: #666; }
    .print-btn { position: fixed; top: 16px; right: 16px; background: #D4A017; color: #000; border: none; padding: 8px 18px; font-size: 12px; font-weight: 700; cursor: pointer; border-radius: 6px; box-shadow: 0 2px 10px rgba(212,160,23,.4); z-index: 999; }
    h4 { font-size: 10pt; font-weight: 900; color: #1a1a2e; margin: 14px 0 8px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save PDF</button>
  <div class="header">
    <div>
      <div class="company">${gcName}</div>
      <div class="sub-info">
        ${gcFullAddress ? gcFullAddress + '<br/>' : ''}
        ${gc?.company_phone ? gc.company_phone + ' · ' : ''}${gc?.company_email || ''}
        ${gc?.license_number ? '<br/>License: ' + gc.license_number + (gc?.license_state ? ' (' + gc.license_state + ')' : '') : ''}
      </div>
    </div>
    <div style="text-align:right;font-size:8pt;color:rgba(255,255,255,.7);line-height:1.7">
      <strong>LIEN WAIVER</strong><br>${today}
    </div>
  </div>
  <div class="gold-bar"></div>
  <div class="title-bar">
    <div class="doc-title">${waiverTitle}</div>
    <div class="state-label">State of ${law.stateName} · ${law.lienStatute} · ${today}</div>
  </div>
  <div class="content">
    ${stateWarningBlock}

    <div class="badge ${isConditional ? 'badge-conditional' : 'badge-unconditional'}" style="margin-right:8px">
      ${isConditional ? '⚠️ CONDITIONAL — Effective only upon receipt of payment' : '✅ UNCONDITIONAL — Payment confirmed received'}
    </div>
    ${law.statutoryFormRequired ? `<div class="badge badge-statutory">📋 Statutory Form (${law.statutoryFormCitation})</div>` : ''}
    ${law.notarizationRequired ? `<div class="badge" style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;margin-left:4px">✒️ Notarization Required</div>` : ''}

    <h4>Project &amp; Party Information</h4>
    <table class="info-table">
      <tr><td>Claimant</td><td><strong>${waiver.company_name || waiver.claimant_name || '________________________'}</strong></td></tr>
      <tr><td>GC / Owner</td><td>${gcName} ${waiver.owner_name ? '/ Owner: ' + waiver.owner_name : ''}</td></tr>
      <tr><td>Project Address</td><td>${waiver.project_address || [project?.address, project?.city ? `${project.city}, ${project.state}` : ''].filter(Boolean).join(', ') || '________________________'}</td></tr>
      <tr><td>Waiver Type</td><td>${waiverTitle}</td></tr>
      <tr><td>Amount</td><td><strong style="color:#D4A017">${amount}</strong>${waiver.retainage_amount ? ' + $' + Number(waiver.retainage_amount).toLocaleString() + ' retainage' : ''}</td></tr>
      <tr><td>Through Date</td><td>${waiver.through_date || '________________________'}</td></tr>
      ${!isConditional ? `<tr><td>Payment Date</td><td>${waiver.payment_date || today}</td></tr>` : ''}
      ${waiver.check_number ? `<tr><td>Check / Payment No.</td><td>${waiver.check_number}</td></tr>` : ''}
      ${waiver.application_number ? `<tr><td>Pay App No.</td><td>#${waiver.application_number}</td></tr>` : ''}
      <tr><td>Statute</td><td style="font-size:8.5pt;color:#666">${law.lienStatute}</td></tr>
    </table>

    ${lienAgentBlock}

    <h4>Waiver &amp; Release</h4>
    <div class="waiver-body">${waiverBodyContent}</div>

    <div style="margin-top:16px;padding:12px;background:#f8f8f8;border:1px solid #ddd;font-size:9pt">
      <strong>Exceptions:</strong> The following amounts are expressly NOT waived and released by this document:
      <div style="border-bottom:1px solid #aaa;margin:8px 0 4px;min-height:24px">${waiver.exceptions || ''}</div>
      <div style="color:#666;font-size:8.5pt">(If no exceptions, write "NONE" or leave blank)</div>
    </div>

    <h4>Signature</h4>
    <div class="sig-grid">
      <div>
        <div class="sig-line">&nbsp;</div>
        <div class="sig-label">Authorized Signature</div>
      </div>
      <div>
        <div class="sig-line">&nbsp;</div>
        <div class="sig-label">Date</div>
      </div>
      <div>
        <div class="sig-line">${waiver.signed_name || '&nbsp;'}</div>
        <div class="sig-label">Printed Name</div>
      </div>
      <div>
        <div class="sig-line">${waiver.signer_title || '&nbsp;'}</div>
        <div class="sig-label">Title / Position</div>
      </div>
      <div>
        <div class="sig-line">${waiver.company_name || waiver.claimant_name || '&nbsp;'}</div>
        <div class="sig-label">Company Name</div>
      </div>
      <div>
        <div class="sig-line">&nbsp;</div>
        <div class="sig-label">Claimant Address</div>
      </div>
    </div>

    ${notarizationBlock}

    <div style="margin-top:20px;padding:10px;border-top:1px solid #ddd;font-size:8pt;color:#888">
      DISCLAIMER: This document was generated by Saguaro Construction Intelligence Platform using data from ${law.stateName} construction lien statutes (${law.lienStatute}). This document does not constitute legal advice. Verify compliance with current state statutes and consult a licensed state construction attorney before relying on this document for legal purposes. Laws change — always confirm current deadlines.
    </div>
  </div>
</body>
</html>`

  // Save html_content + update status
  await supabase.from('lien_waivers').update({
    html_content: html,
    state_statute: law.lienStatute,
    notarization_required: law.notarizationRequired,
    statutory_form_required: law.statutoryFormRequired,
    notice_required: law.preliminaryNoticeRequired,
    status: waiver.status === 'draft' ? 'draft' : waiver.status,
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('tenant_id', tenantId)

  // Log to generated_documents
  await supabase.from('generated_documents').insert({
    tenant_id: tenantId,
    project_id: waiver.project_id,
    doc_type: `lien_waiver_${waiver.waiver_type}`,
    status: 'generated',
    created_by: 'sage_ai',
    source_type: 'lien_waiver',
    source_id: id,
    data_snapshot: {
      waiver_id: id,
      waiver_type: waiver.waiver_type,
      state: stateCode,
      statute: law.lienStatute,
      claimant: waiver.claimant_name,
      amount: waiver.amount,
      statutory_form: law.statutoryFormRequired,
      notarization_required: law.notarizationRequired,
    },
  }).then(({ error }) => { if (error) console.error('[WAIVER-GEN] generated_documents error:', error.message) }, () => {})

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
