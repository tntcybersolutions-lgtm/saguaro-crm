import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = createServerClient()

    // Get the current sheet to find its sheet_number and project
    const { data: current, error: curErr } = await db
      .from('drawing_sheets')
      .select('sheet_number, project_id')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single()

    if (curErr || !current) return NextResponse.json({ error: 'Sheet not found' }, { status: 404 })

    // Get all revisions of this sheet number
    const { data: revisions, error } = await db
      .from('drawing_sheets')
      .select(`
        *,
        drawing_sets!inner(name, issue_date, revision_number)
      `)
      .eq('project_id', current.project_id)
      .eq('sheet_number', current.sheet_number)
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({
      data: (revisions || []).map(r => ({
        ...r,
        set_name: (r.drawing_sets as Record<string, unknown>)?.name || '',
        set_issue_date: (r.drawing_sets as Record<string, unknown>)?.issue_date || null,
        set_revision: (r.drawing_sets as Record<string, unknown>)?.revision_number || '',
      })),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
