import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

interface InsuranceRecord {
  insurance_type: string
  status: string
  expiration_date: string
  days_until_expiry: number | null
}

interface ComplianceRecord {
  sub_id: string
  company_name: string
  contact_email: string | null
  has_gl: boolean; gl_expiry: string | null; gl_status: string
  has_wc: boolean; wc_expiry: string | null; wc_status: string
  has_auto: boolean; auto_expiry: string | null; auto_status: string
  overall_status: 'compliant' | 'expiring' | 'expired' | 'missing'
  worst_expiry_days: number | null
  missing_types: string[]
}

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const url = new URL(req.url)
    const projectId = url.searchParams.get('projectId')

    const db = createServerClient()

    // Get subs — either project-specific or all
    let subsQuery = db
      .from('subcontractors')
      .select('id, company_name, contact_email, email')
      .eq('tenant_id', user.tenantId)
      .order('company_name')

    if (projectId) {
      const { data: projSubs } = await db
        .from('project_subcontractors')
        .select('subcontractor_id')
        .eq('project_id', projectId)
        .eq('tenant_id', user.tenantId)

      const subIds = (projSubs || []).map(ps => ps.subcontractor_id)
      if (subIds.length > 0) {
        subsQuery = subsQuery.in('id', subIds)
      } else {
        return NextResponse.json({ data: [], summary: { total_subs: 0, compliant: 0, expiring_in_30: 0, expired: 0, missing_insurance: 0 } })
      }
    }

    const { data: subs, error: subsErr } = await subsQuery
    if (subsErr) throw subsErr

    // Get all insurance records for these subs
    const subIds = (subs || []).map(s => s.id)
    const { data: insurance } = await db
      .from('sub_insurance')
      .select('subcontractor_id, insurance_type, status, expiration_date, days_until_expiry')
      .eq('tenant_id', user.tenantId)
      .in('subcontractor_id', subIds.length > 0 ? subIds : ['none'])

    // Build compliance records
    const insuranceBySubId: Record<string, InsuranceRecord[]> = {}
    for (const ins of (insurance || [])) {
      if (!insuranceBySubId[ins.subcontractor_id]) insuranceBySubId[ins.subcontractor_id] = []
      insuranceBySubId[ins.subcontractor_id].push(ins)
    }

    const data: ComplianceRecord[] = (subs || []).map(sub => {
      const records = insuranceBySubId[sub.id] || []

      const getTypeStatus = (type: string) => {
        const rec = records.find(r => r.insurance_type === type && r.status !== 'waived')
        return {
          has: !!rec && rec.status === 'active',
          expiry: rec?.expiration_date || null,
          status: rec?.status || 'missing',
          days: rec?.days_until_expiry ?? null,
        }
      }

      const gl = getTypeStatus('general_liability')
      const wc = getTypeStatus('workers_compensation')
      const auto = getTypeStatus('auto_liability')

      const missing: string[] = []
      if (!gl.has && gl.status !== 'active') missing.push('General Liability')
      if (!wc.has && wc.status !== 'active') missing.push('Workers Comp')
      if (!auto.has && auto.status !== 'active') missing.push('Auto')

      const allStatuses = [gl.status, wc.status, auto.status]
      let overall: ComplianceRecord['overall_status'] = 'compliant'
      if (allStatuses.some(s => s === 'expired')) overall = 'expired'
      else if (allStatuses.some(s => s === 'missing')) overall = 'missing'
      else if (allStatuses.some(s => s === 'expiring_soon')) overall = 'expiring'

      const daysArr = [gl.days, wc.days, auto.days].filter((d): d is number => d !== null)
      const worstDays = daysArr.length > 0 ? Math.min(...daysArr) : null

      return {
        sub_id: sub.id,
        company_name: sub.company_name,
        contact_email: sub.contact_email || sub.email || null,
        has_gl: gl.has, gl_expiry: gl.expiry, gl_status: gl.status,
        has_wc: wc.has, wc_expiry: wc.expiry, wc_status: wc.status,
        has_auto: auto.has, auto_expiry: auto.expiry, auto_status: auto.status,
        overall_status: overall,
        worst_expiry_days: worstDays,
        missing_types: missing,
      }
    })

    // Sort: expired first, then expiring, missing, compliant
    const order = { expired: 0, expiring: 1, missing: 2, compliant: 3 }
    data.sort((a, b) => {
      const diff = order[a.overall_status] - order[b.overall_status]
      if (diff !== 0) return diff
      return (a.worst_expiry_days ?? 9999) - (b.worst_expiry_days ?? 9999)
    })

    const summary = {
      total_subs: data.length,
      compliant: data.filter(d => d.overall_status === 'compliant').length,
      expiring_in_30: data.filter(d => d.overall_status === 'expiring').length,
      expired: data.filter(d => d.overall_status === 'expired').length,
      missing_insurance: data.filter(d => d.overall_status === 'missing').length,
    }

    return NextResponse.json({ data, summary })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
