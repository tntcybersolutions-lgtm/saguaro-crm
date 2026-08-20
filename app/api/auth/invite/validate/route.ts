import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  try {
    const { data: invite, error } = await supabase
      .from('invitations')
      .select('id, email, role, tenant_id, expires_at, accepted_at, tenants(name)')
      .eq('token', token)
      .single()

    if (error || !invite) return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 })
    if (invite.accepted_at) return NextResponse.json({ error: 'This invitation has already been accepted' }, { status: 409 })
    if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'This invitation has expired' }, { status: 410 })

    return NextResponse.json({
      email: invite.email,
      role: invite.role,
      tenant_name: (invite.tenants as any)?.name || 'Unknown',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 })
  }
}
