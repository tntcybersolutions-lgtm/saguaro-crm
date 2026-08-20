import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { id: projectId } = await params

  const { searchParams } = new URL(req.url)
  const logDate = searchParams.get('date') || new Date().toISOString().split('T')[0]

  const { data: log, error } = await supabase
    .from('daily_logs')
    .select(`
      *,
      projects(name, address, city, state),
      profiles(full_name)
    `)
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .eq('log_date', logDate)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!log) return NextResponse.json({ error: 'No log found for this date' }, { status: 404 })

  const { data: settings } = await supabase
    .from('tenant_settings')
    .select('company_name, company_address, company_city, company_state, company_zip, company_phone, logo_url')
    .eq('tenant_id', tenantId)
    .single()

  const { data: photos } = await supabase
    .from('project_photos')
    .select('file_url, caption, ai_description')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .gte('created_at', logDate + 'T00:00:00')
    .lte('created_at', logDate + 'T23:59:59')
    .limit(6)

  const dateFormatted = new Date(logDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const projectData = log.projects as Record<string, string> | null
  const profileData = log.profiles as Record<string, string> | null
  const manpowerTrades = (Array.isArray(log.manpower_by_trade) ? log.manpower_by_trade : []) as Array<{ trade?: string; company?: string; count?: number; hours?: number }>

  const manpowerHtml = manpowerTrades.length > 0 ? `
  <div class="section-title">MANPOWER BY TRADE</div>
  <table class="manpower-table">
    <thead><tr><th>Trade / Crew</th><th>Company</th><th># Workers</th><th>Hours</th></tr></thead>
    <tbody>
      ${manpowerTrades.map(t => `
        <tr>
          <td>${t.trade || ''}</td>
          <td>${t.company || ''}</td>
          <td style="text-align:center;font-weight:bold">${t.count || 0}</td>
          <td style="text-align:center">${t.hours || 8}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>` : ''

  const photosHtml = (photos || []).length > 0 ? `
  <div class="section-title">SITE PHOTOS (${photos?.length})</div>
  <div class="photos">
    ${(photos || []).map(p => `
      <div class="photo-item">
        <img src="${p.file_url}" alt="${p.caption || ''}" />
        <div class="photo-cap">${p.caption || p.ai_description || ''}</div>
      </div>
    `).join('')}
  </div>` : ''

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Daily Report - ${projectData?.name || ''} - ${dateFormatted}</title>
  <style>
    @page { size: letter; margin: 0.75in; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #000; line-height: 1.4; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 3px solid #0d1117; }
    .logo-area { font-size: 20pt; font-weight: 900; color: #0d1117; }
    .company-info { font-size: 8pt; color: #555; margin-top: 3px; }
    h1 { font-size: 14pt; font-weight: bold; text-align: center; background: #0d1117; color: #fff; padding: 10px; margin-bottom: 18px; letter-spacing: 1px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #000; margin-bottom: 16px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; border: 1px solid #000; margin-bottom: 16px; }
    .cell { padding: 8px 10px; border-right: 1px solid #ccc; border-bottom: 1px solid #ccc; }
    .cell:last-child { border-right: none; }
    .cell-label { font-size: 7.5pt; font-weight: bold; text-transform: uppercase; color: #666; margin-bottom: 3px; letter-spacing: 0.5px; }
    .cell-value { font-size: 10pt; font-weight: 500; }
    .section-title { font-size: 9pt; font-weight: bold; text-transform: uppercase; background: #f0f0f0; padding: 6px 10px; border: 1px solid #ccc; border-bottom: none; letter-spacing: 0.5px; margin-top: 14px; }
    .section-body { border: 1px solid #ccc; padding: 10px; font-size: 10pt; line-height: 1.7; min-height: 50px; margin-bottom: 14px; white-space: pre-wrap; }
    .manpower-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    .manpower-table th { background: #0d1117; color: #fff; padding: 6px 10px; font-size: 8.5pt; text-align: left; }
    .manpower-table td { padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 9.5pt; }
    .manpower-table tr:nth-child(even) td { background: #f9f9f9; }
    .photos { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 10px; }
    .photo-item img { width: 100%; height: 120px; object-fit: cover; border: 1px solid #ccc; }
    .photo-cap { font-size: 7.5pt; color: #555; margin-top: 3px; }
    .signature-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 30px; margin-top: 40px; }
    .sig-line { border-top: 1px solid #000; padding-top: 5px; font-size: 8pt; text-align: center; }
    .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 7.5pt; color: #888; text-align: center; }
    .weather-badge { display: inline-block; padding: 2px 8px; background: #e8f4fd; border: 1px solid #bee3f8; border-radius: 4px; font-size: 9pt; color: #2b6cb0; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo-area">${settings?.company_name || 'General Contractor'}</div>
      <div class="company-info">${settings?.company_address || ''} ${settings?.company_city || ''}, ${settings?.company_state || ''}</div>
      <div class="company-info">${settings?.company_phone || ''}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:9pt;color:#555;font-weight:bold">DAILY FIELD REPORT</div>
      <div style="font-size:9pt;color:#555;">Report Date: ${dateFormatted}</div>
      <div style="font-size:9pt;color:#555;">Generated: ${today}</div>
    </div>
  </div>

  <h1>DAILY FIELD REPORT</h1>

  <div class="grid-2">
    <div class="cell"><div class="cell-label">Project Name</div><div class="cell-value">${projectData?.name || ''}</div></div>
    <div class="cell" style="border-right:none"><div class="cell-label">Project Address</div><div class="cell-value">${projectData?.address || ''} ${projectData?.city || ''}</div></div>
    <div class="cell"><div class="cell-label">Report Date</div><div class="cell-value">${dateFormatted}</div></div>
    <div class="cell" style="border-right:none"><div class="cell-label">Superintendent / PM</div><div class="cell-value">${profileData?.full_name || ''}</div></div>
  </div>

  <div class="grid-3">
    <div class="cell"><div class="cell-label">Conditions</div><div class="cell-value"><span class="weather-badge">${log.conditions || 'Clear'}</span></div></div>
    <div class="cell"><div class="cell-label">Temperature</div><div class="cell-value">${log.temp_low || '--'}&deg;F low / ${log.temp_high || '--'}&deg;F high</div></div>
    <div class="cell" style="border-right:none"><div class="cell-label">Total Manpower On Site</div><div class="cell-value" style="font-size:14pt;font-weight:900">${log.manpower_count || 0} workers</div></div>
  </div>

  ${manpowerHtml}

  <div class="section-title">WORK PERFORMED TODAY</div>
  <div class="section-body">${log.work_performed || 'No description provided.'}</div>

  ${log.delays ? `
  <div class="section-title">DELAYS / ISSUES</div>
  <div class="section-body">${log.delays}</div>` : ''}

  <div class="section-title">SAFETY OBSERVATIONS</div>
  <div class="section-body">${log.safety_notes || 'No safety incidents or observations.'}</div>

  ${log.materials_received ? `
  <div class="section-title">MATERIALS / DELIVERIES RECEIVED</div>
  <div class="section-body">${log.materials_received}</div>` : ''}

  ${log.visitors ? `
  <div class="section-title">SITE VISITORS</div>
  <div class="section-body">${log.visitors}</div>` : ''}

  ${photosHtml}

  <div class="signature-grid">
    <div><div style="margin-bottom:36px"></div><div class="sig-line">Superintendent Signature</div><div style="font-size:8pt;text-align:center;margin-top:4px">${profileData?.full_name || ''}</div></div>
    <div><div style="margin-bottom:36px"></div><div class="sig-line">Project Manager</div></div>
    <div><div style="margin-bottom:36px"></div><div class="sig-line">Date</div><div style="font-size:8pt;text-align:center;margin-top:4px">${dateFormatted}</div></div>
  </div>

  <div class="footer">
    Daily Field Report &middot; ${settings?.company_name || ''} &middot; ${projectData?.name || ''} &middot; ${dateFormatted}<br>
    This report is a project record document. Retain for the duration of the project and three (3) years after completion.
  </div>

  <script>window.onload = () => window.print()</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  })
}
