import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  try {
    const [
      projectRes,
      payAppsRes,
      changeOrdersRes,
      budgetLinesRes,
      sovLinesRes,
      timeEntriesRes,
      contractsRes,
    ] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).eq('tenant_id', tenantId).maybeSingle(),
      supabase.from('pay_applications').select('*').eq('project_id', projectId).eq('tenant_id', tenantId).order('app_number', { ascending: true }),
      supabase.from('change_orders').select('*').eq('project_id', projectId).eq('tenant_id', tenantId),
      supabase.from('budget_lines').select('*').eq('project_id', projectId).eq('tenant_id', tenantId),
      supabase.from('schedule_of_values').select('*').eq('project_id', projectId).eq('tenant_id', tenantId),
      supabase.from('time_entries').select('*').eq('project_id', projectId).eq('tenant_id', tenantId),
      supabase.from('contracts').select('*').eq('project_id', projectId).eq('tenant_id', tenantId),
    ])

    const project = projectRes.data as Record<string, unknown> | null
    const payApps = (payAppsRes.data || []) as Record<string, unknown>[]
    const changeOrders = (changeOrdersRes.data || []) as Record<string, unknown>[]
    const budgetLines = (budgetLinesRes.data || []) as Record<string, unknown>[]
    const sovLines = (sovLinesRes.data || []) as Record<string, unknown>[]
    const timeEntries = (timeEntriesRes.data || []) as Record<string, unknown>[]
    const contracts = (contractsRes.data || []) as Record<string, unknown>[]

    const num = (v: unknown) => Number(v || 0) || 0

    const originalContract = num(project?.contract_value || project?.original_contract_value)
    const approvedCOs = changeOrders.filter(co => co.status === 'approved').reduce((s, co) => s + num(co.amount), 0)
    const pendingCOs = changeOrders.filter(co => ['pending', 'submitted'].includes(String(co.status))).reduce((s, co) => s + num(co.amount), 0)
    const revisedContract = originalContract + approvedCOs

    const billedToDate = payApps
      .filter(p => ['certified', 'approved'].includes(String(p.status)))
      .reduce((s, p) => s + num(p.current_payment_due), 0)
    const retainageHeld = payApps.reduce((s, p) => s + num(p.total_retainage), 0)
    const totalPaid = payApps
      .filter(p => p.status === 'certified')
      .reduce((s, p) => s + num(p.current_payment_due), 0)
    const balanceToFinish = revisedContract - billedToDate
    const percentBilled = revisedContract > 0 ? Math.round((billedToDate / revisedContract) * 100) : 0

    const laborCost = timeEntries.reduce((s, t) => s + num(t.labor_cost), 0)
    const subcommitments = contracts.reduce((s, c) => s + num(c.amount || c.contract_amount), 0)
    const budgetTotal = budgetLines.reduce((s, b) => s + num(b.budget_amount || b.amount), 0)

    const budgetVsActual = budgetLines.map(b => {
      const budgeted = num(b.original_total || b.budgeted_amount || b.budget_amount || b.amount)
      const actual = Math.round(laborCost / Math.max(budgetLines.length, 1))
      const variance = actual - budgeted
      const variance_pct = budgeted > 0 ? (variance / budgeted) * 100 : 0
      return {
        ...b,
        budgeted,
        actual,
        variance: Math.round(variance),
        variance_pct: Math.round(variance_pct),
        status: variance_pct > 10 ? 'over' : variance_pct > 0 ? 'warning' : 'on_track',
      }
    })

    // Enrich SOV lines with computed fields the UI expects
    const enrichedSovLines = sovLines.map(l => {
      const scheduled_value = num(l.scheduled_value || l.amount)
      const prev_completed = num(l.prev_completed || l.previous_completed)
      const this_period = num(l.this_period || l.current_period)
      const total_completed = num(l.total_completed) || (prev_completed + this_period)
      const percent_complete = num(l.percent_complete) || (scheduled_value > 0 ? (total_completed / scheduled_value) * 100 : 0)
      const balance_to_finish = num(l.balance_to_finish) || (scheduled_value - total_completed)
      return {
        id: l.id,
        line_number: l.line_number || l.item_number || 0,
        description: l.description || l.item_description || '',
        scheduled_value,
        prev_completed,
        this_period,
        total_completed,
        percent_complete,
        balance_to_finish,
      }
    })

    const cashFlowData = payApps.map(p => ({
      app_number: p.app_number || p.application_number || null,
      period: p.period_to || p.application_date || p.created_at,
      billed: num(p.current_payment_due),
      certified: p.status === 'certified' ? num(p.current_payment_due) : 0,
      status: p.status,
      cumulative: 0,
    }))
    let cum = 0
    for (const row of cashFlowData) {
      cum += row.certified
      row.cumulative = cum
    }

    return NextResponse.json({
      project: {
        id: project?.id,
        name: project?.name,
        project_number: project?.project_number,
        start_date: project?.start_date,
        end_date: project?.end_date,
      },
      summary: {
        original_contract: originalContract,
        approved_cos: approvedCOs,
        pending_cos: pendingCOs,
        revised_contract: revisedContract,
        billed_to_date: billedToDate,
        retainage_held: retainageHeld,
        total_paid: totalPaid,
        balance_to_finish: balanceToFinish,
        percent_billed: percentBilled,
        labor_cost: laborCost,
        subcommitments,
        budget_total: budgetTotal,
      },
      change_orders: changeOrders,
      pay_app_history: cashFlowData,
      sov_lines: enrichedSovLines,
      budget_lines: budgetLines,
      budget_vs_actual: budgetVsActual,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
