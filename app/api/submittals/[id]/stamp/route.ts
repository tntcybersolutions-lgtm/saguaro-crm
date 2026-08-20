import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  const { id } = await params
  const body = await req.json()

  const STAMP_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    approved:           { label: 'APPROVED',              color: '#16a34a', bg: '#dcfce7', border: '#16a34a' },
    approved_as_noted:  { label: 'APPROVED AS NOTED',     color: '#b45309', bg: '#fef3c7', border: '#d97706' },
    revise_resubmit:    { label: 'REVISE AND RESUBMIT',   color: '#1d4ed8', bg: '#dbeafe', border: '#2563eb' },
    rejected:           { label: 'REJECTED',              color: '#dc2626', bg: '#fee2e2', border: '#dc2626' },
  }

  const stamp = STAMP_CONFIG[body.stamp as string]
  if (!stamp) return NextResponse.json({ error: 'Invalid stamp type' }, { status: 400 })

  const { data: sub, error } = await supabase
    .from('submittals')
    .select(`
      *,
      projects(name, address, city, state),
      subcontractors(company_name)
    `)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (error || !sub) return NextResponse.json({ error: 'Submittal not found' }, { status: 404 })

  const { data: settings } = await supabase
    .from('tenant_settings')
    .select('company_name, company_address, company_city, company_state, company_zip, company_phone, license_number')
    .eq('tenant_id', tenantId)
    .single()

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const submitDate = sub.submitted_date ? new Date(sub.submitted_date).toLocaleDateString() : 'N/A'

  const projectData = sub.projects as Record<string, string> | null
  const subData = sub.subcontractors as Record<string, string> | null

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Submittal ${sub.submittal_number} — ${stamp.label}</title>
  <style>
    @page { size: letter; margin: 0.75in; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', serif; font-size: 11pt; color: #000; line-height: 1.4; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #000; }
    .company-name { font-size: 16pt; font-weight: bold; }
    .company-info { font-size: 9pt; color: #333; margin-top: 4px; }
    .doc-title { font-size: 14pt; font-weight: bold; text-align: center; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1px; }
    .stamp-box { border: 3px solid ${stamp.border}; background: ${stamp.bg}; padding: 16px 24px; margin: 20px 0; text-align: center; border-radius: 4px; }
    .stamp-label { font-size: 20pt; font-weight: bold; color: ${stamp.color}; letter-spacing: 2px; text-transform: uppercase; }
    .stamp-date { font-size: 10pt; color: #555; margin-top: 6px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin: 20px 0; border: 1px solid #000; }
    .info-cell { padding: 8px 12px; border-right: 1px solid #000; border-bottom: 1px solid #000; }
    .info-cell:nth-child(even) { border-right: none; }
    .info-label { font-size: 8pt; font-weight: bold; text-transform: uppercase; color: #555; margin-bottom: 2px; }
    .info-value { font-size: 10pt; }
    .notes-section { margin-top: 20px; border: 1px solid #000; padding: 12px; min-height: 100px; }
    .notes-label { font-size: 9pt; font-weight: bold; text-transform: uppercase; color: #555; margin-bottom: 8px; }
    .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
    .sig-line { border-top: 1px solid #000; padding-top: 6px; font-size: 9pt; }
    .footer { margin-top: 32px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 8pt; color: #666; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${settings?.company_name || 'General Contractor'}</div>
      <div class="company-info">${settings?.company_address || ''} ${settings?.company_city || ''}, ${settings?.company_state || ''} ${settings?.company_zip || ''}</div>
      <div class="company-info">${settings?.company_phone || ''} ${settings?.license_number ? '| Lic #' + settings.license_number : ''}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:9pt;color:#555;">SUBMITTAL REVIEW FORM</div>
      <div style="font-size:9pt;color:#555;">Date: ${today}</div>
    </div>
  </div>

  <div class="doc-title">Submittal Transmittal &amp; Review</div>

  <div class="stamp-box">
    <div class="stamp-label">${stamp.label}</div>
    <div class="stamp-date">Reviewed by: ${body.reviewer_name || 'Reviewer'} &middot; ${today}</div>
  </div>

  <div class="info-grid">
    <div class="info-cell">
      <div class="info-label">Project</div>
      <div class="info-value">${projectData?.name || ''}</div>
    </div>
    <div class="info-cell">
      <div class="info-label">Project Address</div>
      <div class="info-value">${projectData?.address || ''} ${projectData?.city || ''}, ${projectData?.state || ''}</div>
    </div>
    <div class="info-cell">
      <div class="info-label">Submittal Number</div>
      <div class="info-value">${sub.submittal_number}</div>
    </div>
    <div class="info-cell">
      <div class="info-label">Spec Section</div>
      <div class="info-value">${sub.spec_section || 'N/A'}</div>
    </div>
    <div class="info-cell">
      <div class="info-label">Submittal Title</div>
      <div class="info-value">${sub.title || sub.description || ''}</div>
    </div>
    <div class="info-cell">
      <div class="info-label">Submittal Type</div>
      <div class="info-value" style="text-transform:capitalize">${sub.type || 'Product Data'}</div>
    </div>
    <div class="info-cell">
      <div class="info-label">Submitted By</div>
      <div class="info-value">${subData?.company_name || 'Subcontractor'}</div>
    </div>
    <div class="info-cell">
      <div class="info-label">Date Submitted</div>
      <div class="info-value">${submitDate}</div>
    </div>
    <div class="info-cell">
      <div class="info-label">Revision</div>
      <div class="info-value">${sub.revision_number || '0'}</div>
    </div>
    <div class="info-cell">
      <div class="info-label">Date Reviewed</div>
      <div class="info-value">${today}</div>
    </div>
  </div>

  <div class="notes-section">
    <div class="notes-label">Reviewer Notes / Required Actions</div>
    <div style="font-size:10pt;line-height:1.7;white-space:pre-wrap">${body.notes || (body.stamp === 'approved' ? 'No exceptions taken.' : body.stamp === 'approved_as_noted' ? 'Approved subject to compliance with the notes indicated herein. Resubmittal is not required.' : 'See comments above. Revise and resubmit for review.')}</div>
  </div>

  <div style="margin-top:12px;font-size:8pt;color:#555;font-style:italic;line-height:1.5">
    This review is for general conformance with the design concept of the project and general compliance with the contract documents. Corrections or comments made on this submittal during this review do not relieve the contractor from compliance with the requirements of the plans and specifications. This approval does not authorize any changes in the contract price or time.
  </div>

  <div class="signature-section">
    <div>
      <div style="margin-bottom:40px;"></div>
      <div class="sig-line">Reviewer Signature</div>
      <div style="font-size:9pt;margin-top:4px;">${body.reviewer_name || '___________________________'}</div>
    </div>
    <div>
      <div style="margin-bottom:40px;"></div>
      <div class="sig-line">Date</div>
      <div style="font-size:9pt;margin-top:4px;">${today}</div>
    </div>
  </div>

  <div class="footer">
    Generated by Saguaro Construction Intelligence Platform &middot; ${settings?.company_name || ''} &middot; ${today}
  </div>

  <script>window.onload = () => window.print()</script>
</body>
</html>`

  const statusMap: Record<string, string> = {
    approved: 'approved',
    approved_as_noted: 'approved_as_noted',
    revise_resubmit: 'revise_and_resubmit',
    rejected: 'rejected',
  }

  await supabase.from('submittals').update({
    status: statusMap[body.stamp as string],
    reviewed_date: new Date().toISOString().split('T')[0],
    review_notes: body.notes || null,
  }).eq('id', id).eq('tenant_id', tenantId)

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
      'Content-Disposition': `inline; filename="submittal-${sub.submittal_number}-${body.stamp}.html"`,
    },
  })
}
