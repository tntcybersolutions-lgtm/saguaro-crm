import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sheetId: string }> }
) {
  const { sheetId } = await params
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth

  try {
    const { data, error } = await supabase
      .from('drawing_revisions')
      .select('*')
      .eq('drawing_sheet_id', sheetId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data || [])
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sheetId: string }> }
) {
  const { sheetId } = await params
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId, userId } = auth

  try {
    const body = await req.json()
    if (!body.revision_number || !body.file_url || !body.file_name) {
      return NextResponse.json(
        { error: 'revision_number, file_url, file_name required' },
        { status: 400 }
      )
    }

    // Mark all existing as not current
    await supabase
      .from('drawing_revisions')
      .update({ is_current: false })
      .eq('drawing_sheet_id', sheetId)
      .eq('tenant_id', tenantId)

    const { data, error } = await supabase
      .from('drawing_revisions')
      .insert({
        tenant_id: tenantId,
        drawing_sheet_id: sheetId,
        revision_number: body.revision_number,
        file_url: body.file_url,
        file_name: body.file_name,
        issued_date: body.issued_date || null,
        issued_by: body.issued_by || null,
        change_description: body.change_description || null,
        is_current: true,
        created_by: userId,
      })
      .select()
      .single()

    if (error) throw error

    // Update drawing_sheets to point to new file
    await supabase
      .from('drawing_sheets')
      .update({ file_url: body.file_url, sheet_revision: body.revision_number })
      .eq('id', sheetId)
      .eq('tenant_id', tenantId)

    return NextResponse.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
