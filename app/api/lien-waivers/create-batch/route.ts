import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'
import { getLienLaw } from '@/lib/lien-law/states'
import crypto from 'crypto'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  const body = await req.json().catch(() => ({})) as {
    projectId?: string
    waiverType?: string
    payAppId?: string
  }

  const projectId = body.projectId
  const waiverType = body.waiverType || 'conditional_partial'
  const payAppId = body.payAppId

  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const [{ data: awardedSubs }, { data: project }, { data: gc }] = await Promise.all([
    supabase.from('bid_submissions')
      .select('id, company_name, sub_name, base_bid, amount, sub_id, contact_email, sub_email, contact_name')
      .eq('project_id', projectId).eq('tenant_id', tenantId).eq('is_awarded', true),
    supabase.from('projects')
      .select('state, end_date, address, city, owner_name').eq('id', projectId).eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('tenant_settings')
      .select('company_name, default_retainage_pct').eq('tenant_id', tenantId).maybeSingle(),
  ])

  const stateCode = (project as { state?: string } | null)?.state || 'XX'
  const law = getLienLaw(stateCode)

  const subs = (awardedSubs as Array<Record<string, unknown>> | null) || []

  const inserts = subs.map((sub) => {
    const firstFurnished = new Date()
    const prelimDeadline = law.preliminaryNoticeRequired && law.preliminaryNoticeDays
      ? new Date(firstFurnished.setDate(firstFurnished.getDate() + law.preliminaryNoticeDays)).toISOString().split('T')[0]
      : null

    const projectEndDate = (project as { end_date?: string } | null)?.end_date
      ? new Date((project as { end_date: string }).end_date)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    const lienTrigger = law.lienFilingTrigger === 'substantial_completion' ? projectEndDate : projectEndDate
    const mechanicsLienDeadline = new Date(lienTrigger)
    mechanicsLienDeadline.setDate(mechanicsLienDeadline.getDate() + law.lienFilingDays)

    const bondClaimDate = law.bondClaimDays ? new Date(projectEndDate) : null
    if (bondClaimDate && law.bondClaimDays) bondClaimDate.setDate(bondClaimDate.getDate() + law.bondClaimDays)

    const ntoDate = law.noticeToOwnerRequired && law.noticeToOwnerDays
      ? (() => { const d = new Date(); d.setDate(d.getDate() + (law.noticeToOwnerDays as number)); return d.toISOString().split('T')[0] })()
      : null

    const baseBidNum = Number((sub.base_bid as number) || (sub.amount as number) || 0)
    const retainagePct = Number((gc as { default_retainage_pct?: number } | null)?.default_retainage_pct) || 10

    const projectAddr = project as { address?: string; city?: string; state?: string; owner_name?: string } | null

    return {
      tenant_id: tenantId,
      project_id: projectId,
      pay_application_id: payAppId || null,
      bid_submission_id: sub.id,
      subcontractor_id: sub.sub_id || null,
      waiver_type: waiverType,
      status: 'draft',
      claimant_name: sub.company_name || sub.sub_name || 'Subcontractor',
      company_name: sub.company_name || sub.sub_name || '',
      claimant_email: sub.contact_email || sub.sub_email || '',
      sent_to_email: sub.contact_email || sub.sub_email || '',
      contact_name: sub.contact_name || '',
      amount: baseBidNum,
      through_date: new Date().toISOString().split('T')[0],
      state: stateCode,
      state_statute: law.lienStatute,
      gc_company_name: (gc as { company_name?: string } | null)?.company_name || 'General Contractor',
      owner_name: projectAddr?.owner_name || 'Owner',
      project_address: [projectAddr?.address, projectAddr?.city ? `${projectAddr.city}, ${projectAddr.state}` : ''].filter(Boolean).join(', '),
      token: crypto.randomUUID(),
      is_payment_gate: true,
      retainage_amount: baseBidNum * (retainagePct / 100),
      notice_required: law.preliminaryNoticeRequired,
      notarization_required: law.notarizationRequired,
      statutory_form_required: law.statutoryFormRequired,
      preliminary_notice_required: law.preliminaryNoticeRequired,
      preliminary_notice_deadline: prelimDeadline,
      mechanics_lien_deadline: mechanicsLienDeadline.toISOString().split('T')[0],
      bond_claim_deadline: bondClaimDate ? bondClaimDate.toISOString().split('T')[0] : null,
      notice_to_owner_deadline: ntoDate,
      monthly_notice_required: law.monthlyNoticeRequired,
      lien_agent_required: law.lienAgentRequired,
    }
  })

  if (inserts.length === 0) {
    return NextResponse.json({ success: true, created: 0, message: 'No awarded subs found' })
  }

  const { data, error } = await supabase.from('lien_waivers').insert(inserts).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, created: data?.length ?? 0, state: stateCode })
}
