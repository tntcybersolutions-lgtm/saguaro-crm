import { NextRequest, NextResponse } from 'next/server'
import { getUser, createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; permitId: string }> }
) {
  const { projectId, permitId } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createServerClient()

  try {
    const body = await req.json()
    const allowed = [
      'permit_number', 'permit_type', 'description', 'issuing_authority',
      'ahj_name', 'ahj_contact_name', 'ahj_contact_phone', 'ahj_email',
      'application_date', 'application_number', 'application_fee',
      'issue_date', 'expiration_date', 'permit_fee',
      'status', 'on_hold_reason', 'notes', 'conditions',
      'plan_review_status', 'plan_review_submitted_date', 'plan_review_approved_date',
      'corrections_count',
    ]
    const safe: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const k of allowed) if (k in body) safe[k] = body[k]

    const { data, error } = await db.from('permits').update(safe)
      .eq('id', permitId)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .select(`*, permit_inspections(*)`).single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
