import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { id } = await params

  const formData = await req.formData()
  const file = formData.get('file') as File
  const revision = formData.get('revision') as string || '0'

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  const { error: bErr } = await supabase.storage.getBucket('submittals')
  if (bErr) await supabase.storage.createBucket('submittals', { public: true })

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
  const path = `${tenantId}/submittals/${id}/rev${revision}-${Date.now()}-${safeName}`
  const bytes = await file.arrayBuffer()

  const { error: uploadErr } = await supabase.storage
    .from('submittals')
    .upload(path, bytes, { contentType: file.type })

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('submittals').getPublicUrl(path)

  const { data, error } = await supabase
    .from('submittals')
    .update({
      file_url: publicUrl,
      file_name: file.name,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ submittal: data, file_url: publicUrl })
}
