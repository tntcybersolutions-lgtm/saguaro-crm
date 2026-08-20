import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createServerClient()

  const { data: portal } = await supabase
    .from('owner_portal_tokens')
    .select('*')
    .eq('token', token)
    .eq('is_active', true)
    .single()

  if (!portal) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })

  const projectId = portal.project_id
  const tenantId = portal.tenant_id

  const [
    { data: project },
    { data: payApps },
    { data: changeOrders },
    { data: rfis },
    { data: schedTasks },
    { data: photos },
    { data: dailyLogs },
    { data: tenantSettings },
  ] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).single(),
    supabase.from('pay_applications').select('app_number,status,current_payment_due,period_to').eq('project_id', projectId).eq('tenant_id', tenantId).order('app_number'),
    supabase.from('change_orders').select('co_number,title,amount,status').eq('project_id', projectId).eq('tenant_id', tenantId),
    supabase.from('rfis').select('rfi_number,title,status,created_at').eq('project_id', projectId).eq('tenant_id', tenantId).eq('status', 'open'),
    supabase.from('schedule_tasks').select('title,percent_complete,status,start_date,end_date').eq('project_id', projectId).eq('tenant_id', tenantId).order('start_date'),
    supabase.from('photos').select('id,file_url,caption,taken_at,album_date').eq('project_id', projectId).eq('tenant_id', tenantId).order('taken_at', { ascending: false }).limit(12),
    supabase.from('daily_logs').select('log_date,weather,total_crew').eq('project_id', projectId).eq('tenant_id', tenantId).order('log_date', { ascending: false }).limit(5),
    supabase.from('tenant_settings').select('company_name, company_logo_url').eq('tenant_id', tenantId).maybeSingle(),
  ])

  await supabase.from('owner_portal_tokens').update({
    view_count: (portal.view_count || 0) + 1,
    last_viewed_at: new Date().toISOString(),
  }).eq('token', token)

  return NextResponse.json({
    project,
    pay_apps: payApps || [],
    change_orders: changeOrders || [],
    open_rfis: rfis || [],
    schedule: schedTasks || [],
    photos: photos || [],
    daily_logs: dailyLogs || [],
    company_name: tenantSettings?.company_name,
    company_logo_url: tenantSettings?.company_logo_url,
  })
}
