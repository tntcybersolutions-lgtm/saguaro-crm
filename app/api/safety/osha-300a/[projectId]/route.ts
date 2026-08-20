import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { projectId } = await params

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

  const { data: incidents } = await supabase
    .from('safety_incidents')
    .select('*')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .eq('osha_recordable', true)
    .gte('incident_date', `${year}-01-01`)
    .lte('incident_date', `${year}-12-31`)

  const { data: project } = await supabase
    .from('projects')
    .select('name')
    .eq('id', projectId)
    .eq('tenant_id', tenantId)
    .single()

  const { data: settings } = await supabase
    .from('tenant_settings')
    .select('company_name, company_address, company_city, company_state, company_zip, ein')
    .eq('tenant_id', tenantId)
    .single()

  const allIncidents = incidents || []
  const totalDeaths = allIncidents.filter(i => i.type === 'fatality').length
  const lostTimeCases = allIncidents.filter(i => i.type === 'lost_time').length
  const transferCases = allIncidents.filter(i => (i.days_restricted || 0) > 0 && i.type !== 'lost_time').length
  const otherRecordable = allIncidents.filter(i => !['fatality', 'lost_time'].includes(i.type) && (i.days_restricted || 0) === 0).length
  const totalDaysAway = allIncidents.reduce((s, i) => s + (i.days_away || 0), 0)
  const totalDaysRestricted = allIncidents.reduce((s, i) => s + (i.days_restricted || 0), 0)
  const injuryCount = allIncidents.filter(i => i.type !== 'environmental').length
  const illnessCount = allIncidents.filter(i => i.type === 'environmental').length
  const NAICS = '236220'
  const avgEmployment = Math.round(allIncidents.length > 0 ? 25 : 0)
  const totalHours = avgEmployment * 2000

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>OSHA Form 300A - ${year} - ${project?.name || ''}</title>
  <style>
    @page { size: landscape; margin: 0.5in; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 9pt; color: #000; }
    .osha-header { text-align: center; margin-bottom: 12px; }
    .osha-header h1 { font-size: 14pt; font-weight: bold; }
    .osha-header h2 { font-size: 12pt; }
    .osha-header p { font-size: 8pt; color: #333; margin-top: 4px; }
    .info-row { display: flex; gap: 20px; margin-bottom: 10px; border: 1px solid #000; padding: 8px 10px; }
    .info-block { flex: 1; }
    .info-label { font-size: 7.5pt; font-weight: bold; text-transform: uppercase; color: #555; }
    .info-value { font-size: 10pt; margin-top: 2px; border-bottom: 1px solid #000; padding-bottom: 2px; }
    .main-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .main-table th { background: #333; color: #fff; padding: 5px 8px; font-size: 7.5pt; text-align: center; border: 1px solid #000; }
    .main-table td { padding: 6px 8px; border: 1px solid #000; text-align: center; font-size: 9pt; }
    .main-table td.label-cell { text-align: left; font-weight: bold; }
    .total-row td { background: #f0f0f0; font-weight: bold; }
    .cert-section { margin-top: 20px; border: 1px solid #000; padding: 12px; }
    .cert-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 30px; margin-top: 20px; }
    .sig-line { border-top: 1px solid #000; padding-top: 5px; font-size: 8pt; }
    .footer { margin-top: 16px; font-size: 7.5pt; color: #555; }
    .highlight { background: #fffbcd; }
  </style>
</head>
<body>
  <div class="osha-header">
    <h1>OSHA's Form 300A (Rev. 01/2004)</h1>
    <h2>Summary of Work-Related Injuries and Illnesses</h2>
    <p>U.S. Department of Labor &middot; Occupational Safety and Health Administration &middot; Year ${year}</p>
    <p style="margin-top:4px;font-size:7.5pt;">All establishments covered by Part 1904 must complete this Summary page, even if no injuries or illnesses occurred during the year.</p>
  </div>

  <div class="info-row">
    <div class="info-block">
      <div class="info-label">Establishment name</div>
      <div class="info-value">${settings?.company_name || ''}</div>
    </div>
    <div class="info-block">
      <div class="info-label">Street</div>
      <div class="info-value">${settings?.company_address || ''}</div>
    </div>
    <div class="info-block">
      <div class="info-label">City, State, ZIP</div>
      <div class="info-value">${settings?.company_city || ''}, ${settings?.company_state || ''} ${settings?.company_zip || ''}</div>
    </div>
    <div class="info-block">
      <div class="info-label">Industry description (e.g., Manufacture of motor truck trailers)</div>
      <div class="info-value">General Building Contractor &mdash; Commercial</div>
    </div>
  </div>
  <div class="info-row">
    <div class="info-block">
      <div class="info-label">Standard Industrial Classification (SIC), if known (e.g., 3715)</div>
      <div class="info-value">1542</div>
    </div>
    <div class="info-block">
      <div class="info-label">North American Industrial Classification (NAICS), if known (e.g., 336212)</div>
      <div class="info-value">${NAICS}</div>
    </div>
    <div class="info-block">
      <div class="info-label">Employment information</div>
      <div class="info-value">Annual avg. employees: <strong>${avgEmployment}</strong> &middot; Total hours worked: <strong>${totalHours.toLocaleString()}</strong></div>
    </div>
    <div class="info-block">
      <div class="info-label">Sign here</div>
      <div class="info-value" style="height:24px"></div>
    </div>
  </div>

  <table class="main-table">
    <thead>
      <tr>
        <th rowspan="2" style="width:160px">Number of Cases</th>
        <th colspan="4">Injury and Illness Types</th>
        <th colspan="2">Number of Days</th>
        <th colspan="6">Injury and Illness Types</th>
      </tr>
      <tr>
        <th>Total deaths<br>(G)</th>
        <th>Total cases with days away from work<br>(H)</th>
        <th>Total cases with job transfer or restriction<br>(I)</th>
        <th>Total other recordable cases<br>(J)</th>
        <th>Total days away from work<br>(K)</th>
        <th>Total days of job transfer or restriction<br>(L)</th>
        <th>Injuries<br>(M-1)</th>
        <th>Skin disorders<br>(M-2)</th>
        <th>Respiratory conditions<br>(M-3)</th>
        <th>Poisonings<br>(M-4)</th>
        <th>Hearing loss<br>(M-5)</th>
        <th>All other illnesses<br>(M-6)</th>
      </tr>
    </thead>
    <tbody>
      <tr class="total-row">
        <td class="label-cell">Totals</td>
        <td class="highlight">${totalDeaths}</td>
        <td class="highlight">${lostTimeCases}</td>
        <td class="highlight">${transferCases}</td>
        <td class="highlight">${otherRecordable}</td>
        <td class="highlight">${totalDaysAway}</td>
        <td class="highlight">${totalDaysRestricted}</td>
        <td>${injuryCount}</td>
        <td>0</td>
        <td>0</td>
        <td>0</td>
        <td>0</td>
        <td>${illnessCount}</td>
      </tr>
    </tbody>
  </table>

  <div style="margin-top:12px;border:2px solid #000;padding:8px;display:flex;align-items:center;gap:16px">
    <div style="font-size:22pt;font-weight:900">POST THIS SUMMARY</div>
    <div style="font-size:8.5pt;line-height:1.5">February 1 to April 30, ${year + 1}<br>
    OSHA strongly encourages all employers to post this summary for the entire month of February. Establishments with 10 or fewer employees and establishments in certain low-hazard industries need not keep OSHA injury and illness records unless OSHA or the Bureau of Labor Statistics informs them in writing that they must keep records.</div>
  </div>

  <div class="cert-section">
    <div style="font-weight:bold;margin-bottom:6px">Knowingly falsifying this document may result in a fine.</div>
    <p style="font-size:8.5pt;margin-bottom:12px">I certify that I have examined this document and that to the best of my knowledge the entries are true, accurate, and complete.</p>
    <div class="cert-grid">
      <div><div style="margin-bottom:30px"></div><div class="sig-line">Company executive</div></div>
      <div><div style="margin-bottom:30px"></div><div class="sig-line">Title</div></div>
      <div><div style="margin-bottom:30px"></div><div class="sig-line">Phone &middot; Date</div></div>
    </div>
  </div>

  <div class="footer">
    <strong>Project:</strong> ${project?.name || ''} &middot; <strong>OSHA 300A Annual Summary</strong> &middot; Year ${year} &middot; ${allIncidents.length} recordable incident(s) &middot; Generated ${new Date().toLocaleDateString()}
  </div>

  <script>window.onload = () => window.print()</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  })
}
