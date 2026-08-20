import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type Trigger = 'day_1' | 'day_7' | 'day_25' | 'day_30' | 'expired'

const VALID_TRIGGERS: Trigger[] = ['day_1', 'day_7', 'day_25', 'day_30', 'expired']

export async function POST(req: NextRequest) {
  // Auth: cron secret or Authorization header
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const body = await req.json().catch(() => ({}))
  const bodySecret = body.secret as string | undefined

  const authorized = (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (cronSecret && bodySecret === cronSecret)

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const trigger = body.trigger as Trigger
  if (!trigger || !VALID_TRIGGERS.includes(trigger)) {
    return NextResponse.json({ error: 'Invalid trigger. Must be one of: day_1, day_7, day_25, day_30, expired' }, { status: 400 })
  }

  try {
    const db = createServerClient()
    const now = new Date()
    let sent = 0
    let errors = 0

    // Find matching tenants based on trigger
    let query = db.from('tenants').select('id, name, owner_email, plan, trial_ends_at, settings, created_at')

    if (trigger === 'day_1') {
      const from = new Date(now.getTime() - 28 * 60 * 60 * 1000).toISOString()
      const to = new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString()
      query = query.gte('created_at', from).lte('created_at', to)
    } else if (trigger === 'day_7') {
      const from = new Date(now.getTime() + 22 * 24 * 60 * 60 * 1000).toISOString()
      const to = new Date(now.getTime() + 24 * 24 * 60 * 60 * 1000).toISOString()
      query = query.gte('trial_ends_at', from).lte('trial_ends_at', to)
    } else if (trigger === 'day_25') {
      const from = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString()
      const to = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString()
      query = query.gte('trial_ends_at', from).lte('trial_ends_at', to)
    } else if (trigger === 'day_30') {
      const from = new Date(now.getTime() + 20 * 60 * 60 * 1000).toISOString()
      const to = new Date(now.getTime() + 28 * 60 * 60 * 1000).toISOString()
      query = query.gte('trial_ends_at', from).lte('trial_ends_at', to)
    } else if (trigger === 'expired') {
      query = query.lt('trial_ends_at', now.toISOString()).eq('plan', 'trial')
    }

    const { data: tenants, error: queryErr } = await query
    if (queryErr) {
      console.error('[trial-emails] query error:', queryErr)
      return NextResponse.json({ error: queryErr.message }, { status: 500 })
    }

    if (!tenants || tenants.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: 'No matching tenants' })
    }

    // Check for Resend API key
    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
      return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
    }

    const { Resend } = await import('resend')
    const resend = new Resend(resendKey)
    const emailFrom = process.env.EMAIL_FROM || 'Saguaro CRM <noreply@saguarocrm.com>'

    const sentFlagKey = `trial_emails`

    for (const tenant of tenants) {
      const settings = (tenant.settings || {}) as Record<string, unknown>
      const trialEmails = (settings.trial_emails || {}) as Record<string, boolean>
      const flagKey = `${trigger.replace('day_', 'day_')}_sent`

      // Skip if already sent
      if (trialEmails[flagKey] === true) continue

      // Skip if no email
      if (!tenant.owner_email) continue

      // Load summary for personalized content
      const { data: summaryRows } = await db.rpc('get_tenant_summary', { p_tenant_id: tenant.id })
      const summary = summaryRows?.[0] || { project_count: 0, takeoff_count: 0, jacket_count: 0 }
      const firstName = tenant.name?.split(' ')[0] || 'there'

      let subject = ''
      let html = ''

      if (trigger === 'day_1') {
        subject = 'Your Saguaro CRM trial has started — here\'s your first action'
        html = buildDay1Email(firstName)
      } else if (trigger === 'day_7') {
        subject = `7 days in, ${firstName} — here's where you stand`
        html = buildDay7Email(firstName, summary as { project_count: number; takeoff_count: number; jacket_count: number })
      } else if (trigger === 'day_25') {
        subject = `5 days left on your Saguaro trial, ${firstName}`
        html = buildDay25Email(firstName, summary as { project_count: number; takeoff_count: number; jacket_count: number; bid_package_count: number })
      } else if (trigger === 'day_30') {
        subject = `Last day of your Saguaro trial, ${firstName}`
        html = buildDay30Email(firstName)
      } else if (trigger === 'expired') {
        subject = `Your Saguaro trial has ended — your work is safe`
        html = buildExpiredEmail(firstName, summary as { project_count: number; takeoff_count: number; jacket_count: number })
      }

      try {
        await resend.emails.send({ from: emailFrom, to: tenant.owner_email, subject, html })
        sent++

        // Mark as sent
        const updatedTrialEmails = { ...trialEmails, [flagKey]: true }
        const updatedSettings = { ...settings, [sentFlagKey]: updatedTrialEmails }
        await db.from('tenants').update({ settings: updatedSettings }).eq('id', tenant.id)
      } catch (emailErr) {
        console.error(`[trial-emails] failed to send ${trigger} to ${tenant.owner_email}:`, emailErr)
        errors++
      }
    }

    return NextResponse.json({ success: true, trigger, sent, errors, total_matched: tenants.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    console.error('[trial-emails] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/* ── Email builders ──────────────────────────────────────────── */

function buildDay1Email(firstName: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px">
  <h1 style="color:#d4a017;font-size:24px;margin-bottom:8px">Welcome to Saguaro CRM, ${firstName}.</h1>
  <p style="color:#8b949e;margin-bottom:24px">Your 30-day trial has started. Here&rsquo;s exactly what to do first.</p>
  <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:20px;margin-bottom:24px">
    <p style="font-weight:700;margin-bottom:12px">Your first action (takes 45 seconds):</p>
    <p style="color:#8b949e">Upload a construction plan PDF and watch Sage AI extract every quantity automatically.</p>
    <a href="https://saguarocontrol.net/app" style="display:inline-block;background:#d4a017;color:#0d1117;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;margin-top:12px">Start your first takeoff &rarr;</a>
  </div>
  <p style="color:#8b949e">This week, try to:</p>
  <ul style="color:#8b949e;padding-left:20px">
    <li>Create a project for a job you&rsquo;re bidding</li>
    <li>Upload the plan set and watch Sage extract it</li>
    <li>Generate a bid jacket PDF and send it to a sub</li>
  </ul>
  <p style="color:#8b949e;margin-top:24px;font-size:13px">Questions? Reply to this email &mdash; Chad reads every one.<br>chad@tntcybersolutions.com</p>
</div>`
}

function buildDay7Email(firstName: string, summary: { project_count: number; takeoff_count: number; jacket_count: number }): string {
  const jacketCta = summary.jacket_count === 0
    ? `<div style="background:#0d1b2a;border:1px solid #388bfd;border-radius:8px;padding:16px;margin-bottom:20px">
        <p style="font-weight:700;color:#388bfd;margin-bottom:8px">You haven&rsquo;t generated a bid jacket yet</p>
        <p style="color:#8b949e;font-size:14px">Upload plans, create a bid package, click Generate &mdash; Sage writes the entire scope. Takes under 2 minutes.</p>
        <a href="https://saguarocontrol.net/app" style="display:inline-block;background:#d4a017;color:#0d1117;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700;margin-top:12px">Generate your first bid jacket &rarr;</a>
      </div>`
    : `<p style="color:#2ea043">You&rsquo;ve already generated ${summary.jacket_count} bid jacket${summary.jacket_count > 1 ? 's' : ''}. Nice work.</p>`

  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px">
  <h1 style="color:#d4a017;font-size:22px">7 days in, ${firstName} &mdash; here&rsquo;s where you stand</h1>
  <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:20px;margin:20px 0">
    <p style="font-weight:700;margin-bottom:12px">Your Saguaro progress:</p>
    <div style="display:flex;gap:24px">
      <div><div style="font-size:24px;font-weight:800;color:${summary.project_count > 0 ? '#2ea043' : '#8b949e'}">${summary.project_count}</div><div style="font-size:12px;color:#8b949e">Projects</div></div>
      <div><div style="font-size:24px;font-weight:800;color:${summary.takeoff_count > 0 ? '#2ea043' : '#8b949e'}">${summary.takeoff_count}</div><div style="font-size:12px;color:#8b949e">AI Takeoffs</div></div>
      <div><div style="font-size:24px;font-weight:800;color:${summary.jacket_count > 0 ? '#2ea043' : '#8b949e'}">${summary.jacket_count}</div><div style="font-size:12px;color:#8b949e">Bid Jackets</div></div>
    </div>
  </div>
  ${jacketCta}
  <p style="color:#8b949e;font-size:13px">23 days remaining on your trial.</p>
</div>`
}

function buildDay25Email(firstName: string, summary: { project_count: number; takeoff_count: number; jacket_count: number; bid_package_count: number }): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px">
  <h1 style="color:#f85149;font-size:22px">5 days left on your trial, ${firstName}</h1>
  <p style="color:#8b949e;margin-bottom:20px">Your trial ends in 5 days. Everything you&rsquo;ve built is safe &mdash; but you&rsquo;ll lose access unless you upgrade.</p>
  ${summary.project_count > 0 ? `<div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:20px;margin-bottom:20px">
    <p style="font-weight:700;margin-bottom:8px">Your saved work:</p>
    <p style="color:#8b949e">${summary.project_count} project${summary.project_count !== 1 ? 's' : ''} &middot; ${summary.takeoff_count} takeoff${summary.takeoff_count !== 1 ? 's' : ''} &middot; ${summary.bid_package_count} bid package${summary.bid_package_count !== 1 ? 's' : ''}</p>
  </div>` : ''}
  <a href="https://saguarocontrol.net/upgrade" style="display:inline-block;background:#d4a017;color:#0d1117;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700">Upgrade now &mdash; keep your work &rarr;</a>
  <p style="color:#8b949e;margin-top:20px;font-size:13px">Plans start at $399/mo. No per-seat fees. Cancel anytime.</p>
</div>`
}

function buildDay30Email(firstName: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px">
  <h1 style="color:#f85149;font-size:22px">Last day, ${firstName}</h1>
  <p style="color:#8b949e;margin-bottom:20px">Your Saguaro CRM trial expires today. After that, your dashboard, field app, and all project data will be locked.</p>
  <p style="color:#8b949e;margin-bottom:20px">Your data is safe &mdash; it&rsquo;s not deleted. Upgrade any time to restore full access instantly.</p>
  <a href="https://saguarocontrol.net/upgrade" style="display:inline-block;background:#d4a017;color:#0d1117;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700">Upgrade now &rarr;</a>
  <p style="color:#8b949e;margin-top:20px;font-size:13px">Questions? chad@tntcybersolutions.com</p>
</div>`
}

function buildExpiredEmail(firstName: string, summary: { project_count: number; takeoff_count: number; jacket_count: number }): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px">
  <h1 style="color:#d4a017;font-size:22px">Your trial has ended, ${firstName}</h1>
  <p style="color:#8b949e;margin-bottom:20px">Your Saguaro CRM free trial is over. Your data is safe and waiting for you.</p>
  ${summary.project_count > 0 ? `<div style="background:#0d1b2a;border:1px solid #388bfd;border-radius:8px;padding:20px;margin-bottom:20px">
    <p style="font-weight:700;color:#388bfd;margin-bottom:8px">Your work is still here:</p>
    <p style="color:#8b949e">${summary.project_count} project${summary.project_count !== 1 ? 's' : ''}, ${summary.takeoff_count} AI takeoff${summary.takeoff_count !== 1 ? 's' : ''}, ${summary.jacket_count} bid jacket${summary.jacket_count !== 1 ? 's' : ''}</p>
  </div>` : ''}
  <a href="https://saguarocontrol.net/upgrade" style="display:inline-block;background:#d4a017;color:#0d1117;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700">Reactivate your account &rarr;</a>
  <p style="color:#8b949e;margin-top:20px;font-size:13px">Plans start at $399/mo. Your data restores instantly when you subscribe.</p>
</div>`
}
