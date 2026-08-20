import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const client = new Anthropic()

interface DocPrompt {
  id: string
  title: string
  prompt: string
}

interface DocResult {
  id: string
  title: string
  content: string
  success: boolean
  error?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { projectId } = await params

  const body = (await req.json()) as {
    takeoffId?: string
    bidPackageIds?: string[]
  }
  const takeoffId = body.takeoffId
  const bidPackageIds = body.bidPackageIds

  if (!takeoffId) {
    return NextResponse.json({ error: 'takeoffId required' }, { status: 400 })
  }

  const [
    { data: takeoff },
    { data: lineItems },
    { data: scopeGaps },
    { data: project },
    { data: settings },
    { data: packages },
  ] = await Promise.all([
    supabase
      .from('takeoffs')
      .select('*')
      .eq('id', takeoffId)
      .eq('tenant_id', tenantId)
      .single(),
    supabase
      .from('takeoff_line_items')
      .select('*')
      .eq('takeoff_id', takeoffId)
      .eq('tenant_id', tenantId)
      .order('csi_division'),
    supabase
      .from('takeoff_scope_gaps')
      .select('*')
      .eq('takeoff_id', takeoffId)
      .eq('tenant_id', tenantId),
    supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('tenant_id', tenantId)
      .single(),
    supabase
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    bidPackageIds && bidPackageIds.length > 0
      ? supabase
          .from('bid_packages')
          .select('*')
          .in('id', bidPackageIds)
          .eq('project_id', projectId)
          .eq('tenant_id', tenantId)
      : supabase
          .from('bid_packages')
          .select('*')
          .eq('project_id', projectId)
          .eq('tenant_id', tenantId)
          .eq('takeoff_id', takeoffId),
  ])

  if (!takeoff || !project) {
    return NextResponse.json(
      { error: 'Takeoff or project not found' },
      { status: 404 },
    )
  }

  const proj = project as Record<string, any>
  const gc = (settings as Record<string, any>) || {}
  const items = (lineItems as Record<string, any>[]) || []
  const _gaps = (scopeGaps as Record<string, any>[]) || []
  const pkgsAll = (packages as Record<string, any>[]) || []
  const pkgs = pkgsAll

  console.log(
    '[JACKET] Starting generation — project:',
    projectId,
    'takeoff:',
    takeoffId,
    'packages:',
    pkgs.length,
    'line items:',
    items.length,
  )

  if (pkgs.length === 0) {
    console.error(
      '[JACKET] ERROR: No bid packages matched. bidPackageIds=',
      bidPackageIds,
      'takeoffId=',
      takeoffId,
    )
    return NextResponse.json(
      {
        error:
          'No bid packages found to generate documents for. Check takeoff_id on packages.',
        bidPackageIds,
        takeoffId,
      },
      { status: 404 },
    )
  }

  const t = takeoff as Record<string, any>

  const grandTotal = Number(t.grand_total) || 0
  const buildingArea = Number(proj.square_footage || t.building_area) || 0
  const buildingType = proj.project_type || t.building_type || 'Commercial'
  const floorCount = Number(t.floor_count) || 1

  const gcName = gc.company_name || '[Your Company Name — set in Settings → Company]'
  const gcAddress = [
    gc.company_address,
    gc.company_city
      ? `${gc.company_city}, ${gc.company_state || ''} ${gc.company_zip || ''}`.trim()
      : '',
  ]
    .filter(Boolean)
    .join(', ')
  const gcPhone = gc.company_phone || '[Phone — Settings → Company]'
  const gcEmail = gc.company_email || '[Email — Settings → Company]'
  const gcWeb = gc.company_website || ''
  const gcLicense = gc.license_number
    ? `License #${gc.license_number}${gc.license_state ? ' (' + gc.license_state + ')' : ''}`
    : '[License # — Settings → Company]'
  const gcEIN = gc.ein ? `EIN: ${gc.ein}` : ''
  const gcContact = gc.signature_name || 'Authorized Representative'
  const gcTitle = gc.signature_title || 'Project Manager'
  const projAddressCtx = [
    proj.address,
    proj.city ? `${proj.city}, ${proj.state || ''}` : '',
  ]
    .filter(Boolean)
    .join(', ')

  const projectContext = `
GENERAL CONTRACTOR: ${gcName}${gc.company_dba ? ' (DBA: ' + gc.company_dba + ')' : ''}
  Address: ${gcAddress || '[Complete address in Settings → Company]'}
  Phone: ${gcPhone} | Email: ${gcEmail}${gcWeb ? ' | Web: ' + gcWeb : ''}
  ${gcLicense}${gcEIN ? ' | ' + gcEIN : ''}
  Authorized By: ${gcContact}, ${gcTitle}
  Default Retainage: ${Number(gc.default_retainage_pct) || 10}% | Payment Terms: Net ${gc.default_payment_terms || 30} days | Bid Validity: ${gc.default_bid_validity_days || 30} days

PROJECT: ${proj.name || 'Project'}${proj.project_number ? ' (No. ' + proj.project_number + ')' : ''}
  Address: ${projAddressCtx || 'Address TBD'}
  Owner: ${proj.owner_name || 'Owner'}${proj.owner_company ? ' / ' + proj.owner_company : ''}
  Building Type: ${buildingType}
  ${buildingArea ? 'Area: ' + buildingArea.toLocaleString() + ' SF' : ''}
  Floors: ${floorCount}
  Start: ${proj.start_date ? new Date(proj.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD'}
  Completion: ${proj.substantial_date || proj.final_completion_date || proj.estimated_completion ? new Date(proj.substantial_date || proj.final_completion_date || proj.estimated_completion).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD'}
  Contract Value: $${Number(proj.contract_value || grandTotal).toLocaleString(undefined, { maximumFractionDigits: 0 })}

TAKEOFF SUMMARY (AI Analysis):
  Grand Total: $${grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
  Cost Per SF: $${Number(t.cost_per_sqft || 0).toFixed(2)}/SF
  AI Confidence: ${Math.round(Number(t.extraction_confidence || 0) * 100)}%
  Line Items: ${items.length}`

  const csiSummary = Object.entries(
    items.reduce((acc: Record<string, { total: number; items: number }>, item) => {
      const div = String(item.csi_division || '01').slice(0, 2)
      if (!acc[div]) acc[div] = { total: 0, items: 0 }
      acc[div].total +=
        (Number(item.total_material) || 0) +
        (Number(item.total_labor) || 0) +
        (Number(item.total_equipment) || 0)
      acc[div].items++
      return acc
    }, {}),
  )
    .map(
      ([div, data]) =>
        `Division ${div}: $${data.total.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${data.items} items)`,
    )
    .join('\n')

  const lineItemsText = items
    .slice(0, 100)
    .map(
      (i) =>
        `${i.csi_code || i.csi_division || ''} | ${i.description || ''} | ${Number(i.adjusted_quantity ?? i.quantity ?? 0).toLocaleString()} ${i.unit || ''} | Mat: $${Number(i.unit_material_cost || 0).toFixed(2)} | Labor: $${Number(i.unit_labor_cost || 0).toFixed(2)} | Total: $${(Number(i.total_material || 0) + Number(i.total_labor || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    )
    .join('\n')

  const today = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const bidDueDate = new Date(
    Date.now() + 14 * 24 * 60 * 60 * 1000,
  ).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const retainagePct = gc.default_retainage_pct || proj.retainage_pct || 10
  const paymentTerms = gc.default_payment_terms || 'Net 30'
  const bidValidityDays = gc.default_bid_validity_days || 30
  const gcCompanyName = gc.company_name || 'General Contractor'

  const weatherFloatDays = Math.max(3, Math.round((buildingArea / 5000) * 5))

  const divisionCount = Object.keys(
    items.reduce((acc: Record<string, number>, i) => {
      const d = String(i.csi_division || '01').slice(0, 2)
      acc[d] = 1
      return acc
    }, {}),
  ).length

  const docPrompts: DocPrompt[] = [
    {
      id: 'cover_page',
      title: 'Cover Page',
      prompt: `Create a professional bid package cover page for:
${projectContext}
TOTAL ESTIMATED VALUE: $${grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
LINE ITEMS: ${items.length} across ${divisionCount} CSI divisions
BID DUE: ${bidDueDate}

Create a clean, professional HTML cover page with:
- Large centered project name
- Project address and building type
- GC company letterhead area with logo placeholder
- "BID PACKAGE" title in large bold text
- Bid due date
- Total estimated value
- Package prepared by line
- Confidentiality notice
- Table of contents listing all 14 documents in this package:
  1. Cover Page
  2. Invitation to Bid
  3. Instructions to Bidders
  4. Bid Proposal Form
  5. Scope of Work
  6. Schedule of Values Template
  7. Insurance Requirements
  8. Site Safety Requirements
  9. Submittal Requirements
  10. Drawing Sheet Log
  11. Project Schedule Summary
  12. RFI Procedures
  13. General Conditions Summary
  14. Pre-Bid Meeting Agenda
Use professional construction industry design. Dark navy header bar, gold accents.
Return only the HTML content div.`,
    },
    {
      id: 'invitation_to_bid',
      title: 'Invitation to Bid',
      prompt: `Write a formal Invitation to Bid letter for a construction project.
${projectContext}
BID DUE DATE: ${bidDueDate} at 2:00 PM local time
TOTAL ESTIMATED VALUE: $${grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}

Write a complete, professional Invitation to Bid as an HTML document with proper construction industry formatting.
Include: project overview, scope summary, bid due date and location, pre-bid meeting notice (date TBD),
required bid documents, bond requirements (10% bid bond), insurance requirements summary,
owner's right to reject bids, and GC contact information.
Use formal letterhead layout with GC company name at top. Professional construction industry language throughout.`,
    },
    {
      id: 'instructions_to_bidders',
      title: 'Instructions to Bidders',
      prompt: `Write complete Instructions to Bidders for a construction bid package.
${projectContext}

Write a comprehensive Instructions to Bidders document as HTML. Include all standard AIA-style sections:
1. Definitions
2. Bidder's Representations and Qualifications
3. Examination of Documents and Site
4. Preparation and Submission of Bids (sealed bid requirements, delivery address, deadline)
5. Bid Modifications and Withdrawal
6. Opening of Bids
7. Evaluation and Award Criteria
8. Performance and Payment Bond Requirements (100% each)
9. Insurance Requirements (minimum $2M general liability, workers comp, auto)
10. Prevailing Wage (if applicable)
11. Subcontractor Listing Requirements
12. Owner's Rights
13. Contract Award and Execution Timeline
Use numbered sections, formal legal language, professional formatting.`,
    },
    {
      id: 'bid_form',
      title: 'Bid Proposal Form',
      prompt: `Create a complete Bid Proposal Form for subcontractors to fill out.
${projectContext}
BID DUE: ${bidDueDate}

CSI SCOPE BREAKDOWN:
${csiSummary}

BID FORM QUANTITY SCHEDULE (pre-filled from takeoff):
${items
  .slice(0, 60)
  .map(
    (i) =>
      `${i.csi_code || i.csi_division || ''} | ${i.description || ''} | ${Number(i.adjusted_quantity ?? i.quantity ?? 0).toLocaleString()} ${i.unit || ''} | Unit Price: $_____ | Extended: $_____`,
  )
  .join('\n')}

Create a professional Bid Proposal Form as HTML with:
1. Bidder info section (company, license, contact, bonding capacity — all required fields)
2. The EXACT quantities above pre-filled into a unit-price schedule — bidder only fills in unit price and extended amount
3. Base bid amount line with breakdown by CSI division
4. Alternates section (3 add/deduct alternates: roof upgrade, HVAC upgrade, storm drain upgrade)
5. Bid bond certification checkbox
6. Schedule acknowledgment (start date and completion date)
7. Insurance certification checkboxes
8. Signature block with notary
9. Bid validity (${bidValidityDays} days)
Every quantity must match the takeoff exactly. Price columns stay blank for the sub to complete.
Return only the HTML content div.`,
    },
    {
      id: 'scope_of_work',
      title: 'Scope of Work',
      prompt: `Write a DETAILED, TRADE-SPECIFIC Scope of Work for subcontractors.
${projectContext}

CSI DIVISIONS IN SCOPE WITH QUANTITIES:
${Object.entries(
  items.reduce((acc: Record<string, Record<string, any>[]>, item) => {
    const div = String(item.csi_division || '01').slice(0, 2)
    if (!acc[div]) acc[div] = []
    acc[div].push(item)
    return acc
  }, {}),
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([div, divItems]) => {
    const divTotal = divItems.reduce(
      (s, i) => s + (Number(i.total_material) || 0) + (Number(i.total_labor) || 0),
      0,
    )
    const sample = divItems
      .slice(0, 8)
      .map(
        (i) =>
          `  - ${i.description || 'item'}: ${Number(i.quantity || 0).toLocaleString()} ${i.unit || ''}`,
      )
      .join('\n')
    return `Division ${div}: ${divItems.length} items, est. $${divTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}\n${sample}`
  })
  .join('\n\n')}

Write a COMPLETE Scope of Work organized by CSI division. For each division:
1. Write a paragraph describing the full scope
2. List INCLUDED items with specific quantities from the takeoff
3. List EXCLUDED items (what the sub is NOT responsible for)
4. List coordination requirements with other trades
5. Reference the applicable spec section

Be specific. Use quantities from the takeoff. A sub reading this should know EXACTLY what they are responsible for with zero ambiguity.
This document becomes the legal scope attached to the subcontract.
Include a General Requirements section covering submittals, schedule coordination, safety, cleanup, and project meetings.
Return only the HTML content div.`,
    },
    {
      id: 'schedule_of_values',
      title: 'Schedule of Values Template',
      prompt: `Create a Schedule of Values (SOV) for this construction project.
${projectContext}
TOTAL CONTRACT VALUE: $${grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}

CSI BREAKDOWN:
${csiSummary}

Create a complete AIA-style Schedule of Values as HTML with:
1. Header with project info, contract number, contractor, date
2. Line items organized by CSI division (use the breakdown above as basis)
3. Columns: Item No. | Description | Scheduled Value | Work Completed (previous) | Work Completed (this period) | Materials Stored | Total Completed % | Balance to Finish | Retainage
4. Allocate the grand total across all divisions proportionally
5. Include general conditions as separate line (typically 8-12% of total)
6. Subtotals by division
7. Grand total row
8. Signature block
9. Retainage rate: ${retainagePct}%
Format as a proper spreadsheet-style HTML table. Use the CSI division totals from the takeoff for the Scheduled Value column.`,
    },
    {
      id: 'insurance_requirements',
      title: 'Insurance Requirements',
      prompt: `Write an Insurance Requirements document for subcontractors on this project.
${projectContext}
GC COMPANY: ${gcCompanyName}

Write a comprehensive Insurance Requirements sheet as HTML covering:
1. Required insurance types and minimum limits:
   - Commercial General Liability: $2,000,000 per occurrence / $4,000,000 aggregate
   - Workers Compensation: Statutory limits per Arizona law
   - Employers Liability: $1,000,000 each accident
   - Commercial Auto Liability: $1,000,000 combined single limit
   - Umbrella/Excess Liability: $5,000,000 per occurrence
   - Professional Liability (if applicable): $1,000,000
   - Builders Risk: Full replacement value
2. Additional Insured requirements (GC, Owner, Architect must be named)
3. Waiver of Subrogation requirements
4. Certificate of Insurance submission requirements and deadline
5. Policy cancellation notice requirements (30 days)
6. Acceptable insurance carriers (A-rated or better, licensed in Arizona)
7. Consequences of non-compliance
8. Contact information for certificate delivery
Format as official requirements document with numbered sections.`,
    },
    {
      id: 'safety_requirements',
      title: 'Site Safety Requirements',
      prompt: `Write a Site Safety Requirements document for subcontractors.
${projectContext}

Write a comprehensive Site Safety Requirements document as HTML covering:
1. OSHA Compliance — 29 CFR 1926 Construction Industry Standards
2. Site-Specific Safety Plan requirements (each sub must submit)
3. Required PPE (hard hat, safety vest, steel-toed boots, eye protection minimums)
4. Fall Protection — 100% tie-off at 6 feet and above
5. Excavation and trenching safety requirements
6. Electrical safety and LOTO procedures
7. Hazard Communication (SDS requirements)
8. Hot Work permit procedures
9. Housekeeping and material storage requirements
10. Incident reporting procedures (immediate reporting to superintendent)
11. Drug and alcohol policy (zero tolerance, random testing)
12. Weekly toolbox talk requirements
13. Safety violation procedures (first violation warning, second removal from site)
14. Emergency procedures and evacuation plan acknowledgment
15. OSHA recordable incident protocol
Format as official safety document with numbered sections and signature/acknowledgment block.`,
    },
    {
      id: 'submittal_requirements',
      title: 'Submittal Requirements',
      prompt: `Create a Submittal Requirements Log for this construction project.
${projectContext}

CSI DIVISIONS IN SCOPE:
${csiSummary}

Create a comprehensive Submittal Requirements document as HTML with:
1. General submittal procedures (electronic submission preferred, PDF format, 8 copies if paper)
2. Review timeline (14 calendar days standard, 21 days for complex items)
3. Transmittal form requirements
4. Re-submittal procedures
5. Submittal log table with columns: Item No. | CSI Section | Description | Required By | Submitted | Returned | Status
   Pre-populate with typical submittals for each CSI division in scope, for example:
   - Division 03: Concrete mix designs, rebar shop drawings, formwork submittals
   - Division 05: Structural steel shop drawings, connection details, mill certs
   - Division 06: Lumber species/grade, engineered wood product data
   - Division 07: Roofing system data, waterproofing product data, insulation data
   - Division 08: Door and hardware schedules, window shop drawings
   - Division 09: Finish schedule, paint product data, flooring samples
   - Division 22/23/26: Equipment submittals, shop drawings, O&M manuals
   Generate 2-4 typical submittal requirements per CSI division present in the takeoff.
Format as a professional submittal log with the table spanning most of the document.`,
    },
    {
      id: 'drawing_log',
      title: 'Drawing Sheet Log',
      prompt: `Create a Drawing Sheet Log for this construction project.
${projectContext}
BUILDING TYPE: ${buildingType}
SIZE: ${buildingArea.toLocaleString()} SF | FLOORS: ${floorCount}

Create a comprehensive Drawing Sheet Log as HTML.
Generate a realistic drawing sheet list appropriate for a ${buildingType} building of this size.
Include the following discipline sets with realistic sheet numbers:
- Civil (C-series): Site plan, grading, utility plan, drainage
- Architectural (A-series): Floor plans all levels, elevations, sections, enlarged plans, details, interior elevations, reflected ceiling plans, door/window schedules
- Structural (S-series): Foundation plan, framing plans all levels, details, schedules
- Mechanical (M-series): HVAC floor plans all levels, schedules, details
- Plumbing (P-series): Plumbing floor plans, riser diagrams, details
- Electrical (E-series): Power plans, lighting plans, one-line diagrams, details
- Landscape (L-series): Planting plan, irrigation plan
Table columns: Sheet Number | Sheet Title | Date | Revision | Included in Package (checkbox)
Include 30-50 sheets total appropriate for the building size. Mark all as Rev 0 / current date.
This tells subcontractors exactly what drawings they have and are responsible for.`,
    },
    {
      id: 'project_schedule',
      title: 'Project Schedule Summary',
      prompt: `Create a Project Schedule Summary for this construction project.
${projectContext}
TOTAL PROJECT DURATION: ${
        proj.start_date && (proj.substantial_date || proj.final_completion_date)
          ? Math.round(
              (new Date(proj.substantial_date || proj.final_completion_date).getTime() -
                new Date(proj.start_date).getTime()) /
                (1000 * 60 * 60 * 24 * 7),
            ) + ' weeks'
          : '52 weeks (estimated)'
      }

CSI DIVISIONS IN SCOPE:
${csiSummary}

Create a Project Schedule Summary as HTML with:
1. Key project milestones table: Milestone | Date | Duration | Predecessor
   Generate realistic milestone dates starting from ${proj.start_date ? new Date(proj.start_date).toLocaleDateString() : 'project start'} including:
   - Notice to Proceed
   - Mobilization / Site Prep
   - Foundation / Earthwork complete
   - Structural Steel / Framing complete
   - Rough MEP complete
   - Building Dry-In (roof, windows, doors)
   - Insulation / Drywall
   - MEP Trim-Out
   - Finishes complete
   - Punch List
   - Certificate of Occupancy
   - Final Completion / Closeout
2. Subcontractor mobilization schedule by trade (when each trade starts and finishes)
3. Key submission deadlines (submittals, RFIs, change order windows)
4. Weather contingency language (${weatherFloatDays} days float included)
5. Liquidated damages notice: $500/day after scheduled completion
6. Signature block for schedule acknowledgment
Format as a professional schedule document with the milestone table as the centerpiece.`,
    },
    {
      id: 'rfi_procedures',
      title: 'RFI Procedures',
      prompt: `Write an RFI (Request for Information) Procedures document.
${projectContext}

Write a comprehensive RFI Procedures document as HTML covering:
1. Purpose and scope of RFI process
2. RFI submission requirements:
   - Electronic submission through Saguaro project portal (preferred)
   - Required fields: project number, RFI number, date, priority, trade, spec section, drawing reference, question, proposed solution
   - Supporting attachments (sketches, photos, markup drawings)
3. Response timeline standards:
   - Standard: 10 business days
   - Priority/Urgent: 3 business days
   - Emergency/Safety: Same day
4. RFI numbering system (by trade prefix, e.g., CONC-001, ELEC-001)
5. RFI cutoff dates (no RFIs accepted within 30 days of substantial completion)
6. Unauthorized work prohibition (never proceed on unresolved RFIs)
7. RFI log maintenance requirements
8. Cost and schedule impact notification requirements
9. Architect/Engineer review routing
10. Subcontractor responsibility for RFI tracking
11. Contact list for RFI submissions (GC superintendent, PM, Architect)
Format as official procedures document with numbered sections.`,
    },
    {
      id: 'general_conditions',
      title: 'General Conditions Summary',
      prompt: `Write a General Conditions Summary for subcontract agreements.
${projectContext}
RETAINAGE: ${retainagePct}%
PAYMENT TERMS: ${paymentTerms} from GC receipt of payment from Owner

Write a General Conditions Summary as HTML covering the key commercial terms including:
1. Contract Documents hierarchy (Prime Contract, Plans, Specs, Addenda, Subcontract)
2. Scope of Work reference
3. Contract Sum and payment schedule
4. Retainage (${retainagePct}% held until final completion and lien period)
5. Pay-when-paid clause (payment to sub contingent on GC receiving payment from Owner)
6. Schedule compliance requirements and liquidated damages pass-through
7. Change order procedures (all changes must be authorized in writing before proceeding)
8. Submittal and RFI responsibilities
9. Site cleanliness and material storage requirements
10. Coordination with other trades
11. Warranty requirements (1 year minimum, manufacturer warranties per spec)
12. Dispute resolution (mediation → arbitration per AAA rules)
13. Termination for convenience and cause provisions
14. Lien waiver requirements (conditional upon payment, unconditional upon final)
15. Governing law (State of Arizona)
Include a signature and acknowledgment block.`,
    },
    {
      id: 'pre_bid_agenda',
      title: 'Pre-Bid Meeting Agenda',
      prompt: `Write a Pre-Bid Meeting Agenda for this construction project.
${projectContext}
MEETING DATE: TBD (approximately 7 days before bid due date)
MEETING LOCATION: ${proj.address || ''}${proj.city ? ', ' + proj.city : ''}${proj.state ? ', ' + proj.state : ''} — Project Site
BID DUE DATE: ${bidDueDate}
TOTAL ESTIMATED VALUE: $${grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}

Write a complete Pre-Bid Meeting Agenda as HTML covering:
1. Welcome and introductions (GC team, Owner rep, Architect/Engineer)
2. Project overview (scope, schedule, phasing)
3. Site walkthrough schedule (trades, duration, what to look for)
4. Contract documents review (drawings, specs, addenda issued to date)
5. Bid package requirements (what to include, format)
6. Questions and clarifications process
7. Scope clarification for potentially ambiguous items
8. Bond and insurance requirements confirmation
9. Prevailing wage discussion (if applicable)
10. Key milestone dates review
11. Subcontractor prequalification requirements
12. Open Q&A session
13. Next steps and RFI cutoff for pre-bid questions
14. Attendance sheet (required for bid eligibility on some packages)
Include time allocations for each agenda item. Total meeting: 90 minutes.
Format as a professional meeting agenda with the GC letterhead at top.`,
    },
  ]

  const generateDoc = async (doc: DocPrompt): Promise<DocResult> => {
    try {
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: `You are a professional construction document writer with 25 years of experience writing bid packages for general contractors.
Write complete, professional construction documents in HTML format.
Use proper construction industry terminology and formatting.
Documents must be ready to use immediately — no placeholders, no "insert here" text.
Fill in all fields with the project data provided.
Format as clean HTML with professional CSS styling appropriate for printed documents.
Use a white background, Times New Roman or Arial font, proper margins, and print-ready layout.
Do not include DOCTYPE, html, head, or body tags — just the content div.
Add page break CSS where appropriate for multi-page documents.`,
        messages: [
          {
            role: 'user',
            content: doc.prompt,
          },
        ],
      })
      const block = msg.content[0]
      const content = block && block.type === 'text' ? block.text : ''
      if (!content || content.length < 50) {
        console.error(
          '[JACKET] Doc',
          doc.id,
          'returned empty/too-short content (len=',
          content.length,
          ')',
        )
        return {
          id: doc.id,
          title: doc.title,
          content: '',
          success: false,
          error: 'Empty or too-short response from Claude',
        }
      }
      console.log(
        '[JACKET] Generated doc:',
        doc.id,
        '— length:',
        content.length,
      )
      return { id: doc.id, title: doc.title, content, success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[JACKET] Doc', doc.id, 'FAILED:', message)
      return {
        id: doc.id,
        title: doc.title,
        content: '',
        success: false,
        error: message,
      }
    }
  }

  const results: DocResult[] = []
  const batchSize = 4
  for (let i = 0; i < docPrompts.length; i += batchSize) {
    const batch = docPrompts.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(generateDoc))
    results.push(...batchResults)
  }

  const successCount = results.filter((r) => r.success).length
  console.log(
    '[JACKET] Generation complete — success:',
    successCount,
    'failed:',
    results.length - successCount,
  )

  if (successCount === 0) {
    console.error(
      '[JACKET] ABORT: All Claude calls failed. Not overwriting jacket_sections.',
    )
    return NextResponse.json(
      {
        error:
          'All document generation failed. jacket_sections not overwritten. Check server logs.',
        failed: results.map((r) => ({ id: r.id, error: r.error })),
      },
      { status: 500 },
    )
  }

  const projName = proj.name || 'Project'

  const esc = (s: string) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

  const projAddressLine = [
    proj.address,
    proj.city ? `${proj.city}, ${proj.state || ''}` : '',
  ]
    .filter(Boolean)
    .join(', ')

  const wrapDocument = (
    content: string,
    docTitle: string,
    projectName: string,
    projectAddress: string,
    gcData: Record<string, string | number | null | undefined>,
    preparedDate: string,
  ): string => {
    const gcName = (gcData.company_name as string) || '[Your Company Name]'
    const gcAddrLine = [
      gcData.company_address,
      gcData.company_city
        ? `${gcData.company_city}, ${gcData.company_state || ''} ${gcData.company_zip || ''}`.trim()
        : '',
    ]
      .filter(Boolean)
      .join(' · ')
    const gcPhoneLine = (gcData.company_phone as string) || ''
    const gcLicenseLine = gcData.license_number
      ? `Lic. ${gcData.license_number}`
      : ''
    const gcContactLine = gcData.signature_name
      ? `${gcData.signature_name}${gcData.signature_title ? `, ${gcData.signature_title}` : ''}`
      : ''
    const isProfileComplete = !!(
      gcData.company_name && gcData.company_address
    )
    const metaLine = [gcAddrLine, gcPhoneLine, gcLicenseLine, gcContactLine]
      .filter(Boolean)
      .map((s) => esc(String(s)))
      .join(' &nbsp;·&nbsp; ')

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${esc(docTitle)} — ${esc(projectName)}</title>
  <style>
    @page { size: letter portrait; margin: 0.75in; }
    @media print {
      .no-print { display:none!important; }
      body { margin:0; padding:0; }
      h2, h3 { page-break-after: avoid; }
      table { page-break-inside: avoid; }
    }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Arial',Helvetica,sans-serif; font-size:10.5pt; color:#111; line-height:1.55; background:#fff; }

    .letterhead {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
      padding: 18px 28px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
    }
    .lh-company { font-size: 16pt; font-weight: 900; letter-spacing: -0.02em; color: #fff; }
    .lh-details { font-size: 8pt; color: rgba(255,255,255,.55); margin-top: 4px; line-height: 1.6; }
    .lh-right { text-align: right; font-size: 8.5pt; color: rgba(255,255,255,.7); line-height: 1.7; flex-shrink: 0; }
    .lh-right strong { color: #F0C040; font-size: 9pt; }

    .gold-bar { height: 4px; background: linear-gradient(90deg, #D4A017, #F0C040, #D4A017); }

    .doc-title-bar {
      background: #f7f8fa;
      border-bottom: 1px solid #e0e0e0;
      padding: 12px 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .doc-title { font-size: 12.5pt; font-weight: 900; color: #1a1a2e; text-transform: uppercase; letter-spacing: 0.04em; }
    .doc-project { font-size: 9pt; color: #666; margin-top: 2px; }
    .doc-meta { text-align: right; font-size: 8pt; color: #888; line-height: 1.6; }

    .profile-notice {
      background: #fffbf0;
      border-left: 4px solid #F0C040;
      padding: 8px 14px;
      margin: 10px 28px;
      font-size: 8.5pt;
      color: #7a6000;
    }

    .content { padding: 20px 28px 60px; }
    h1 { font-size: 12pt; font-weight: bold; color: #1a1a2e; margin: 18px 0 5px; }
    h2 { font-size: 11pt; font-weight: bold; color: #1a1a2e; margin: 14px 0 4px; border-bottom: 2px solid #D4A017; padding-bottom: 3px; }
    h3 { font-size: 10.5pt; font-weight: bold; color: #333; margin: 10px 0 3px; }
    p { margin-bottom: 8px; }
    ul, ol { margin: 4px 0 10px 20px; }
    li { margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 9.5pt; }
    th { background: #1a1a2e; color: #fff; padding: 7px 10px; text-align: left; font-weight: bold; font-size: 8.5pt; }
    td { padding: 5px 10px; border: 1px solid #ddd; vertical-align: top; }
    tr:nth-child(even) td { background: #f8f9fa; }
    .highlight { background: #FFF9E6; border-left: 4px solid #D4A017; padding: 8px 12px; margin: 8px 0; border-radius: 0 4px 4px 0; }
    .callout { background: #f0f7ff; border-left: 4px solid #4299E1; padding: 8px 12px; margin: 8px 0; border-radius: 0 4px 4px 0; }
    .sig-block { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 36px; padding-top: 16px; border-top: 1px solid #ccc; }
    .sig-line { border-bottom: 1px solid #333; height: 34px; margin-bottom: 4px; }
    .sig-label { font-size: 8pt; color: #666; }

    .print-btn {
      position: fixed; top: 20px; right: 20px;
      background: linear-gradient(135deg, #D4A017, #F0C040);
      color: #000; border: none;
      padding: 10px 22px; font-size: 13px; font-weight: 900;
      cursor: pointer; border-radius: 8px;
      box-shadow: 0 4px 16px rgba(212,160,23,.4);
      z-index: 9999; transition: all 0.15s;
    }
    .print-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(212,160,23,.5); }

    .page-footer {
      position: fixed; bottom: 0.4in; left: 0.75in; right: 0.75in;
      font-size: 7.5pt; color: #aaa;
      border-top: 1px solid #e0e0e0;
      padding-top: 4px;
      display: flex; justify-content: space-between;
    }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save PDF</button>

  <div class="letterhead">
    <div>
      <div class="lh-company">${esc(gcName)}</div>
      <div class="lh-details">${metaLine}</div>
    </div>
    <div class="lh-right">
      <strong>BID PACKAGE</strong><br>
      ${esc(projectName)}<br>
      ${projectAddress ? `${esc(projectAddress)}<br>` : ''}
      Prepared: ${esc(preparedDate)}
    </div>
  </div>
  <div class="gold-bar"></div>

  <div class="doc-title-bar">
    <div>
      <div class="doc-title">${esc(docTitle)}</div>
      <div class="doc-project">${esc(projectName)}</div>
    </div>
    <div class="doc-meta">CONFIDENTIAL<br>Generated by Sage AI</div>
  </div>

  ${
    !isProfileComplete
      ? `
  <div class="profile-notice no-print">
    ⚠️ <strong>Complete your company profile</strong> to add your company name, address, and license number to all documents.
    Go to Settings → Company.
  </div>`
      : ''
  }

  <div class="content">
    ${content}
  </div>

  <div class="page-footer no-print">
    <span>${esc(gcName)} · ${esc(projectName)}</span>
    <span>${esc(docTitle)} · Sage AI · ${esc(preparedDate)} · CONFIDENTIAL</span>
  </div>
</body>
</html>`
  }

  const savedDocs: Array<{
    packageId: string
    packageName: string
    documents: string[]
  }> = []

  for (const pkg of pkgs) {
    const pkgDocs: string[] = []
    const jacketSections: Record<string, string> = {}

    for (const doc of results) {
      if (!doc.success || !doc.content) continue

      const fullHtml = wrapDocument(
        doc.content,
        doc.title,
        projName,
        projAddressLine,
        gc as Record<string, string | number | null | undefined>,
        today,
      )

      jacketSections[doc.id] = fullHtml
      pkgDocs.push(doc.title)
    }

    const docKeyCount = Object.keys(jacketSections).length
    console.log(
      '[JACKET] About to save — package:',
      pkg.id,
      'name:',
      pkg.name,
      'doc count:',
      docKeyCount,
      'keys:',
      Object.keys(jacketSections).join(','),
    )

    if (docKeyCount === 0) {
      console.error(
        '[JACKET] SKIP save for package',
        pkg.id,
        '— jacketSections is empty. Not overwriting existing data.',
      )
      continue
    }

    const { error: updateError } = await supabase
      .from('bid_packages')
      .update({
        jacket_sections: jacketSections,
        jacket_generated_at: new Date().toISOString(),
        jacket_version: (Number(pkg.jacket_version) || 0) + 1,
        ai_generated: true,
        ai_generated_at: new Date().toISOString(),
      })
      .eq('id', pkg.id)
      .eq('tenant_id', tenantId)

    if (updateError) {
      console.error(
        '[JACKET] DB update failed for package',
        pkg.id,
        ':',
        updateError.message,
      )
    } else {
      console.log(
        '[JACKET] Saved',
        docKeyCount,
        'documents to package',
        pkg.id,
      )
    }

    if (Object.keys(jacketSections).length > 0) {
      const docRecords = Object.keys(jacketSections).map((docId) => ({
        tenant_id: tenantId,
        project_id: projectId,
        doc_type: `bid_jacket_${docId}`,
        status: 'generated',
        created_by: 'sage_ai',
        ai_model: 'claude-sonnet-4-20250514',
        source_type: 'bid_package',
        source_id: pkg.id,
        title: `${docId.replace(/_/g, ' ')} — ${pkg.name}`,
        data_snapshot: {
          bid_package_id: pkg.id,
          doc_id: docId,
          package_name: pkg.name,
          generated_at: new Date().toISOString(),
          gc_company: gcName,
        },
      }))
      const { error: gdErr } = await supabase
        .from('generated_documents')
        .insert(docRecords)
      if (gdErr) {
        console.error(
          '[JACKET] generated_documents insert failed:',
          gdErr.message,
        )
      } else {
        console.log(
          '[JACKET] Logged',
          docRecords.length,
          'docs to generated_documents',
        )
      }
    }

    savedDocs.push({
      packageId: pkg.id as string,
      packageName: pkg.name as string,
      documents: pkgDocs,
    })
  }

  await supabase
    .from('takeoffs')
    .update({
      orchestration_results: {
        ...(t.orchestration_results || {}),
        jacket_generated: true,
        jacket_doc_count: successCount,
        jacket_generated_at: new Date().toISOString(),
      },
    })
    .eq('id', takeoffId)
    .eq('tenant_id', tenantId)

  return NextResponse.json({
    success: true,
    docs_generated: successCount,
    docs_failed: results.length - successCount,
    packages_updated: savedDocs.length,
    packages: savedDocs,
    failed: results
      .filter((r) => !r.success)
      .map((r) => ({ id: r.id, error: r.error })),
  })
}
