import { NextRequest, NextResponse } from 'next/server'
import { getUser, createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tid = user.tenantId
  const db = createServerClient()

  try {
    // Load everything in parallel — one round trip
    const [
      projectsRes,
      intelligenceRes,
      primeContractsRes,
      rfisRes,
      submittalsRes,
      punchRes,
      scheduleMilestonesRes,
      recentActivityRes,
    ] = await Promise.all([
      db.from('projects')
        .select('id,name,status,project_type,contract_value,city,state,start_date,estimated_completion')
        .eq('tenant_id', tid)
        .in('status', ['active', 'bidding', 'closeout'])
        .order('created_at', { ascending: false }),

      db.from('project_intelligence')
        .select('project_id,health_score,health_trend,schedule_score,budget_score,communication_score,analyzed_at,critical_issues,warnings')
        .eq('tenant_id', tid)
        .eq('is_current', true),

      db.from('prime_contracts')
        .select('project_id,current_contract_value,total_billed,total_paid,total_retainage_held,status')
        .eq('tenant_id', tid),

      db.from('rfis')
        .select('project_id,status,is_overdue,priority')
        .eq('tenant_id', tid)
        .neq('status', 'closed'),

      db.from('submittals')
        .select('project_id,status')
        .eq('tenant_id', tid)
        .neq('status', 'approved'),

      db.from('punch_list')
        .select('project_id,status,priority')
        .eq('tenant_id', tid)
        .neq('status', 'closed'),

      db.from('schedule_milestones')
        .select('project_id,status,is_critical_path,baseline_date,title')
        .eq('tenant_id', tid)
        .in('status', ['at_risk', 'missed', 'current'])
        .order('baseline_date'),

      db.from('rfis')
        .select('project_id,rfi_number,subject,created_at')
        .eq('tenant_id', tid)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    const projects = projectsRes.data || []
    const intelligence = intelligenceRes.data || []
    const primeContracts = primeContractsRes.data || []
    const rfis = rfisRes.data || []
    const submittals = submittalsRes.data || []
    const punch = punchRes.data || []
    const milestones = scheduleMilestonesRes.data || []

    // Build intelligence map
    const intelMap = Object.fromEntries(
      intelligence.map((i: Record<string, unknown>) => [i.project_id, i])
    )
    const contractMap = Object.fromEntries(
      primeContracts.map((c: Record<string, unknown>) => [c.project_id, c])
    )

    // Per-project stats
    const projectStats = projects.map((p: Record<string, unknown>) => {
      const intel = intelMap[p.id as string] as Record<string, unknown> | undefined
      const contract = contractMap[p.id as string] as Record<string, unknown> | undefined
      const projRFIs = rfis.filter((r: Record<string, unknown>) => r.project_id === p.id)
      const projSubs = submittals.filter((s: Record<string, unknown>) => s.project_id === p.id)
      const projPunch = punch.filter((x: Record<string, unknown>) => x.project_id === p.id)
      const projMilestones = milestones.filter((m: Record<string, unknown>) => m.project_id === p.id)

      const contractVal = Number(contract?.current_contract_value || p.contract_value || 0)
      const totalBilled = Number(contract?.total_billed || 0)
      const billedPct = contractVal > 0
        ? Math.round((totalBilled / contractVal) * 100)
        : 0

      return {
        id: p.id,
        name: p.name,
        status: p.status,
        project_type: p.project_type,
        city: p.city,
        state: p.state,
        contract_value: contractVal,
        total_billed: totalBilled,
        total_paid: Number(contract?.total_paid || 0),
        billed_pct: billedPct,
        start_date: p.start_date,
        estimated_completion: p.estimated_completion,
        health_score: (intel?.health_score as number) ?? null,
        health_trend: (intel?.health_trend as string) ?? 'stable',
        schedule_score: (intel?.schedule_score as number) ?? null,
        budget_score: (intel?.budget_score as number) ?? null,
        last_analyzed: intel?.analyzed_at ?? null,
        critical_issues_count: Array.isArray(intel?.critical_issues)
          ? (intel.critical_issues as unknown[]).length : 0,
        open_rfis: projRFIs.filter((r: Record<string, unknown>) => r.status !== 'answered').length,
        overdue_rfis: projRFIs.filter((r: Record<string, unknown>) => r.is_overdue).length,
        pending_submittals: projSubs.filter((s: Record<string, unknown>) => s.status === 'pending').length,
        open_punch: projPunch.length,
        critical_punch: projPunch.filter((x: Record<string, unknown>) => x.priority === 'high').length,
        at_risk_milestones: projMilestones.filter((m: Record<string, unknown>) => m.status === 'at_risk').length,
        missed_milestones: projMilestones.filter((m: Record<string, unknown>) => m.status === 'missed').length,
      }
    })

    // Portfolio totals
    const totalContractValue = projectStats.reduce((s, p) => s + p.contract_value, 0)
    const totalBilled = projectStats.reduce((s, p) => s + p.total_billed, 0)
    const totalPaid = projectStats.reduce((s, p) => s + p.total_paid, 0)
    const totalOutstanding = totalBilled - totalPaid
    const criticalProjects = projectStats.filter(p =>
      p.critical_issues_count > 0 || p.missed_milestones > 0
    ).length
    const withHealth = projectStats.filter(p => p.health_score !== null)
    const avgHealth = withHealth.length > 0
      ? Math.round(withHealth.reduce((s, p) => s + (p.health_score || 0), 0) / withHealth.length)
      : null

    return NextResponse.json({
      projects: projectStats,
      totals: {
        active_projects: projects.length,
        total_contract_value: totalContractValue,
        total_billed: totalBilled,
        total_paid: totalPaid,
        total_outstanding: totalOutstanding,
        critical_projects: criticalProjects,
        avg_health_score: avgHealth,
        total_overdue_rfis: rfis.filter((r: Record<string, unknown>) => r.is_overdue).length,
      },
      recent_activity: recentActivityRes.data || [],
      at_risk_milestones: milestones.slice(0, 5),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
