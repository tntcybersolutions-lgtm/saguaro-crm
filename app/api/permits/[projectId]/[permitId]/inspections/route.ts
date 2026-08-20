import { NextRequest, NextResponse } from 'next/server'
import { getUser, createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; permitId: string }> }
) {
  const { projectId, permitId } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createServerClient()

  try {
    const body = await req.json()
    if (!body.inspection_type) return NextResponse.json({ error: 'inspection_type required' }, { status: 400 })

    const { data, error } = await db.from('permit_inspections').insert({
      permit_id: permitId,
      project_id: projectId,
      tenant_id: user.tenantId,
      inspection_type: body.inspection_type,
      description: body.description || null,
      requested_date: body.requested_date || null,
      scheduled_date: body.scheduled_date || null,
      scheduled_time: body.scheduled_time || null,
      inspector_name: body.inspector_name || null,
      result: body.result || 'pending',
      result_notes: body.result_notes || null,
      corrections_required: body.corrections_required || null,
      reinspection_required: body.reinspection_required || false,
      reinspection_fee: body.reinspection_fee || 0,
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // If inspection passed and is final_building: auto-final the permit
    if (body.result === 'passed' && body.inspection_type === 'final_building') {
      await db.from('permits').update({ status: 'finaled' })
        .eq('id', permitId)
        .eq('tenant_id', user.tenantId)
    }

    return NextResponse.json({ data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
