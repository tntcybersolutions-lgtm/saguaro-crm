import { createServerClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'

export interface AuthContext {
  supabase: SupabaseClient
  user: User
  tenantId: string
  userId: string
}

/**
 * requireAuth — standard auth guard for every protected API route.
 *
 * Usage:
 *   const auth = await requireAuth()
 *   if (auth instanceof NextResponse) return auth
 *   const { supabase, tenantId, userId } = auth
 *
 * Returns NextResponse 401/403 on failure so the caller can return it directly.
 */
export async function requireAuth(): Promise<AuthContext | NextResponse> {
  const supabase = await createServerClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.tenant_id) {
    return NextResponse.json(
      { error: 'No tenant context' },
      { status: 403 }
    )
  }

  return {
    supabase,
    user,
    tenantId: profile.tenant_id as string,
    userId: user.id,
  }
}

/**
 * requirePublicToken — for token-based public routes (bid portal, owner portal).
 * Validates the token exists and returns project context.
 * No user session required.
 */
export async function requirePortalToken(
  table: 'bid_packages' | 'owner_portal_tokens',
  tokenColumn: 'sub_portal_token' | 'token',
  token: string
): Promise<
  | { supabase: SupabaseClient; record: Record<string, unknown> }
  | NextResponse
> {
  if (!token || token.length < 32) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq(tokenColumn, token)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  }

  // Check expiry if the table has expires_at
  if ('expires_at' in data && data.expires_at) {
    if (new Date(data.expires_at as string) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 410 })
    }
  }

  // Check is_active if present
  if ('is_active' in data && data.is_active === false) {
    return NextResponse.json({ error: 'Portal inactive' }, { status: 403 })
  }

  return { supabase, record: data as Record<string, unknown> }
}
