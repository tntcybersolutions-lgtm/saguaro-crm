import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = createServerClient()

    const { data: sheet, error } = await db
      .from('drawing_sheets')
      .select('file_path')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .single()

    if (error || !sheet) return NextResponse.json({ error: 'Sheet not found' }, { status: 404 })

    const { data: urlData, error: urlErr } = await db.storage
      .from('drawings')
      .createSignedUrl(sheet.file_path, 3600)

    if (urlErr || !urlData) {
      return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 })
    }

    return NextResponse.json({ url: urlData.signedUrl })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
