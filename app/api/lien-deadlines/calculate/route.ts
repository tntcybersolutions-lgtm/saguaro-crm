import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'
import { calculateLienDeadlines } from '@/lib/lien-law/states'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  const { projectId } = await req.json()
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const [{ data: awardedSubs }, { data: project }] = await Promise.all([
    supabase.from('bid_submissions')
      .select('company_name, sub_name, base_bid, amount, created_at')
      .eq('project_id', projectId).eq('tenant_id', tenantId).eq('is_awarded', true),
    supabase.from('projects')
      .select('start_date, end_date, state, name').eq('tenant_id', tenantId).eq('id', projectId).single(),
  ])

  const stateCode = (project as { state?: string } | null)?.state || 'XX'
  const today = new Date()
  const startDate = (project as { start_date?: string } | null)?.start_date
    ? new Date((project as { start_date: string }).start_date)
    : today
  const endDate = (project as { end_date?: string } | null)?.end_date
    ? new Date((project as { end_date: string }).end_date)
    : new Date(new Date().setMonth(new Date().getMonth() + 12))

  // Clear existing deadlines
  await supabase.from('lien_deadlines').delete().eq('project_id', projectId).eq('tenant_id', tenantId)

  const allDeadlines: Array<Record<string, unknown>> = []

  for (const sub of ((awardedSubs as Array<Record<string, unknown>> | null) || [])) {
    const subName = (sub.company_name as string) || (sub.sub_name as string) || 'Subcontractor'
    const amount = Number((sub.base_bid as number) || (sub.amount as number) || 0)
    const firstFurnished = sub.created_at ? new Date(sub.created_at as string) : startDate

    const deadlines = calculateLienDeadlines(stateCode, firstFurnished, endDate, endDate)

    for (const d of deadlines) {
      allDeadlines.push({
        tenant_id: tenantId,
        project_id: projectId,
        state: stateCode,
        deadline_type: d.type,
        deadline_category: d.category,
        description: d.description,
        due_date: d.dueDate.toISOString().split('T')[0],
        status: 'pending',
        claimant_name: subName,
        amount_claimed: amount,
        work_first_furnished: firstFurnished.toISOString().split('T')[0],
        work_last_furnished: endDate.toISOString().split('T')[0],
        state_statute: d.statute,
        is_critical: d.isCritical,
        service_method: d.serviceMethod,
        notarization_required: d.notarizationRequired,
        notice_recipients: d.recipients,
        reminder_sent_30: false,
        reminder_sent_14: false,
        reminder_sent_7: false,
      })
    }
  }

  if (allDeadlines.length === 0) {
    return NextResponse.json({ success: true, created: 0, message: 'No awarded subs found' })
  }

  const { error } = await supabase.from('lien_deadlines').insert(allDeadlines)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log('[DEADLINES] Created', allDeadlines.length, 'deadlines for project', projectId, 'state:', stateCode)
  return NextResponse.json({ success: true, created: allDeadlines.length, state: stateCode })
}
