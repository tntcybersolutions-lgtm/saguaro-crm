import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

// Token-based public GET — returns the waiver HTML for signing.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 8) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })

  const db = createServerClient()
  const { data, error } = await db.from('lien_waivers')
    .select('id, status, html_content, claimant_name, company_name, amount, state, waiver_type, through_date')
    .eq('token', token).maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'Token not found' }, { status: 404 })

  const w = data as { id: string; status: string; html_content: string | null; claimant_name: string | null; company_name: string | null; amount: number | null; state: string | null; waiver_type: string | null; through_date: string | null }

  return NextResponse.json({
    waiverId: w.id,
    status: w.status,
    html: w.html_content || '',
    claimant: w.company_name || w.claimant_name,
    amount: w.amount,
    state: w.state,
    waiverType: w.waiver_type,
    throughDate: w.through_date,
  })
}
