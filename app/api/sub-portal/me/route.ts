import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Resolve sub profile — try a few likely shapes so we work across schemas.
  let subcontractor: Record<string, unknown> | null = null
  const { data: byUser } = await supabase
    .from('subcontractors')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  subcontractor = byUser || null

  if (!subcontractor) {
    const { data: byEmail } = await supabase
      .from('subcontractors')
      .select('*')
      .eq('email', user.email || '')
      .maybeSingle()
    subcontractor = byEmail || null
  }

  const role = subcontractor ? 'subcontractor' : 'unknown'

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    subcontractor,
    role,
  })
}
