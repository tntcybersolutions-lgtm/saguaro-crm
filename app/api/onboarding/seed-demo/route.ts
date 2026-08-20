import { NextRequest, NextResponse } from 'next/server'
import { getUser, createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = createServerClient()

    const { data: profile } = await db
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .eq('tenant_id', user.tenantId)
      .single()

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }

    const tenantId = profile.tenant_id

    // Check if demo already seeded
    const { data: tenant } = await db
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single()

    const settings = (tenant?.settings || {}) as Record<string, unknown>
    if (settings.demo_seeded === true) {
      return NextResponse.json({
        success: true,
        message: 'Demo already exists',
        data: { project_id: settings.demo_project_id },
      })
    }

    // Create demo project
    const { data: newProject, error: projErr } = await db
      .from('projects')
      .insert({
        tenant_id: tenantId,
        created_by: user.id,
        name: 'Mesa Commerce Center — Demo Project',
        address: '1250 W. Southern Ave',
        state: 'AZ',
        zip: '85202',
        project_type: 'Commercial Office',
        owner_name: 'Mesa Commercial Properties LLC',
        architect_name: 'Gensler Associates',
        project_number: 'DEMO-001',
        description: 'Demo project — explore all Saguaro CRM features with this sample commercial office project.',
        contract_value: 2850000,
        sq_footage: 22400,
        status: 'active',
        retainage_pct: 10,
      })
      .select('id')
      .single()

    if (projErr || !newProject) {
      console.error('[seed-demo] project insert error:', projErr)
      return NextResponse.json({ error: projErr?.message || 'Failed to create project' }, { status: 500 })
    }

    const projectId = newProject.id
    const bidDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    // Create 3 demo bid packages
    const bidPackages = [
      {
        tenant_id: tenantId, project_id: projectId, created_by: user.id,
        name: 'Electrical — Division 26 (DEMO)', trade: 'Electrical', csi_division: '26',
        package_number: 'BP-001', estimated_value: 89200, status: 'active',
        bid_due_date: bidDueDate, bid_validity_days: 60, requires_bond: false,
        insurance_required_amount: 1000000, ai_generated: true,
        scope_narrative: 'SCOPE OF WORK — ELECTRICAL DIVISION 26\n\nThe Electrical Subcontractor shall furnish all labor, materials, equipment, supervision, and temporary facilities required to provide a complete electrical installation for the Mesa Commerce Center commercial office project.',
        work_included: JSON.stringify([
          '2,000A, 480/277V, 3-phase main switchgear installation',
          '1,840 LF EMT conduit, concealed in walls and ceiling',
          '186 LED light fixtures per Lighting Schedule LS-1',
          'All power receptacles, switches, and devices per plans',
          'Grounding and bonding system per NEC 2023 Article 250',
          'Fire alarm rough-in and device installation',
          'Low voltage conduit for data/communications',
        ]),
        work_excluded: JSON.stringify([
          'Utility company service entrance and transformer',
          'Generator and automatic transfer switch',
          'Security and access control systems',
          'Photovoltaic solar system',
        ]),
      },
      {
        tenant_id: tenantId, project_id: projectId, created_by: user.id,
        name: 'Plumbing — Division 22 (DEMO)', trade: 'Plumbing', csi_division: '22',
        package_number: 'BP-002', estimated_value: 41500, status: 'active',
        bid_due_date: bidDueDate, bid_validity_days: 60, requires_bond: false,
        insurance_required_amount: 1000000, ai_generated: true,
        scope_narrative: 'SCOPE OF WORK — PLUMBING DIVISION 22\n\nThe Plumbing Subcontractor shall furnish all labor, materials, equipment, and supervision to provide a complete domestic water, sanitary sewer, and natural gas distribution system.',
        work_included: JSON.stringify([
          'Domestic hot and cold water distribution piping',
          'Sanitary drain, waste, and vent system',
          'All plumbing fixtures and trim per Fixture Schedule',
          'Water heater and recirculation system',
          'Testing and inspection to AHJ requirements',
        ]),
        work_excluded: JSON.stringify([
          'Utility connection fees (Owner direct)',
          'Fire suppression sprinkler system (Division 21)',
          'HVAC condensate drains (Division 23)',
        ]),
      },
      {
        tenant_id: tenantId, project_id: projectId, created_by: user.id,
        name: 'HVAC — Division 23 (DEMO)', trade: 'HVAC', csi_division: '23',
        package_number: 'BP-003', estimated_value: 67800, status: 'active',
        bid_due_date: bidDueDate, bid_validity_days: 60, requires_bond: false,
        insurance_required_amount: 1000000, ai_generated: true,
        scope_narrative: 'SCOPE OF WORK — HVAC DIVISION 23\n\nThe HVAC Subcontractor shall furnish all labor, materials, equipment, and supervision for complete heating, ventilating, and air conditioning systems.',
        work_included: JSON.stringify([
          '6 rooftop air handling units per Equipment Schedule',
          'All sheet metal supply and return ductwork per drawings',
          'Variable air volume (VAV) terminal units per plans',
          'Exhaust fans and toilet room exhaust systems',
          'Equipment start-up, testing, adjusting, and balancing',
        ]),
        work_excluded: JSON.stringify([
          'Electrical connections to HVAC equipment (Division 26)',
          'Plumbing connections for humidification (Division 22)',
          'Building automation system integration (Owner provided)',
        ]),
      },
    ]

    const { error: bpErr } = await db.from('bid_packages').insert(bidPackages)
    if (bpErr) console.error('[seed-demo] bid packages insert error:', bpErr)

    // Create 2 demo RFIs
    const rfis = [
      {
        tenant_id: tenantId, project_id: projectId, created_by: user.id,
        rfi_number: 1,
        subject: 'Electrical panel location conflict with structural beam (DEMO)',
        question: 'The electrical drawings show Panel LP-2 located in the mechanical room at Grid B-4. However, the structural drawings show a W12x26 beam at the same location at 9\'-0" AFF. Please confirm revised panel location or provide structural modification details.',
        spec_section: '26 24 16', drawing_reference: 'E-201, S-102',
        status: 'answered',
        submitted_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        answered_at: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
        answer: 'Panel LP-2 shall be relocated 2\'-6" south to Grid B-4.5 as shown on Revision 3 of Sheet E-201. No structural modification required.',
        days_to_respond: 3,
      },
      {
        tenant_id: tenantId, project_id: projectId, created_by: user.id,
        rfi_number: 2,
        subject: 'Plumbing fixture schedule discrepancy — Floor 2 restrooms (DEMO)',
        question: 'Floor 2 north restroom shows (4) water closets on Sheet P-201 but the Fixture Schedule on P-001 shows only (3) for this room. Please confirm correct count.',
        spec_section: '22 42 00', drawing_reference: 'P-201, P-001',
        status: 'submitted',
        submitted_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        is_urgent: false, days_to_respond: 7,
      },
    ]

    const { error: rfiErr } = await db.from('rfis').insert(rfis)
    if (rfiErr) console.error('[seed-demo] rfis insert error:', rfiErr)

    // Create 3 demo daily logs
    const dailyLogDate = (daysAgo: number) => {
      const d = new Date()
      d.setDate(d.getDate() - daysAgo)
      return d.toISOString().split('T')[0]
    }

    const dailyLogs = [
      {
        tenant_id: tenantId, project_id: projectId, created_by: user.id,
        log_date: dailyLogDate(1), status: 'submitted',
        weather: 'Clear', high_temp: 87, low_temp: 65,
        work_performed: 'Electrical contractor completed rough-in on floors 1 and 2. EMT conduit installation 65% complete. HVAC contractor set 3 of 6 RTU units on roof. Plumbing contractor installed all floor-2 sanitary lines.',
        manpower_count: 24,
        manpower_detail: JSON.stringify([
          { company: 'ABC Electric', trade: 'Electrical', workers: 8, hours: 8 },
          { company: 'Southwest HVAC', trade: 'Mechanical', workers: 6, hours: 8 },
          { company: 'Mesa Plumbing Co', trade: 'Plumbing', workers: 4, hours: 8 },
          { company: 'General Contractor', trade: 'General Labor', workers: 6, hours: 8 },
        ]),
        delay_hours: 0,
        safety_notes: 'Toolbox talk: Heat illness prevention. All workers reminded to hydrate. No incidents.',
      },
      {
        tenant_id: tenantId, project_id: projectId, created_by: user.id,
        log_date: dailyLogDate(2), status: 'submitted',
        weather: 'Partly Cloudy', high_temp: 92, low_temp: 68,
        work_performed: 'Concrete flatwork crew completed pour for Phase 2 slab area (approx 4,200 SF). HVAC ductwork installation began on Floor 1. Electrical panel rough inspections passed for Panels LP-1 and LP-3.',
        manpower_count: 28,
        delay_hours: 1.5,
        delays: 'Concrete delivery delayed 1.5 hours due to plant scheduling issue.',
        delay_type: 'material',
        safety_notes: 'Concrete pour — required all workers to wear safety glasses and hard hats in pour zone.',
      },
      {
        tenant_id: tenantId, project_id: projectId, created_by: user.id,
        log_date: dailyLogDate(5), status: 'submitted',
        weather: 'Clear', high_temp: 95, low_temp: 71,
        work_performed: 'Building inspection: framing and rough MEP passed. Received green tag for insulation. Insulation contractor began spray foam installation in exterior walls. Drywall delivery received.',
        manpower_count: 18, delay_hours: 0,
        visitors: JSON.stringify([
          { name: 'Building Inspector', company: 'City of Mesa', purpose: 'Framing/MEP rough inspection — PASSED' },
          { name: 'Project Architect', company: 'Gensler Associates', purpose: 'Site visit and RFI review' },
        ]),
        safety_notes: 'No incidents. Spray foam contractor reviewed SDS sheets with crew prior to start.',
      },
    ]

    const { error: dlErr } = await db.from('daily_logs').insert(dailyLogs)
    if (dlErr) console.error('[seed-demo] daily logs insert error:', dlErr)

    // Update tenant settings
    const updatedSettings = {
      ...settings,
      demo_seeded: true,
      demo_project_id: projectId,
      onboarding_steps: {
        ...(settings.onboarding_steps as Record<string, boolean> || {}),
        project_created: true,
      },
    }

    await db.from('tenants').update({ settings: updatedSettings }).eq('id', tenantId)

    return NextResponse.json({
      success: true,
      data: {
        project_id: projectId,
        bid_package_count: 3,
        rfi_count: 2,
        daily_log_count: 3,
        message: 'Demo project created. Explore all features with this sample data.',
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    console.error('[seed-demo] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
