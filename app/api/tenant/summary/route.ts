import { NextRequest, NextResponse } from 'next/server'
import { getUser, createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = createServerClient()

    // Get profile with tenant_id
    const { data: profile, error: profileErr } = await db
      .from('profiles')
      .select('tenant_id, full_name')
      .eq('id', user.id)
      .single()

    if (profileErr || !profile?.tenant_id) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }

    const tenantId = profile.tenant_id

    // Single DB function call for all counts
    const { data: summary, error: summaryErr } = await db.rpc('get_tenant_summary', {
      p_tenant_id: tenantId,
    })

    if (summaryErr || !summary?.length) {
      console.error('[tenant/summary] rpc error:', summaryErr)
      return NextResponse.json({ error: 'Failed to load summary' }, { status: 500 })
    }

    // Load tenant record
    const { data: tenant } = await db
      .from('tenants')
      .select('id, name, plan, trial_ends_at, settings, logo_url')
      .eq('id', tenantId)
      .single()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Calculate derived values
    const now = Date.now()
    const trialEndsAt = tenant.trial_ends_at ? new Date(tenant.trial_ends_at).getTime() : null
    const daysRemaining = trialEndsAt
      ? Math.ceil((trialEndsAt - now) / (1000 * 60 * 60 * 24))
      : null
    const trialExpired = trialEndsAt ? trialEndsAt < now : false

    const row = summary[0]
    const hasMeaningfulWork = (
      Number(row.project_count) > 0 ||
      Number(row.bid_package_count) > 0 ||
      Number(row.takeoff_count) > 0
    )

    return NextResponse.json({
      data: {
        project_count: Number(row.project_count),
        takeoff_count: Number(row.takeoff_count),
        takeoff_value: Number(row.takeoff_value),
        bid_package_count: Number(row.bid_package_count),
        jacket_count: Number(row.jacket_count),
        rfi_count: Number(row.rfi_count),
        submittal_count: Number(row.submittal_count),
        daily_log_count: Number(row.daily_log_count),
        change_order_count: Number(row.change_order_count),
        approved_co_value: Number(row.approved_co_value),
        punch_list_count: Number(row.punch_list_count),
        total_records: Number(row.total_records),
        has_meaningful_work: hasMeaningfulWork,
        tenant: {
          id: tenant.id,
          name: tenant.name,
          plan: tenant.plan,
          trial_ends_at: tenant.trial_ends_at,
          days_remaining: daysRemaining,
          trial_expired: trialExpired,
          settings: tenant.settings || {},
          logo_url: tenant.logo_url,
        },
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    console.error('[tenant/summary] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
