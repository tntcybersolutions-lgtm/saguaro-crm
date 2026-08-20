import { NextRequest, NextResponse } from 'next/server'
import { getUser, createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = createServerClient()

    // Get tenant_id from profiles
    const { data: profile } = await db
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }

    const tenantId = profile.tenant_id

    // Parse body
    const body = await req.json().catch(() => ({}))
    if (!body.settings || typeof body.settings !== 'object') {
      return NextResponse.json({ error: 'settings object required' }, { status: 400 })
    }

    // Load current settings
    const { data: tenant } = await db
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single()

    const current = (tenant?.settings || {}) as Record<string, unknown>

    // Deep merge logic
    const incoming = body.settings as Record<string, unknown>
    const merged: Record<string, unknown> = { ...current }

    for (const [key, value] of Object.entries(incoming)) {
      if (
        typeof value === 'object' && value !== null && !Array.isArray(value) &&
        typeof current[key] === 'object' && current[key] !== null && !Array.isArray(current[key])
      ) {
        merged[key] = { ...(current[key] as Record<string, unknown>), ...(value as Record<string, unknown>) }
      } else {
        merged[key] = value
      }
    }

    // Auto-detect onboarding completion
    const steps = merged.onboarding_steps as Record<string, boolean> | undefined
    if (steps) {
      const allComplete = (
        steps.account_created === true &&
        steps.project_created === true &&
        steps.takeoff_uploaded === true &&
        steps.jacket_generated === true &&
        steps.pdf_downloaded === true
      )
      if (allComplete && !merged.onboarding_completed) {
        merged.onboarding_completed = true
        merged.onboarding_completed_at = new Date().toISOString()
      }
    }

    // Save merged settings
    const { error: updateError } = await db
      .from('tenants')
      .update({ settings: merged })
      .eq('id', tenantId)

    if (updateError) {
      console.error('[tenant/settings] update error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: { settings: merged },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    console.error('[tenant/settings] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
