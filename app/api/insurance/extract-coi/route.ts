import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'
import Anthropic from '@anthropic-ai/sdk'
import { prepareImageForClaude, ImagePrepError, detectImageType } from '@/lib/image-detect'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  const { fileUrl, subcontractorId, projectId } = await req.json()
  if (!fileUrl || !subcontractorId) {
    return NextResponse.json({ error: 'fileUrl and subcontractorId required' }, { status: 400 })
  }

  const pdfRes = await fetch(fileUrl)
  if (!pdfRes.ok) return NextResponse.json({ error: 'Could not fetch COI file' }, { status: 400 })
  const coiBuffer = Buffer.from(await pdfRes.arrayBuffer())

  // COIs arrive as PDFs, but sometimes as a phone photo (JPG/PNG/HEIC) of the
  // ACORD form. Detect the real type from the bytes and build the right block.
  const detected = detectImageType(coiBuffer)
  let sourceBlock: Anthropic.Messages.ContentBlockParam
  if (detected === 'application/pdf' || detected === 'unknown') {
    sourceBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: coiBuffer.toString('base64') } }
  } else {
    try {
      const prepared = await prepareImageForClaude(coiBuffer)
      sourceBlock = { type: 'image', source: { type: 'base64', media_type: prepared.mediaType, data: prepared.base64 } }
    } catch (e) {
      if (e instanceof ImagePrepError) return NextResponse.json({ error: e.message }, { status: 422 })
      throw e
    }
  }

  const client = new Anthropic()
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: 'You are an insurance certificate (ACORD form) expert. Extract all fields. Return ONLY valid JSON, no markdown.',
    messages: [{
      role: 'user',
      content: [
        sourceBlock,
        {
          type: 'text',
          text: `Extract all insurance certificate data from this COI document (typically an ACORD 25 form).
Return this exact JSON structure:
{
  "insured_name": "company name on the certificate",
  "insured_address": "address",
  "insurer_name": "insurance company name",
  "policy_number_gl": "general liability policy number",
  "policy_number_auto": "auto policy number or null",
  "policy_number_wc": "workers comp policy number or null",
  "policy_number_umbrella": "umbrella policy number or null",
  "effective_date": "YYYY-MM-DD or null",
  "expiry_date": "YYYY-MM-DD — use the LATEST expiration date across all policies",
  "gl_expiry": "YYYY-MM-DD or null",
  "auto_expiry": "YYYY-MM-DD or null",
  "wc_expiry": "YYYY-MM-DD or null",
  "umbrella_expiry": "YYYY-MM-DD or null",
  "each_occurrence": number (dollar amount, e.g. 1000000),
  "general_aggregate": number,
  "products_completed": number or null,
  "auto_liability": number or null,
  "workers_comp": number or null,
  "umbrella_aggregate": number or null,
  "additional_insured": boolean (true if certificate holder is listed as additional insured),
  "waiver_of_subrogation": boolean,
  "certificate_holder": "name and address of certificate holder",
  "description_of_operations": "description or null",
  "confidence": number (0.0 to 1.0 — how confident you are in the extraction)
}`,
        },
      ],
    }],
  })

  const rawText = msg.content[0]?.type === 'text' ? msg.content[0].text.replace(/```json\n?|\n?```/g, '').trim() : '{}'
  let extracted: Record<string, unknown> = {}
  try { extracted = JSON.parse(rawText) } catch { /* empty */ }

  const { data: gc } = await supabase
    .from('tenant_settings')
    .select('company_name')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  const gcName = gc?.company_name || 'General Contractor'

  const expiryDate = String(extracted.expiry_date || '')
  const isExpired = expiryDate ? new Date(expiryDate) < new Date() : false
  const eachOccurrence = Number(extracted.each_occurrence || 0)
  const generalAggregate = Number(extracted.general_aggregate || 0)
  const minEachOccurrence = 1000000
  const minGeneralAggregate = 2000000
  const meetsCoverageReqs = eachOccurrence >= minEachOccurrence && generalAggregate >= minGeneralAggregate

  const { data: existing } = await supabase
    .from('subcontractor_insurance')
    .select('id')
    .eq('subcontractor_id', subcontractorId)
    .eq('tenant_id', tenantId)
    .eq('policy_type', 'general_liability')
    .maybeSingle()

  const expiryFallback = expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const insuranceRecord = {
    tenant_id: tenantId,
    subcontractor_id: subcontractorId,
    project_id: projectId || null,
    policy_type: 'general_liability',
    carrier: String(extracted.insurer_name || ''),
    policy_number: String(extracted.policy_number_gl || ''),
    coverage_amount: eachOccurrence || 0,
    effective_date: extracted.effective_date ? String(extracted.effective_date) : null,
    expiry_date: expiryFallback,
    additional_insured: Boolean(extracted.additional_insured),
    waiver_of_subrogation: Boolean(extracted.waiver_of_subrogation),
    pdf_url: fileUrl,
    status: isExpired ? 'expired' : 'active',
    ai_extracted: true,
    ai_confidence: Number(extracted.confidence || 0.8),
    raw_coi_text: rawText.slice(0, 2000),
    payment_blocked: isExpired || !meetsCoverageReqs,
    each_occurrence: eachOccurrence,
    general_aggregate: generalAggregate,
    workers_comp: Number(extracted.workers_comp || 0),
    auto_liability: Number(extracted.auto_liability || 0),
    umbrella_aggregate: Number(extracted.umbrella_aggregate || 0),
  }

  let certId: string
  if (existing?.id) {
    await supabase.from('subcontractor_insurance').update(insuranceRecord).eq('id', existing.id)
    certId = existing.id
  } else {
    const { data: newCert, error: insErr } = await supabase
      .from('subcontractor_insurance')
      .insert(insuranceRecord)
      .select('id')
      .single()
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    certId = newCert?.id || ''
  }

  return NextResponse.json({
    success: true,
    certId,
    extracted,
    isExpired,
    meetsCoverageReqs,
    paymentBlocked: isExpired || !meetsCoverageReqs,
    warnings: [
      ...(isExpired ? ['⚠️ COI is EXPIRED — payment will be blocked until renewed'] : []),
      ...(!meetsCoverageReqs ? [`⚠️ Coverage below minimum: GL each occurrence must be ≥ $${minEachOccurrence.toLocaleString()}`] : []),
      ...(!extracted.additional_insured ? [`⚠️ ${gcName} is not listed as Additional Insured`] : []),
      ...(!extracted.waiver_of_subrogation ? ['⚠️ No Waiver of Subrogation endorsement found'] : []),
    ],
  })
}
