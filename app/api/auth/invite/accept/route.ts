import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { token, fullName, password } = await req.json()
  if (!token || !fullName || !password) {
    return NextResponse.json({ error: 'Missing token, fullName, or password' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  try {
    // Validate the invitation
    const { data: invite, error: invErr } = await supabase
      .from('invitations')
      .select('id, email, role, tenant_id, expires_at, accepted_at')
      .eq('token', token)
      .single()

    if (invErr || !invite) return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 })
    if (invite.accepted_at) return NextResponse.json({ error: 'This invitation has already been accepted' }, { status: 409 })
    if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'This invitation has expired' }, { status: 410 })

    // Create the user via admin API
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (authError) {
      // If user already exists, try to link them
      if (authError.message?.includes('already been registered')) {
        return NextResponse.json({ error: 'An account with this email already exists. Please log in instead.' }, { status: 409 })
      }
      throw authError
    }

    const userId = authData.user.id

    // Create profile for the new user in the inviting tenant
    await supabase.from('profiles').upsert({
      id: userId,
      tenant_id: invite.tenant_id,
      email: invite.email,
      full_name: fullName,
      role: invite.role || 'pm',
    })

    // Mark invitation as accepted
    await supabase
      .from('invitations')
      .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
      .eq('id', invite.id)

    return NextResponse.json({ success: true, email: invite.email })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 })
  }
}
