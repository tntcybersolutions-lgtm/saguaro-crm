import { NextRequest, NextResponse } from 'next/server'
import { getUser, createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; equipId: string }> }
) {
  const { projectId, equipId } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createServerClient()

  try {
    const body = await req.json()
    const allowed = [
      'equipment_name', 'equipment_type', 'make', 'model', 'vendor_name',
      'vendor_phone', 'mobilization_date', 'demobilization_date',
      'actual_demob_date', 'rate_amount', 'estimated_duration_days',
      'actual_total_cost', 'status', 'po_number', 'invoice_number', 'notes',
      'csi_division',
    ]
    const safe: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const k of allowed) if (k in body) safe[k] = body[k]

    // If returning equipment: set actual_demob_date
    if (body.status === 'returned' && body.actual_total_cost) {
      safe.actual_demob_date = body.actual_demob_date || new Date().toISOString().split('T')[0]
    }

    const { data, error } = await db.from('equipment_rentals').update(safe)
      .eq('id', equipId)
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
