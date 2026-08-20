import { NextRequest, NextResponse } from 'next/server'
import { getUser, createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createServerClient()

  try {
    const { data: permitsData } = await db
      .from('permits')
      .select(`
        *,
        permit_inspections (
          id, inspection_type, description, scheduled_date,
          result, result_date, reinspection_required
        )
      `)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })

    const permits = permitsData || []
    const summary = {
      total: permits.length,
      issued: permits.filter((p: Record<string, unknown>) => p.status === 'issued').length,
      pending: permits.filter((p: Record<string, unknown>) => ['applied', 'pending_review'].includes(p.status as string)).length,
      not_applied: permits.filter((p: Record<string, unknown>) => p.status === 'not_applied').length,
      expired: permits.filter((p: Record<string, unknown>) => p.status === 'expired').length,
      total_fees: permits.reduce((s: number, p: Record<string, unknown>) => s + (Number(p.fee) || 0) + (Number(p.application_fee) || 0) + (Number(p.permit_fee) || 0), 0),
      failed_inspections: permits.flatMap((p: Record<string, unknown>) =>
        ((p.permit_inspections as Array<{ result: string }>) || [])
          .filter(i => i.result === 'failed')
      ).length,
      pending_inspections: permits.flatMap((p: Record<string, unknown>) =>
        ((p.permit_inspections as Array<{ result: string }>) || [])
          .filter(i => !i.result || i.result === 'pending')
      ).length,
    }

    return NextResponse.json({ permits, summary })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createServerClient()

  try {
    const body = await req.json()
    if (!body.permit_type) return NextResponse.json({ error: 'permit_type required' }, { status: 400 })

    const { data, error } = await db.from('permits').insert({
      project_id: projectId,
      tenant_id: user.tenantId,
      permit_type: body.permit_type,
      description: body.description || null,
      issuing_authority: body.issuing_authority || null,
      ahj_name: body.ahj_name || null,
      ahj_contact_name: body.ahj_contact_name || null,
      ahj_contact_phone: body.ahj_contact_phone || null,
      ahj_email: body.ahj_email || null,
      application_date: body.application_date || null,
      application_fee: body.application_fee || 0,
      permit_fee: body.permit_fee || 0,
      status: body.status || 'not_applied',
      notes: body.notes || null,
      conditions: body.conditions || null,
      created_by: user.id,
    }).select(`*, permit_inspections(*)`).single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
