import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';
import { getAuthenticatedSagePrompt, SageContext } from '@/lib/sage-prompts';

const client = new Anthropic();

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 3_600_000 });
    return true;
  }
  if (entry.count >= 150) return false;
  entry.count++;
  return true;
}

// ── Tool definitions ────────────────────────────────────────────────────────
const SAGE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'calculate_pay_app',
    description: 'Calculate a pay application: retainage held, net payment due, total billed to date. Use when user asks about billing amounts, how much they can bill, or what is owed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contract_amount: { type: 'number', description: 'Total contract value in dollars' },
        percent_complete: { type: 'number', description: 'Percent complete (0-100)' },
        retainage_rate: { type: 'number', description: 'Retainage percentage (default 10)' },
        previous_billings: { type: 'number', description: 'Total previously billed and paid' },
        stored_materials: { type: 'number', description: 'Value of stored materials to include (default 0)' },
      },
      required: ['contract_amount', 'percent_complete'],
    },
  },
  {
    name: 'calculate_lien_deadline',
    description: 'Calculate lien filing deadline and preliminary notice deadline based on state and project dates. Use when user asks about lien rights, lien deadlines, or when they need to file.',
    input_schema: {
      type: 'object' as const,
      properties: {
        state: { type: 'string', description: 'Two-letter state code (e.g., AZ, CA, TX, FL)' },
        first_furnishing_date: { type: 'string', description: 'Date first labor/materials furnished (ISO format YYYY-MM-DD)' },
        substantial_completion_date: { type: 'string', description: 'Date of substantial completion if known (ISO format)' },
        last_furnishing_date: { type: 'string', description: 'Date of last labor/materials furnished if known (ISO format)' },
      },
      required: ['state'],
    },
  },
  {
    name: 'draft_rfi',
    description: 'Draft a professional RFI (Request for Information) document. Use when user asks to create, write, or draft an RFI.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_name: { type: 'string', description: 'Name of the project' },
        rfi_number: { type: 'string', description: 'RFI number (e.g., RFI-047)' },
        subject: { type: 'string', description: 'Brief subject line for the RFI' },
        description: { type: 'string', description: 'Detailed description of the question or clarification needed' },
        drawing_references: { type: 'string', description: 'Relevant drawing numbers or spec sections' },
        requested_response_date: { type: 'string', description: 'Date response is needed by' },
        submitted_by: { type: 'string', description: 'Person submitting the RFI' },
      },
      required: ['project_name', 'subject', 'description'],
    },
  },
  {
    name: 'draft_change_order_request',
    description: 'Draft a professional Change Order Request (COR) or Potential Change Order (PCO). Use when user wants to write a change order request, claim additional compensation, or document a scope change.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_name: { type: 'string', description: 'Name of the project' },
        cor_number: { type: 'string', description: 'COR number (e.g., COR-012)' },
        subject: { type: 'string', description: 'Brief description of the change' },
        reason: { type: 'string', description: 'Why this is a change: owner direction, differing site condition, RFI response, design error, etc.' },
        cost_impact: { type: 'number', description: 'Dollar amount of cost impact' },
        time_impact_days: { type: 'number', description: 'Number of days of schedule impact' },
        labor_hours: { type: 'number', description: 'Additional labor hours required' },
        materials_cost: { type: 'number', description: 'Additional materials cost' },
        subcontractor_cost: { type: 'number', description: 'Additional subcontractor cost' },
        markup_percent: { type: 'number', description: 'Overhead and profit markup percentage (default 15)' },
      },
      required: ['project_name', 'subject', 'reason'],
    },
  },
  {
    name: 'draft_daily_log',
    description: 'Draft a professional daily construction log entry. Use when user wants to create, write, or fill out a daily log.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_name: { type: 'string', description: 'Name of the project' },
        date: { type: 'string', description: 'Date of the log entry' },
        weather: { type: 'string', description: 'Weather conditions (temperature, precipitation, wind)' },
        crew_count: { type: 'number', description: 'Total number of workers on site' },
        work_performed: { type: 'string', description: 'Description of work performed today' },
        equipment_on_site: { type: 'string', description: 'Equipment present on site' },
        materials_received: { type: 'string', description: 'Materials delivered today' },
        visitors: { type: 'string', description: 'Owner, architect, inspector visits' },
        issues_delays: { type: 'string', description: 'Any issues, delays, or safety incidents' },
        superintendent: { type: 'string', description: 'Name of superintendent signing off' },
      },
      required: ['project_name', 'date'],
    },
  },
  {
    name: 'draft_lien_waiver',
    description: 'Draft a lien waiver document (conditional or unconditional, progress or final). Use when user needs to create a lien waiver.',
    input_schema: {
      type: 'object' as const,
      properties: {
        waiver_type: { type: 'string', enum: ['conditional_progress', 'unconditional_progress', 'conditional_final', 'unconditional_final'], description: 'Type of lien waiver' },
        state: { type: 'string', description: 'State where project is located' },
        claimant_name: { type: 'string', description: 'Name of contractor/sub signing the waiver' },
        project_name: { type: 'string', description: 'Name of the project' },
        owner_name: { type: 'string', description: 'Name of the property owner' },
        through_date: { type: 'string', description: 'Date through which the waiver covers (for progress waivers)' },
        payment_amount: { type: 'number', description: 'Amount of payment being received' },
        exceptions: { type: 'string', description: 'Any amounts specifically excepted from this waiver' },
      },
      required: ['waiver_type', 'state', 'claimant_name', 'project_name', 'payment_amount'],
    },
  },
  {
    name: 'calculate_labor_burden',
    description: 'Calculate total loaded labor cost including all burden (taxes, insurance, benefits). Use when user asks about labor costs, loaded rates, or crew cost calculations.',
    input_schema: {
      type: 'object' as const,
      properties: {
        base_hourly_rate: { type: 'number', description: 'Base hourly wage rate' },
        hours: { type: 'number', description: 'Number of hours' },
        fica_rate: { type: 'number', description: 'FICA rate (default 7.65)' },
        futa_suta_rate: { type: 'number', description: 'FUTA+SUTA combined rate (default 3.5)' },
        wc_rate: { type: 'number', description: 'Workers comp rate per $100 payroll (default 8.5 for general construction)' },
        gl_rate: { type: 'number', description: 'GL allocation rate per $100 payroll (default 2.5)' },
        benefits_per_hour: { type: 'number', description: 'Union or company benefits per hour (default 0)' },
        num_workers: { type: 'number', description: 'Number of workers (default 1)' },
      },
      required: ['base_hourly_rate', 'hours'],
    },
  },
  {
    name: 'compare_procore_savings',
    description: 'Calculate how much a contractor would save by switching from Procore (or other competitor) to Saguaro. Use when asked about cost comparison or savings.',
    input_schema: {
      type: 'object' as const,
      properties: {
        current_software: { type: 'string', description: 'Name of current software (Procore, Buildertrend, etc.)' },
        current_monthly_cost: { type: 'number', description: 'Current monthly software spend' },
        team_size: { type: 'number', description: 'Number of users/seats' },
        saguaro_plan: { type: 'string', enum: ['starter', 'professional'], description: 'Which Saguaro plan to compare against' },
      },
      required: ['current_monthly_cost'],
    },
  },
  {
    name: 'draft_preliminary_notice',
    description: 'Draft a preliminary lien notice / Notice to Owner for a specific state. Use when a contractor or sub needs to protect their lien rights at the start of a project.',
    input_schema: {
      type: 'object' as const,
      properties: {
        state: { type: 'string', description: 'Two-letter state code' },
        claimant_name: { type: 'string', description: 'Name of contractor or subcontractor sending notice' },
        claimant_address: { type: 'string', description: 'Address of claimant' },
        owner_name: { type: 'string', description: 'Property owner name' },
        owner_address: { type: 'string', description: 'Property owner address' },
        gc_name: { type: 'string', description: 'General contractor name' },
        gc_address: { type: 'string', description: 'General contractor address' },
        project_name: { type: 'string', description: 'Project name or description' },
        project_address: { type: 'string', description: 'Project street address' },
        work_description: { type: 'string', description: 'Description of labor/materials being furnished' },
        first_furnishing_date: { type: 'string', description: 'Date work/materials first furnished' },
        estimated_price: { type: 'number', description: 'Estimated price of labor/materials' },
      },
      required: ['state', 'claimant_name', 'owner_name', 'project_name', 'work_description'],
    },
  },
  {
    name: 'calculate_project_cash_flow',
    description: 'Project monthly cash flow S-curve for a construction project. Shows monthly spend, billing, and cumulative cash position. Use when asked about cash flow, project financing, or working capital needs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contract_amount: { type: 'number', description: 'Total contract value' },
        duration_months: { type: 'number', description: 'Project duration in months' },
        retainage_rate: { type: 'number', description: 'Retainage percentage (default 10)' },
        payment_terms_days: { type: 'number', description: 'Owner payment terms in days (default 30)' },
        mobilization_cost: { type: 'number', description: 'Upfront mobilization cost (default 5% of contract)' },
        overhead_monthly: { type: 'number', description: 'Fixed monthly overhead/general conditions' },
      },
      required: ['contract_amount', 'duration_months'],
    },
  },
  {
    name: 'draft_notice_of_claim',
    description: 'Draft a formal Notice of Claim or Notice of Potential Claim letter. Use when contractor needs to formally notify owner/GC of a claim for additional time or money.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_name: { type: 'string', description: 'Project name' },
        claimant_name: { type: 'string', description: 'Contractor making the claim' },
        recipient_name: { type: 'string', description: 'Owner or GC receiving the notice' },
        claim_basis: { type: 'string', description: 'Basis for the claim: owner delay, design error, differing site condition, directed change, etc.' },
        event_description: { type: 'string', description: 'Description of the event or condition giving rise to the claim' },
        event_date: { type: 'string', description: 'Date the event/condition was first discovered' },
        estimated_cost_impact: { type: 'number', description: 'Estimated additional cost (if known)' },
        estimated_time_impact: { type: 'number', description: 'Estimated schedule impact in days (if known)' },
        contract_clause: { type: 'string', description: 'Relevant contract clause (e.g., A201 Article 15, or specific clause number)' },
      },
      required: ['project_name', 'claimant_name', 'recipient_name', 'claim_basis', 'event_description'],
    },
  },
  {
    name: 'estimate_project_cost',
    description: 'Generate a rough order of magnitude (ROM) cost estimate for a construction project based on building type and size. Use when asked for a quick budget estimate or feasibility number.',
    input_schema: {
      type: 'object' as const,
      properties: {
        building_type: { type: 'string', description: 'Type of building: office, retail, warehouse, multifamily, school, hospital, restaurant, hotel, industrial, senior_living, church, parking_garage' },
        square_footage: { type: 'number', description: 'Gross square footage of building' },
        stories: { type: 'number', description: 'Number of stories (default 1)' },
        location_factor: { type: 'string', description: 'Location cost factor: low (rural midwest), medium (national average), high (coastal/major city), very_high (NYC/SF/Hawaii)' },
        construction_type: { type: 'string', description: 'Construction type: wood_frame, steel_frame, concrete, tilt_up, masonry' },
        quality_level: { type: 'string', description: 'Quality level: economy, standard, premium, luxury' },
      },
      required: ['building_type', 'square_footage'],
    },
  },
  {
    name: 'draft_transmittal',
    description: 'Draft a professional document transmittal letter. Use when submitting drawings, submittals, shop drawings, O&Ms, or any documents to an owner, architect, or GC.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_name: { type: 'string', description: 'Project name' },
        transmittal_number: { type: 'string', description: 'Transmittal number' },
        from_company: { type: 'string', description: 'Sending company name' },
        to_company: { type: 'string', description: 'Receiving company name' },
        to_contact: { type: 'string', description: 'Contact person at receiving company' },
        subject: { type: 'string', description: 'Subject/description of what is being transmitted' },
        documents: { type: 'string', description: 'List of documents being transmitted (names, dates, revision numbers)' },
        action_required: { type: 'string', enum: ['for_approval', 'for_review', 'for_record', 'for_construction', 'as_requested', 'returned_for_correction'], description: 'Action required from recipient' },
        notes: { type: 'string', description: 'Any special notes or instructions' },
      },
      required: ['project_name', 'from_company', 'to_company', 'subject', 'documents'],
    },
  },
  {
    name: 'draft_closeout_checklist',
    description: 'Generate a comprehensive project closeout checklist. Use when a project is approaching substantial completion and the team needs to track closeout deliverables.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_name: { type: 'string', description: 'Project name' },
        project_type: { type: 'string', description: 'Type: commercial, residential, public_works, federal, healthcare, school' },
        has_federal_funding: { type: 'boolean', description: 'Whether project has federal/prevailing wage requirements' },
        has_bonding: { type: 'boolean', description: 'Whether project required performance/payment bonds' },
        contract_type: { type: 'string', description: 'Contract type: lump_sum, cost_plus, gmp, design_build' },
        has_commissioning: { type: 'boolean', description: 'Whether MEP systems require commissioning' },
      },
      required: ['project_name'],
    },
  },
  {
    name: 'analyze_wip_schedule',
    description: 'Analyze work-in-progress (WIP) schedule to identify over/under-billing, job cost variance, and backlog health. Use when asked about WIP, overbilling, underbilling, or job cost status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_name: { type: 'string', description: 'Name of the project' },
        contract_amount: { type: 'number', description: 'Total contract value in dollars' },
        percent_complete: { type: 'number', description: 'Percent complete (0-100)' },
        billed_to_date: { type: 'number', description: 'Total amount billed to date' },
        cost_to_date: { type: 'number', description: 'Actual cost incurred to date' },
        estimated_cost_at_completion: { type: 'number', description: 'Total estimated cost to complete the project' },
        contract_duration_months: { type: 'number', description: 'Total contract duration in months (optional)' },
        months_elapsed: { type: 'number', description: 'Number of months elapsed so far (optional)' },
      },
      required: ['project_name', 'contract_amount', 'percent_complete', 'billed_to_date', 'cost_to_date', 'estimated_cost_at_completion'],
    },
  },
  {
    name: 'calculate_bonding_capacity',
    description: 'Estimate contractor\'s bonding capacity based on financial data. Use when asked about bonding, bond capacity, maximum project size, or how much work they can bond.',
    input_schema: {
      type: 'object' as const,
      properties: {
        working_capital: { type: 'number', description: 'Current assets minus current liabilities' },
        net_worth: { type: 'number', description: 'Total equity on the balance sheet' },
        current_backlog: { type: 'number', description: 'Total value of work currently under contract' },
        largest_completed_project: { type: 'number', description: 'Dollar value of the largest single project ever completed' },
        years_in_business: { type: 'number', description: 'Number of years the company has been in business (optional)' },
        emod: { type: 'number', description: 'Experience modification rate (optional, default 1.0)' },
      },
      required: ['working_capital', 'net_worth', 'current_backlog', 'largest_completed_project'],
    },
  },
  {
    name: 'draft_subcontract_scope',
    description: 'Draft a detailed subcontract scope of work section for a specific trade. Use when creating subcontract scope exhibits, writing trade scopes, or defining sub responsibilities.',
    input_schema: {
      type: 'object' as const,
      properties: {
        trade: { type: 'string', description: 'Trade name (e.g., electrical, plumbing, HVAC, framing, drywall, concrete, roofing, painting)' },
        project_name: { type: 'string', description: 'Name of the project' },
        project_type: { type: 'string', description: 'Project type (commercial, residential, healthcare, etc.) — optional' },
        special_requirements: { type: 'string', description: 'Any specific requirements to include — optional' },
        contract_amount: { type: 'number', description: 'Subcontract dollar amount — optional' },
      },
      required: ['trade', 'project_name'],
    },
  },
  {
    name: 'calculate_bid_markup',
    description: 'Calculate optimal bid markup and analyze margin at different price points. Use when preparing a bid, analyzing if a job is priced right, or deciding markup strategy.',
    input_schema: {
      type: 'object' as const,
      properties: {
        direct_cost: { type: 'number', description: 'Sum of all direct costs: labor + materials + subs + equipment' },
        home_office_overhead_rate: { type: 'number', description: 'Home office overhead percentage (default 12)' },
        target_profit_rate: { type: 'number', description: 'Target net profit percentage (default 5)' },
        bond_required: { type: 'boolean', description: 'Whether a performance/payment bond is required — optional' },
        insurance_rate: { type: 'number', description: 'Insurance rate as percentage of direct cost (default 1.5)' },
        contingency_rate: { type: 'number', description: 'Contingency as percentage of direct cost (default 3)' },
        competitive_pressure: { type: 'string', description: 'Market competitiveness: low, medium, high, very_high — optional' },
      },
      required: ['direct_cost'],
    },
  },
  {
    name: 'analyze_project_risk',
    description: 'Generate a project risk matrix with probability/impact scores and mitigation strategies. Use when starting a project, reviewing a difficult bid, or doing a project health check.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_type: { type: 'string', description: 'Project type: commercial, residential, healthcare, federal, heavy_civil, etc.' },
        contract_type: { type: 'string', description: 'Contract type: lump_sum, gmp, cost_plus, design_build, etc.' },
        contract_amount: { type: 'number', description: 'Total contract value' },
        duration_months: { type: 'number', description: 'Project duration in months' },
        has_design_risk: { type: 'boolean', description: 'Whether contractor carries design risk — optional' },
        is_occupied_facility: { type: 'boolean', description: 'Whether work is in an occupied building — optional' },
        has_hazmat: { type: 'boolean', description: 'Whether project involves hazardous materials — optional' },
        is_remote_location: { type: 'boolean', description: 'Whether project is in a remote location — optional' },
        is_union: { type: 'boolean', description: 'Whether project is subject to union labor agreements — optional' },
      },
      required: ['project_type', 'contract_type', 'contract_amount', 'duration_months'],
    },
  },
  {
    name: 'calculate_equipment_roi',
    description: 'Calculate ROI on owning vs. renting equipment. Use when deciding whether to buy equipment, calculating equipment rates, or analyzing fleet ownership costs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        equipment_name: { type: 'string', description: 'Name or description of the equipment' },
        purchase_price: { type: 'number', description: 'Purchase price of the equipment' },
        useful_life_years: { type: 'number', description: 'Expected useful life in years (default 7)' },
        annual_utilization_hours: { type: 'number', description: 'Estimated hours per year the equipment will be used' },
        rental_rate_per_hour: { type: 'number', description: 'Current market rental rate per hour' },
        operating_cost_per_hour: { type: 'number', description: 'Fuel and maintenance estimate per hour — optional' },
        salvage_value: { type: 'number', description: 'Expected salvage value at end of useful life — optional (default 20% of purchase price)' },
        financing_rate: { type: 'number', description: 'Annual financing interest rate as percentage — optional (default 6)' },
      },
      required: ['equipment_name', 'purchase_price', 'annual_utilization_hours', 'rental_rate_per_hour'],
    },
  },
  {
    name: 'draft_demand_letter',
    description: 'Draft a formal demand letter for unpaid invoices, retainage, or contract balance. Use when a client is not paying, retainage is overdue, or final payment has not been received.',
    input_schema: {
      type: 'object' as const,
      properties: {
        claimant_name: { type: 'string', description: 'Name of the contractor or company sending the letter' },
        debtor_name: { type: 'string', description: 'Name of the party who owes money' },
        project_name: { type: 'string', description: 'Name of the project' },
        amount_owed: { type: 'number', description: 'Total dollar amount owed' },
        invoice_numbers: { type: 'string', description: 'Comma-separated invoice or pay application numbers — optional' },
        days_outstanding: { type: 'number', description: 'Number of days the amount has been outstanding' },
        state: { type: 'string', description: 'State where project is located (for prompt payment statute reference) — optional' },
        contract_clause: { type: 'string', description: 'Relevant contract payment clause — optional' },
        prior_communications: { type: 'string', description: 'Brief description of prior attempts to collect — optional' },
      },
      required: ['claimant_name', 'debtor_name', 'project_name', 'amount_owed', 'days_outstanding'],
    },
  },
  {
    name: 'calculate_overhead_rate',
    description: 'Calculate company overhead rate and break-even revenue. Use when asked about overhead, rates to charge, pricing strategy, or company financial health.',
    input_schema: {
      type: 'object' as const,
      properties: {
        annual_revenue: { type: 'number', description: 'Total annual revenue' },
        direct_labor: { type: 'number', description: 'Total annual direct labor cost on jobs' },
        direct_materials: { type: 'number', description: 'Total annual materials cost' },
        direct_subcontractors: { type: 'number', description: 'Total annual subcontractor payments' },
        total_annual_overhead: { type: 'number', description: 'Total home office costs: rent, salaries, insurance, vehicles, etc.' },
        target_net_profit_percent: { type: 'number', description: 'Target net profit percentage (default 5)' },
      },
      required: ['annual_revenue', 'direct_labor', 'direct_materials', 'direct_subcontractors', 'total_annual_overhead'],
    },
  },
  {
    name: 'generate_schedule_recovery',
    description: 'Generate a schedule recovery plan when a project is behind schedule. Use when a project is delayed and needs a path back to the original completion date.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_name: { type: 'string', description: 'Name of the project' },
        original_completion_date: { type: 'string', description: 'Original contract completion date (ISO format YYYY-MM-DD)' },
        current_projected_completion: { type: 'string', description: 'Current projected completion date (ISO format YYYY-MM-DD)' },
        delay_cause: { type: 'string', description: 'Cause of delay: owner delay, weather, design changes, labor shortage, material delay, etc.' },
        contract_amount: { type: 'number', description: 'Total contract value' },
        remaining_work_description: { type: 'string', description: 'Brief description of remaining work' },
        available_budget_for_acceleration: { type: 'number', description: 'Budget available for acceleration measures — optional' },
      },
      required: ['project_name', 'original_completion_date', 'current_projected_completion', 'delay_cause', 'contract_amount', 'remaining_work_description'],
    },
  },
  {
    name: 'draft_meeting_minutes',
    description: 'Draft professional construction meeting minutes (OAC, preconstruction, progress meeting, subcontractor coordination). Use when user wants to create meeting minutes or recap a meeting.',
    input_schema: {
      type: 'object' as const,
      properties: {
        meeting_type: { type: 'string', description: 'Meeting type: oac, preconstruction, progress, subcontractor_coordination, safety, design' },
        project_name: { type: 'string', description: 'Name of the project' },
        meeting_date: { type: 'string', description: 'Date of the meeting' },
        location: { type: 'string', description: 'Meeting location — optional' },
        attendees: { type: 'string', description: 'Comma-separated list of attendee names and/or companies' },
        agenda_items: { type: 'string', description: 'Topics discussed during the meeting' },
        action_items: { type: 'string', description: 'Decisions made and follow-up items with responsible parties' },
        next_meeting_date: { type: 'string', description: 'Date of next scheduled meeting — optional' },
      },
      required: ['meeting_type', 'project_name', 'meeting_date', 'attendees', 'agenda_items', 'action_items'],
    },
  },
];

// ── Tool execution ────────────────────────────────────────────────────────
function executeTool(name: string, input: Record<string, unknown>): string {
  switch (name) {

    case 'calculate_pay_app': {
      const contract = Number(input.contract_amount);
      const pct = Number(input.percent_complete) / 100;
      const ret = Number(input.retainage_rate ?? 10) / 100;
      const prev = Number(input.previous_billings ?? 0);
      const stored = Number(input.stored_materials ?? 0);
      const earnedValue = contract * pct;
      const thisApplication = earnedValue - prev + stored;
      const retainageThisApp = thisApplication * ret;
      const retainageTotal = earnedValue * ret;
      const netDue = thisApplication - retainageThisApp;
      return JSON.stringify({
        contract_amount: contract.toFixed(2),
        percent_complete: `${(pct * 100).toFixed(1)}%`,
        earned_value: earnedValue.toFixed(2),
        previous_billings: prev.toFixed(2),
        stored_materials: stored.toFixed(2),
        this_application_gross: thisApplication.toFixed(2),
        retainage_held_this_app: retainageThisApp.toFixed(2),
        retainage_total: retainageTotal.toFixed(2),
        net_payment_due: netDue.toFixed(2),
        total_to_date: (earnedValue + stored).toFixed(2),
      });
    }

    case 'calculate_lien_deadline': {
      const state = String(input.state).toUpperCase();
      const today = new Date();
      const firstDate = input.first_furnishing_date ? new Date(String(input.first_furnishing_date)) : today;
      const lastDate = input.last_furnishing_date ? new Date(String(input.last_furnishing_date)) : today;
      const scDate = input.substantial_completion_date ? new Date(String(input.substantial_completion_date)) : null;

      const addDays = (d: Date, days: number) => {
        const r = new Date(d);
        r.setDate(r.getDate() + days);
        return r.toDateString();
      };

      const deadlines: Record<string, { prelim_notice: string; lien_filing: string; enforce_by: string; notes: string }> = {
        AZ: { prelim_notice: addDays(firstDate, 20), lien_filing: scDate ? addDays(scDate, 120) : addDays(lastDate, 120), enforce_by: scDate ? addDays(scDate, 300) : addDays(lastDate, 300), notes: 'AZ: Prelim notice within 20 days of first furnishing. Lien within 120 days of substantial completion. Enforce within 6 months of filing.' },
        CA: { prelim_notice: addDays(firstDate, 20), lien_filing: addDays(lastDate, 90), enforce_by: addDays(lastDate, 180), notes: 'CA: 20-day prelim required. Mechanics lien within 90 days of completion/cessation. Enforce within 90 days of filing.' },
        TX: { prelim_notice: addDays(firstDate, 45), lien_filing: addDays(lastDate, 120), enforce_by: addDays(lastDate, 240), notes: 'TX: Complex monthly notice system. Send notice by 15th of 2nd month following each unpaid month. Lien by 15th of 4th month. Consult TX attorney.' },
        FL: { prelim_notice: addDays(firstDate, 45), lien_filing: addDays(lastDate, 90), enforce_by: addDays(lastDate, 455), notes: 'FL: Notice to Owner within 45 days of first furnishing. Lien within 90 days. Enforce within 1 year.' },
        NV: { prelim_notice: addDays(firstDate, 31), lien_filing: addDays(lastDate, 90), enforce_by: addDays(lastDate, 270), notes: 'NV: Prelim notice within 31 days. Lien within 90 days. Enforce within 6 months.' },
        CO: { prelim_notice: addDays(firstDate, 0), lien_filing: addDays(lastDate, 120), enforce_by: addDays(lastDate, 300), notes: 'CO: No prelim notice for GC. Subs must serve Notice of Intent 10 days before filing. Lien within 4 months (2 months residential).' },
        WA: { prelim_notice: addDays(firstDate, 60), lien_filing: addDays(lastDate, 90), enforce_by: addDays(lastDate, 330), notes: 'WA: Prelim notice within 60 days. Lien within 90 days. Enforce within 8 months of filing.' },
        OR: { prelim_notice: addDays(firstDate, 8), lien_filing: addDays(lastDate, 75), enforce_by: addDays(lastDate, 285), notes: 'OR: Notice of Right to Lien within 8 days of first furnishing. Lien within 75 days. Enforce within 120 days of filing.' },
        GA: { prelim_notice: addDays(firstDate, 30), lien_filing: addDays(lastDate, 90), enforce_by: addDays(lastDate, 365), notes: 'GA: Preliminary Notice within 30 days. Lien within 90 days of last furnishing. Enforce within 1 year.' },
        NC: { prelim_notice: addDays(firstDate, 0), lien_filing: addDays(lastDate, 120), enforce_by: addDays(lastDate, 300), notes: 'NC: No prelim notice requirement. Lien within 120 days of last furnishing. Enforce within 180 days of filing.' },
        VA: { prelim_notice: addDays(firstDate, 0), lien_filing: addDays(lastDate, 150), enforce_by: addDays(lastDate, 270), notes: 'VA: No prelim notice. Lien within 150 days of last furnishing. Enforce within 6 months of filing.' },
        NY: { prelim_notice: addDays(firstDate, 0), lien_filing: addDays(lastDate, 120), enforce_by: addDays(lastDate, 485), notes: 'NY: No prelim notice. Lien within 8 months for private; 4 months for public. Enforce within 1 year of filing.' },
        IL: { prelim_notice: addDays(firstDate, 0), lien_filing: addDays(lastDate, 120), enforce_by: addDays(lastDate, 730), notes: 'IL: No prelim notice for direct contractors. Sub notice within 90 days. Lien within 4 months. Enforce within 2 years.' },
        PA: { prelim_notice: addDays(firstDate, 0), lien_filing: addDays(lastDate, 180), enforce_by: addDays(lastDate, 365), notes: 'PA: No prelim notice. Lien within 6 months of last furnishing. Enforce within 2 years of filing.' },
        OH: { prelim_notice: addDays(firstDate, 21), lien_filing: addDays(lastDate, 75), enforce_by: addDays(lastDate, 255), notes: 'OH: Notice of Furnishing within 21 days (subs/suppliers). Lien within 75 days of last furnishing. Enforce within 6 months.' },
        MI: { prelim_notice: addDays(firstDate, 20), lien_filing: addDays(lastDate, 90), enforce_by: addDays(lastDate, 455), notes: 'MI: Notice of Furnishing within 20 days. Lien within 90 days. Enforce within 1 year.' },
        MN: { prelim_notice: addDays(firstDate, 45), lien_filing: addDays(lastDate, 120), enforce_by: addDays(lastDate, 485), notes: 'MN: Pre-Lien Notice within 45 days. Lien within 120 days of last furnishing. Enforce within 1 year.' },
        UT: { prelim_notice: addDays(firstDate, 20), lien_filing: addDays(lastDate, 90), enforce_by: addDays(lastDate, 270), notes: 'UT: Preliminary Notice within 20 days. Lien within 90 days. Enforce within 180 days of filing.' },
        ID: { prelim_notice: addDays(firstDate, 0), lien_filing: addDays(lastDate, 90), enforce_by: addDays(lastDate, 270), notes: 'ID: No prelim notice. Lien within 90 days. Enforce within 6 months of filing.' },
        MT: { prelim_notice: addDays(firstDate, 0), lien_filing: addDays(lastDate, 90), enforce_by: addDays(lastDate, 455), notes: 'MT: No prelim notice. Lien within 90 days. Enforce within 2 years.' },
      };

      const result = deadlines[state] ?? {
        prelim_notice: 'Varies — check state law',
        lien_filing: addDays(lastDate, 90),
        enforce_by: 'Varies — check state law',
        notes: `${state}: Specific deadlines not in immediate data. Approximate lien filing deadline shown. VERIFY with a local construction attorney immediately.`,
      };

      return JSON.stringify({ state, ...result, disclaimer: 'These are estimates only. Always verify with a licensed construction attorney before relying on these dates.' });
    }

    case 'draft_rfi': {
      const num = String(input.rfi_number ?? 'RFI-XXX');
      const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      return `
═══════════════════════════════════════
REQUEST FOR INFORMATION
${num}
═══════════════════════════════════════
Project:      ${input.project_name}
RFI Number:   ${num}
Date:         ${date}
From:         ${input.submitted_by ?? '[Your Company Name]'}
To:           [Architect/Engineer Name]
${input.requested_response_date ? `Response Needed: ${input.requested_response_date}` : ''}
${input.drawing_references ? `Drawing/Spec References: ${input.drawing_references}` : ''}

SUBJECT: ${input.subject}

QUESTION / CLARIFICATION REQUESTED:
${input.description}

REASON FOR REQUEST:
This information is required to proceed with the work described above. A delay in response may impact the project schedule.

SUGGESTED RESPONSE: [Leave blank for design team to complete]

CONTRACTOR RESPONSE UPON RECEIPT:
[To be completed after receiving response]

Submitted by: ${input.submitted_by ?? '[Name/Title]'}
Date: ${date}

Note: If this RFI results in a change to the contract scope, duration, or cost, a Change Order Request will be submitted accordingly.
═══════════════════════════════════════`;
    }

    case 'draft_change_order_request': {
      const corNum = String(input.cor_number ?? 'COR-XXX');
      const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const markup = Number(input.markup_percent ?? 15) / 100;
      const labor = Number(input.labor_hours ?? 0);
      const laborCost = Number(input.labor_cost ?? 0);
      const materials = Number(input.materials_cost ?? 0);
      const subCost = Number(input.subcontractor_cost ?? 0);
      const directCost = laborCost + materials + subCost;
      const overheadProfit = directCost * markup;
      const total = input.cost_impact ? Number(input.cost_impact) : directCost + overheadProfit;
      return `
═══════════════════════════════════════
CHANGE ORDER REQUEST (COR)
${corNum}
═══════════════════════════════════════
Project:      ${input.project_name}
COR Number:   ${corNum}
Date:         ${date}

SUBJECT: ${input.subject}

BASIS FOR CHANGE:
${input.reason}

COST BREAKDOWN:
${labor ? `  Labor (${labor} hours):      $${laborCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ''}
${materials ? `  Materials:                  $${materials.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ''}
${subCost ? `  Subcontractor:              $${subCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ''}
${directCost ? `  Direct Cost Subtotal:       $${directCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ''}
${directCost ? `  Overhead & Profit (${Math.round(markup * 100)}%):   $${overheadProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ''}
  ─────────────────────────────────────
  TOTAL COST IMPACT:          $${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}

SCHEDULE IMPACT: ${input.time_impact_days ? `${input.time_impact_days} calendar days` : 'To be determined — time impact analysis in progress'}

SUPPORTING DOCUMENTATION ATTACHED:
□ Labor records / T&M tickets
□ Material invoices / quotes
□ Subcontractor proposal(s)
□ Photos / drawings

NOTICE OF RESERVATION OF RIGHTS:
Contractor reserves all rights to additional compensation and time extensions associated with this change and any concurrent impacts. This COR does not waive any rights under the contract.

Submitted by: [Contractor Name / PM Name]
Date: ${date}

OWNER/ARCHITECT RESPONSE:
□ Approved     □ Approved as Modified     □ Rejected     □ Additional Info Required

Signature: _______________________  Date: __________
═══════════════════════════════════════`;
    }

    case 'draft_daily_log': {
      const date = String(input.date ?? new Date().toLocaleDateString());
      return `
═══════════════════════════════════════
DAILY CONSTRUCTION LOG
═══════════════════════════════════════
Project:      ${input.project_name}
Date:         ${date}
Superintendent: ${input.superintendent ?? '[Name]'}

WEATHER CONDITIONS:
${input.weather ?? 'Conditions not recorded'}

CREW ON SITE: ${input.crew_count ?? 0} workers

WORK PERFORMED TODAY:
${input.work_performed ?? '[Description of work performed]'}

EQUIPMENT ON SITE:
${input.equipment_on_site ?? 'None noted'}

MATERIALS RECEIVED:
${input.materials_received ?? 'No deliveries today'}

VISITORS TO SITE:
${input.visitors ?? 'None'}

ISSUES / DELAYS / SAFETY:
${input.issues_delays ?? 'No issues to report'}

Superintendent Signature: _______________________
Date: ${date}
Time: _______

This daily log is a true and accurate record of activities on the project on the date shown.
═══════════════════════════════════════`;
    }

    case 'draft_lien_waiver': {
      const typeLabels: Record<string, string> = {
        conditional_progress: 'CONDITIONAL WAIVER AND RELEASE UPON PROGRESS PAYMENT',
        unconditional_progress: 'UNCONDITIONAL WAIVER AND RELEASE UPON PROGRESS PAYMENT',
        conditional_final: 'CONDITIONAL WAIVER AND RELEASE UPON FINAL PAYMENT',
        unconditional_final: 'UNCONDITIONAL WAIVER AND RELEASE UPON FINAL PAYMENT',
      };
      const type = String(input.waiver_type);
      const label = typeLabels[type] ?? 'LIEN WAIVER';
      const amount = Number(input.payment_amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      const isConditional = type.startsWith('conditional');
      const isFinal = type.endsWith('final');
      const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      return `
═══════════════════════════════════════
${label}
State of ${String(input.state).toUpperCase()}
═══════════════════════════════════════
Claimant: ${input.claimant_name}
Customer: ${input.owner_name ?? '[Owner/GC Name]'}
Job/Project: ${input.project_name}
${!isFinal && input.through_date ? `Through Date: ${input.through_date}` : ''}
Payment Amount: ${amount}
${input.exceptions ? `EXCEPTIONS: ${input.exceptions}` : ''}

WAIVER AND RELEASE:
${isConditional
  ? `Upon receipt by the claimant of a check from ${input.owner_name ?? 'Owner/GC'} in the sum of ${amount} payable to ${input.claimant_name} and when the check has been properly endorsed and has been paid by the bank upon which it is drawn, this document shall become effective to release and the claimant hereby releases the Owner, his successors and assigns, from any and all claims, liens or rights of lien that the claimant has on the above referenced project${isFinal ? ' through final completion' : ` through ${input.through_date ?? '[through date]'}`}.`
  : `The claimant, for and in consideration of ${amount}, and other valuable consideration, the receipt of which is hereby acknowledged, does hereby waive and release all liens, lien rights, claims or demands of any kind whatsoever which the claimant now has or might have against the above project${isFinal ? ' through final completion of the work' : ` through ${input.through_date ?? '[through date]'}`}.`
}

NOTICE: This document waives rights unconditionally and states that you have been paid for giving up those rights. It is prohibited for a person to require you to sign this document if you have not been paid the payment amount set forth above.

Claimant Signature: _______________________
Printed Name: _______________________
Title: _______________________
Date: ${date}

Notary (if required by state):
State of _________ County of _________
Subscribed and sworn before me this ___ day of __________, 20___
Notary Signature: _______________________  My Commission Expires: __________

NOTE: ${String(input.state).toUpperCase()} may have specific statutory requirements. Verify with a construction attorney.
═══════════════════════════════════════`;
    }

    case 'calculate_labor_burden': {
      const base = Number(input.base_hourly_rate);
      const hours = Number(input.hours);
      const workers = Number(input.num_workers ?? 1);
      const fica = Number(input.fica_rate ?? 7.65) / 100;
      const futaSuta = Number(input.futa_suta_rate ?? 3.5) / 100;
      const wc = Number(input.wc_rate ?? 8.5) / 100;
      const gl = Number(input.gl_rate ?? 2.5) / 100;
      const benefits = Number(input.benefits_per_hour ?? 0);
      const basePay = base * hours * workers;
      const ficaAmt = basePay * fica;
      const futaSutaAmt = basePay * futaSuta;
      const wcAmt = basePay * wc;
      const glAmt = basePay * gl;
      const benefitsAmt = benefits * hours * workers;
      const totalBurden = ficaAmt + futaSutaAmt + wcAmt + glAmt + benefitsAmt;
      const totalLoaded = basePay + totalBurden;
      const loadedRate = totalLoaded / (hours * workers);
      const burdenPct = (totalBurden / basePay * 100).toFixed(1);
      return JSON.stringify({
        base_wages: `$${basePay.toFixed(2)}`,
        fica: `$${ficaAmt.toFixed(2)}`,
        futa_suta: `$${futaSutaAmt.toFixed(2)}`,
        workers_comp: `$${wcAmt.toFixed(2)}`,
        gl_allocation: `$${glAmt.toFixed(2)}`,
        benefits: `$${benefitsAmt.toFixed(2)}`,
        total_burden: `$${totalBurden.toFixed(2)}`,
        burden_percent: `${burdenPct}%`,
        total_loaded_cost: `$${totalLoaded.toFixed(2)}`,
        loaded_hourly_rate: `$${loadedRate.toFixed(2)}/hr`,
        workers,
        hours,
      });
    }

    case 'compare_procore_savings': {
      const current = Number(input.current_monthly_cost);
      const plan = String(input.saguaro_plan ?? 'professional');
      const saguaroCost = plan === 'starter' ? 299 : 599;
      const monthlySavings = current - saguaroCost;
      const annualSavings = monthlySavings * 12;
      const threeYearSavings = annualSavings * 3;
      return JSON.stringify({
        current_software: input.current_software ?? 'Current Software',
        current_monthly: `$${current.toLocaleString()}`,
        saguaro_plan: plan.charAt(0).toUpperCase() + plan.slice(1),
        saguaro_monthly: `$${saguaroCost}`,
        monthly_savings: `$${monthlySavings.toLocaleString()}`,
        annual_savings: `$${annualSavings.toLocaleString()}`,
        three_year_savings: `$${threeYearSavings.toLocaleString()}`,
        savings_percent: `${Math.round((monthlySavings / current) * 100)}%`,
      });
    }

    case 'draft_preliminary_notice': {
      const state = String(input.state).toUpperCase();
      const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const amount = input.estimated_price ? `$${Number(input.estimated_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '[To be determined]';
      const stateTitle: Record<string, string> = {
        AZ: 'PRELIMINARY TWENTY-DAY NOTICE',
        CA: 'CALIFORNIA PRELIMINARY NOTICE (20-Day)',
        FL: 'NOTICE TO OWNER',
        TX: 'NOTICE OF CONTRACTUAL RETAINAGE / NOTICE TO CONTRACTOR',
        NV: 'NOTICE TO OWNER AND NOTICE TO LENDER',
        WA: 'NOTICE TO CUSTOMER',
        OR: 'NOTICE OF RIGHT TO LIEN',
        OH: 'NOTICE OF FURNISHING',
        MI: 'NOTICE OF FURNISHING',
        MN: 'PRE-LIEN NOTICE',
        GA: 'PRELIMINARY NOTICE',
        UT: 'PRELIMINARY NOTICE',
      };
      const title = stateTitle[state] ?? `PRELIMINARY NOTICE — STATE OF ${state}`;
      return `
═══════════════════════════════════════
${title}
State of ${state}
═══════════════════════════════════════
Date of Notice: ${date}

FROM (Claimant):
${input.claimant_name}
${input.claimant_address ?? '[Claimant Address]'}

TO (Owner):
${input.owner_name}
${input.owner_address ?? '[Owner Address]'}

${input.gc_name ? `TO (General Contractor):
${input.gc_name}
${input.gc_address ?? '[GC Address]'}` : ''}

PROJECT:
${input.project_name}
${input.project_address ?? '[Project Address]'}

NOTICE:
The undersigned is furnishing or will furnish labor, services, equipment, or materials of the following description for the improvement of the above-referenced property:

${input.work_description}

Estimated price: ${amount}
${input.first_furnishing_date ? `First date of furnishing: ${input.first_furnishing_date}` : ''}

IMPORTANT NOTICE TO PROPERTY OWNER:
Under the laws of the State of ${state}, those who work on your property or provide labor, services, equipment, or materials and are not paid have a right to enforce a lien against your property. This notice is given to preserve such rights.

${claimantNoticeText(state)}

Claimant: ${input.claimant_name}
Signature: _______________________
Title: _______________________
Date: ${date}

PROOF OF SERVICE: This notice was sent by: □ Certified Mail  □ Personal Service  □ Registered Mail
Tracking Number: _______________________
═══════════════════════════════════════`;
    }

    case 'calculate_project_cash_flow': {
      const contract = Number(input.contract_amount);
      const months = Number(input.duration_months);
      const retainage = Number(input.retainage_rate ?? 10) / 100;
      const payTerms = Number(input.payment_terms_days ?? 30);
      const mobilization = Number(input.mobilization_cost ?? contract * 0.05);
      const overhead = Number(input.overhead_monthly ?? contract * 0.08 / months);

      // S-curve distribution
      const sCurve = (m: number, total: number) => {
        const x = m / total;
        return 1 / (1 + Math.exp(-10 * (x - 0.5)));
      };

      const rows = [];
      let cumulativeCost = 0;
      let cumulativeBilled = 0;
      let cumulativeReceived = 0;

      for (let m = 1; m <= months; m++) {
        const prevCumPct = m > 1 ? sCurve(m - 1, months) : 0;
        const currCumPct = sCurve(m, months);
        const thisPeriodPct = currCumPct - prevCumPct;
        const thisCost = contract * thisPeriodPct * 0.85 + overhead + (m === 1 ? mobilization : 0);
        const thisBilled = contract * thisPeriodPct;
        const thisRetainage = thisBilled * retainage;
        const netBilled = thisBilled - thisRetainage;
        const payDelay = Math.round(payTerms / 30);
        const received: number = m > payDelay ? (rows[m - payDelay - 1]?.net_billed ?? 0) : 0;

        cumulativeCost += thisCost;
        cumulativeBilled += thisBilled;
        cumulativeReceived += received;

        rows.push({
          month: m,
          cost: Math.round(thisCost),
          billed: Math.round(thisBilled),
          net_billed: Math.round(netBilled),
          received: Math.round(received),
          cumulative_cost: Math.round(cumulativeCost),
          cumulative_received: Math.round(cumulativeReceived),
          cash_position: Math.round(cumulativeReceived - cumulativeCost),
        });
      }

      const worstCash = Math.min(...rows.map(r => r.cash_position));
      const retainageHeld = contract * retainage;
      return JSON.stringify({
        summary: {
          contract_amount: `$${contract.toLocaleString()}`,
          duration_months: months,
          total_retainage_held: `$${Math.round(retainageHeld).toLocaleString()}`,
          peak_negative_cash: `$${Math.abs(worstCash).toLocaleString()}`,
          working_capital_needed: `$${Math.abs(Math.min(worstCash, 0)).toLocaleString()}`,
          note: 'Peak working capital required to fund this project before retainage release',
        },
        monthly_detail: rows,
      });
    }

    case 'draft_notice_of_claim': {
      const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const costImpact = input.estimated_cost_impact ? `$${Number(input.estimated_cost_impact).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'To be determined — analysis ongoing';
      return `
═══════════════════════════════════════
NOTICE OF CLAIM / NOTICE OF POTENTIAL CLAIM
═══════════════════════════════════════
Date: ${date}
Project: ${input.project_name}

FROM: ${input.claimant_name}
TO:   ${input.recipient_name}

RE: Notice of Claim — ${input.claim_basis}

Dear ${input.recipient_name},

Pursuant to ${input.contract_clause ?? 'the terms of our contract and applicable law'}, ${input.claimant_name} hereby provides formal notice of a claim for additional compensation and/or time extension arising from the following:

EVENT / CONDITION:
${input.event_description}

DATE OF FIRST OCCURRENCE / DISCOVERY: ${input.event_date ?? date}

BASIS FOR CLAIM:
This event constitutes a compensable change to the contract because it: ${input.claim_basis}. This condition was not contemplated by the contract documents and/or was caused by parties or events outside the control of ${input.claimant_name}.

ESTIMATED IMPACT:
- Cost Impact: ${costImpact}
- Schedule Impact: ${input.estimated_time_impact ? `${input.estimated_time_impact} calendar days` : 'To be determined — schedule impact analysis in progress'}

RESERVATION OF RIGHTS:
${input.claimant_name} expressly reserves all rights under the contract and applicable law to claim additional compensation, time extensions, and all other relief to which it may be entitled. This notice is provided without waiver of any rights, and the full extent of the claim will be quantified and submitted upon completion of the impact analysis.

${input.claimant_name} is committed to resolving this matter expeditiously and requests immediate acknowledgment of this notice and a meeting to discuss resolution.

Respectfully submitted,

${input.claimant_name}
Signature: _______________________
Title: _______________________
Date: ${date}

NOTICE: Failure to respond to this notice within 10 business days will be deemed a denial of the claim.
═══════════════════════════════════════`;
    }

    case 'estimate_project_cost': {
      const sf = Number(input.square_footage);
      const stories = Number(input.stories ?? 1);
      const quality = String(input.quality_level ?? 'standard');
      const location = String(input.location_factor ?? 'medium');
      const type = String(input.building_type).toLowerCase();

      const baseCosts: Record<string, { low: number; mid: number; high: number }> = {
        office: { low: 150, mid: 220, high: 350 },
        retail: { low: 100, mid: 160, high: 260 },
        warehouse: { low: 50, mid: 85, high: 140 },
        multifamily: { low: 130, mid: 190, high: 300 },
        school: { low: 200, mid: 280, high: 380 },
        hospital: { low: 450, mid: 650, high: 950 },
        restaurant: { low: 200, mid: 300, high: 500 },
        hotel: { low: 180, mid: 270, high: 420 },
        industrial: { low: 60, mid: 100, high: 160 },
        senior_living: { low: 200, mid: 290, high: 400 },
        church: { low: 180, mid: 260, high: 380 },
        parking_garage: { low: 40, mid: 65, high: 100 },
      };

      const locationFactors: Record<string, number> = { low: 0.80, medium: 1.0, high: 1.25, very_high: 1.55 };
      const qualityFactors: Record<string, number> = { economy: 0.80, standard: 1.0, premium: 1.30, luxury: 1.65 };
      const storyFactor = stories > 1 ? 1 + (stories - 1) * 0.04 : 1.0;

      const base = baseCosts[type] ?? { low: 120, mid: 200, high: 320 };
      const lf = locationFactors[location] ?? 1.0;
      const qf = qualityFactors[quality] ?? 1.0;

      const lowSF = Math.round(base.low * lf * qf * storyFactor);
      const midSF = Math.round(base.mid * lf * qf * storyFactor);
      const highSF = Math.round(base.high * lf * qf * storyFactor);

      const lowTotal = lowSF * sf;
      const midTotal = midSF * sf;
      const highTotal = highSF * sf;

      return JSON.stringify({
        building_type: type,
        square_footage: sf.toLocaleString(),
        stories,
        location_factor: location,
        quality_level: quality,
        cost_per_sf: { low: `$${lowSF}`, mid: `$${midSF}`, high: `$${highSF}` },
        total_estimate: {
          low: `$${Math.round(lowTotal / 1000) * 1000 < 1_000_000 ? (lowTotal / 1000).toFixed(0) + 'K' : (lowTotal / 1_000_000).toFixed(2) + 'M'}`,
          mid: `$${Math.round(midTotal / 1000) * 1000 < 1_000_000 ? (midTotal / 1000).toFixed(0) + 'K' : (midTotal / 1_000_000).toFixed(2) + 'M'}`,
          high: `$${Math.round(highTotal / 1000) * 1000 < 1_000_000 ? (highTotal / 1000).toFixed(0) + 'K' : (highTotal / 1_000_000).toFixed(2) + 'M'}`,
        },
        accuracy: 'Class 5 ROM ±30-50%. For bidding purposes, perform a full quantity takeoff.',
        notes: `Includes: hard costs, GC general conditions, contingency. Excludes: land, soft costs (design, permits, financing), FF&E, site work, utility connections.`,
      });
    }

    case 'draft_transmittal': {
      const txNum = String(input.transmittal_number ?? 'T-XXX');
      const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const actionLabels: Record<string, string> = {
        for_approval: 'FOR APPROVAL',
        for_review: 'FOR REVIEW AND COMMENT',
        for_record: 'FOR RECORD',
        for_construction: 'FOR CONSTRUCTION',
        as_requested: 'AS REQUESTED',
        returned_for_correction: 'RETURNED FOR CORRECTION — RESUBMIT',
      };
      const action = actionLabels[String(input.action_required ?? 'for_review')] ?? 'FOR REVIEW';
      return `
═══════════════════════════════════════
TRANSMITTAL
${txNum}
═══════════════════════════════════════
Project:    ${input.project_name}
Transmittal #: ${txNum}
Date:       ${date}

FROM: ${input.from_company}
TO:   ${input.to_company}
ATTN: ${input.to_contact ?? '[Contact Name]'}

SUBJECT: ${input.subject}

ACTION REQUIRED: ☑ ${action}

ITEMS TRANSMITTED:
${input.documents}

NOTES / REMARKS:
${input.notes ?? 'Please review and advise.'}

□ If enclosures are not as noted, please notify us immediately.
□ Please acknowledge receipt by returning a signed copy or by email confirmation.

Transmitted by: _______________________
Title: _______________________
Date: ${date}
Phone: _______________________
Email: _______________________
═══════════════════════════════════════`;
    }

    case 'draft_closeout_checklist': {
      const hasFederal = Boolean(input.has_federal_funding);
      const hasBonding = Boolean(input.has_bonding ?? true);
      const hasCommissioning = Boolean(input.has_commissioning);
      const type = String(input.project_type ?? 'commercial');
      return `
═══════════════════════════════════════
PROJECT CLOSEOUT CHECKLIST
${input.project_name}
═══════════════════════════════════════
Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

━━━ SUBSTANTIAL COMPLETION ━━━
□ Punch list generated and distributed to all subs
□ AIA G704 Certificate of Substantial Completion executed
□ Owner acceptance of substantial completion
□ Warranty period start date documented
□ Retainage reduction to 5% (per contract terms)
□ Temporary utilities transitioned to owner
□ Final cleaning complete
□ Keys, access cards, combinations turned over to owner

━━━ FINANCIAL CLOSEOUT ━━━
□ Final pay application submitted (G702/G703)
□ All subcontractor final pay apps received and processed
□ All change orders approved and fully executed
□ Final retainage invoice submitted
□ All supplier invoices received and paid
□ Joint check agreements satisfied
□ Tax waivers obtained where required
□ Final job cost reconciliation complete
□ Final WIP schedule updated

━━━ LIEN RELEASES ━━━
□ Conditional final lien waiver — General Contractor
□ Unconditional final lien waivers — all subcontractors (Tier 1)
□ Unconditional final lien waivers — all major suppliers
□ AIA G706 (Contractor's Affidavit of Payment of Debts and Claims)
□ AIA G706A (Contractor's Affidavit of Release of Liens)
${hasBonding ? '□ AIA G707 (Consent of Surety to Final Payment)\n□ Surety final release obtained' : ''}
□ All preliminary notices released/discharged

━━━ DOCUMENT SUBMITTALS ━━━
□ As-built drawings (red-lines transferred to reproducibles)
□ CAD/BIM files (if required by contract)
□ Operation & Maintenance (O&M) manuals — all systems
□ Equipment warranties — manufacturer originals
□ Subcontractor warranties
□ Roofing warranty (if applicable)
□ Product data and material specifications
□ Spare parts / spare materials per spec requirements
□ LEED documentation (if applicable)

━━━ PERMITS & INSPECTIONS ━━━
□ Certificate of Occupancy (CO) obtained
□ All sub-trade inspection approvals finalized
□ Special inspection final report submitted
□ Fire marshal final approval
□ Health department (if applicable)
□ Elevator certificate (if applicable)
□ Boiler certificate (if applicable)
□ Grease trap/FOG approval (restaurants)

${hasCommissioning ? `━━━ COMMISSIONING ━━━
□ Mechanical system balancing reports
□ HVAC commissioning report
□ BAS/controls sequence of operations verified
□ Testing, adjusting, and balancing (TAB) report
□ Owner training — all mechanical systems documented
□ Owner training — electrical/lighting controls
□ Fire/life safety system acceptance test\n` : ''}

━━━ OWNER TRAINING ━━━
□ Facility walkthrough with owner
□ Building systems training scheduled and completed
□ Emergency contact list provided to owner
□ Preventive maintenance schedule provided

${hasFederal ? `━━━ FEDERAL / PREVAILING WAGE CLOSEOUT ━━━
□ All WH-347 certified payroll reports submitted through final week
□ Final Compliance Statement executed
□ EEO-1 / OFCCP final reports (if applicable)
□ Buy American documentation (if applicable)
□ Davis-Bacon wage rate posting removed\n` : ''}

━━━ INSURANCE & RISK ━━━
□ Builder's risk policy cancelled (notify owner to obtain permanent property insurance)
□ All sub COIs on file and current through project close
□ OSHA 300 log updated and signed off
□ Incident reports filed (if any)
□ Property damage claims resolved

━━━ FINAL COMPLETION ━━━
□ All punch list items signed off by owner/architect
□ Final Certificate of Payment issued by architect
□ Final payment received
□ All retainage released
□ Project files archived (minimum 7 years)
□ Post-project review/lessons learned completed

Prepared by: _______________________  Date: __________
Reviewed by: _______________________  Date: __________
═══════════════════════════════════════`;
    }

    case 'analyze_wip_schedule': {
      const projectName = String(input.project_name);
      const contractAmount = Number(input.contract_amount);
      const percentComplete = Number(input.percent_complete);
      const billedToDate = Number(input.billed_to_date);
      const costToDate = Number(input.cost_to_date);
      const estimatedCostAtCompletion = Number(input.estimated_cost_at_completion);
      const contractDurationMonths = input.contract_duration_months != null ? Number(input.contract_duration_months) : null;
      const monthsElapsed = input.months_elapsed != null ? Number(input.months_elapsed) : null;

      const earnedValue = contractAmount * (percentComplete / 100);
      const billingVariance = billedToDate - earnedValue;
      const costVariance = earnedValue - costToDate;
      const costPerformanceIndex = costToDate > 0 ? earnedValue / costToDate : null;
      const remainingContractValue = contractAmount - earnedValue;
      const estimateAtCompletion = costPerformanceIndex != null && costPerformanceIndex > 0
        ? costToDate + (remainingContractValue / costPerformanceIndex)
        : estimatedCostAtCompletion;
      const projectedProfit = contractAmount - estimateAtCompletion;
      const projectedGpPercent = contractAmount > 0 ? (projectedProfit / contractAmount) * 100 : 0;

      let schedulePerformanceIndex: number | null = null;
      if (contractDurationMonths != null && monthsElapsed != null && contractDurationMonths > 0) {
        const budgetedCostWorkScheduled = contractAmount * (monthsElapsed / contractDurationMonths);
        schedulePerformanceIndex = budgetedCostWorkScheduled > 0 ? earnedValue / budgetedCostWorkScheduled : null;
      }

      const billingStatus = billingVariance > 0 ? 'OVER-BILLED' : billingVariance < 0 ? 'UNDER-BILLED' : 'ON TRACK';
      const costStatus = costVariance >= 0 ? 'UNDER BUDGET' : 'OVER BUDGET';
      const scheduleStatus = schedulePerformanceIndex == null ? 'N/A' : schedulePerformanceIndex >= 1.0 ? 'ON/AHEAD OF SCHEDULE' : 'BEHIND SCHEDULE';

      return JSON.stringify({
        project_name: projectName,
        contract_amount: contractAmount.toFixed(2),
        percent_complete: `${percentComplete.toFixed(1)}%`,
        earned_value: earnedValue.toFixed(2),
        billed_to_date: billedToDate.toFixed(2),
        billing_variance: billingVariance.toFixed(2),
        billing_status: billingStatus,
        cost_to_date: costToDate.toFixed(2),
        cost_variance: costVariance.toFixed(2),
        cost_status: costStatus,
        cost_performance_index: costPerformanceIndex != null ? costPerformanceIndex.toFixed(3) : 'N/A',
        schedule_performance_index: schedulePerformanceIndex != null ? schedulePerformanceIndex.toFixed(3) : 'N/A',
        schedule_status: scheduleStatus,
        estimate_at_completion: estimateAtCompletion.toFixed(2),
        projected_profit: projectedProfit.toFixed(2),
        projected_gp_percent: `${projectedGpPercent.toFixed(1)}%`,
        summary: `${projectName} is ${billingStatus.toLowerCase()} by $${Math.abs(billingVariance).toLocaleString('en-US', { minimumFractionDigits: 2 })} and ${costStatus.toLowerCase()} by $${Math.abs(costVariance).toLocaleString('en-US', { minimumFractionDigits: 2 })}. Projected gross profit is ${projectedGpPercent.toFixed(1)}% ($${projectedProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}).`,
      });
    }

    case 'calculate_bonding_capacity': {
      const workingCapital = Number(input.working_capital);
      const netWorth = Number(input.net_worth);
      const currentBacklog = Number(input.current_backlog);
      const largestCompleted = Number(input.largest_completed_project);
      const yearsInBusiness = input.years_in_business != null ? Number(input.years_in_business) : null;
      const emod = Number(input.emod ?? 1.0);

      const singleJobCapacity = workingCapital * 10;
      const aggregateCapacity = netWorth * 15;
      const availableCapacity = aggregateCapacity - currentBacklog;
      const leverageRatio = netWorth > 0 ? currentBacklog / netWorth : null;

      let leverageHealth = 'HEALTHY';
      let leverageNote = 'Backlog leverage is within normal range.';
      if (leverageRatio != null) {
        if (leverageRatio > 20) {
          leverageHealth = 'DANGER ZONE';
          leverageNote = 'Backlog leverage exceeds 20x net worth — surety will likely reduce or deny capacity.';
        } else if (leverageRatio > 15) {
          leverageHealth = 'CONCERNING';
          leverageNote = 'Backlog leverage exceeds 15x net worth — surety scrutiny expected; may require additional collateral.';
        }
      }

      const emodNote = emod > 1.0
        ? `Experience mod of ${emod} is above 1.0 — elevated EMR can reduce bonding appetite and raise premiums.`
        : `Experience mod of ${emod} is at or below 1.0 — good safety record supports bonding capacity.`;

      const recommendations: string[] = [];
      if (availableCapacity < 0) recommendations.push('Current backlog exceeds aggregate capacity — avoid bidding new bonded work until backlog burns down.');
      if (leverageRatio != null && leverageRatio > 15) recommendations.push('Improve leverage ratio by reducing backlog or increasing net worth through retained earnings.');
      if (emod > 1.2) recommendations.push('Reduce EMR below 1.0 to improve surety terms and bonding appetite.');
      if (yearsInBusiness != null && yearsInBusiness < 3) recommendations.push('Less than 3 years in business — surety may require personal indemnity and additional financial security.');
      if (recommendations.length === 0) recommendations.push('Financial profile supports current bonding program. Consider growing program gradually with demonstrated performance.');

      return JSON.stringify({
        working_capital: workingCapital.toFixed(2),
        net_worth: netWorth.toFixed(2),
        current_backlog: currentBacklog.toFixed(2),
        largest_completed_project: largestCompleted.toFixed(2),
        single_job_capacity_estimate: singleJobCapacity.toFixed(2),
        aggregate_capacity_estimate: aggregateCapacity.toFixed(2),
        available_capacity: availableCapacity.toFixed(2),
        leverage_ratio: leverageRatio != null ? `${leverageRatio.toFixed(1)}x` : 'N/A',
        leverage_health: leverageHealth,
        leverage_note: leverageNote,
        emod_note: emodNote,
        recommendations,
        disclaimer: 'Bonding capacity estimates are rule-of-thumb approximations. Actual capacity is determined by your surety based on full underwriting review including financial statements, work history, and character assessment.',
      });
    }

    case 'draft_subcontract_scope': {
      const trade = String(input.trade).toLowerCase().trim();
      const projectName = String(input.project_name);
      const projectType = String(input.project_type ?? 'commercial');
      const specialReqs = input.special_requirements ? String(input.special_requirements) : null;
      const contractAmt = input.contract_amount ? `$${Number(input.contract_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '[TO BE INSERTED]';
      const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      const scopeData: Record<string, { included: string[]; excluded: string[]; standards: string; coordination: string }> = {
        electrical: {
          included: [
            'Complete electrical service entrance and main distribution panel(s) per plans and specs',
            'All branch circuit wiring, conduit, and devices throughout the building',
            'Lighting fixtures and controls per fixture schedule — including dimming and occupancy sensors',
            'Exit and emergency lighting — complete and code compliant',
            'Fire alarm rough-in (conduit and boxes only — programming by others)',
            'Data/telecom conduit and pull strings (terminations by low-voltage contractor)',
            'Mechanical equipment connections per equipment schedules',
            'Exterior lighting and site electrical as shown on plans',
            'Temporary power and lighting throughout construction',
            'Arc flash labeling and panel schedules',
            'Final connections to all electrical equipment furnished by others',
            'All permits, inspections, and certificates of completion',
          ],
          excluded: [
            'Low-voltage data cabling terminations and infrastructure (by separate low-voltage contractor)',
            'Fire alarm programming, testing, and acceptance (by fire alarm vendor)',
            'Specialty equipment wiring not shown on electrical drawings',
            'POCO (utility company) service fees and transformer installation',
            'Telephone/cable TV service terminations',
            'Audio/visual and security system wiring',
          ],
          standards: 'All work shall conform to NEC (current adopted edition), local amendments, NFPA 70E, and applicable OSHA standards. UL-listed materials required throughout.',
          coordination: 'Coordinate panel locations with structural and architectural. Coordinate equipment connections with mechanical and plumbing contractors. Attend all coordination and BIM clash meetings.',
        },
        plumbing: {
          included: [
            'Complete domestic water distribution — hot, cold, and recirculation',
            'All sanitary drain, waste, and vent (DWV) piping',
            'Storm drainage within building and to 5 feet outside building',
            'Natural gas piping to all equipment requiring gas connections',
            'All plumbing fixtures, trim, and accessories per fixture schedule',
            'Water heaters and associated equipment',
            'Backflow preventers and pressure reducing valves',
            'Hose bibbs, floor drains, and area drains per plans',
            'Grease interceptor and related piping (if applicable)',
            'Sleeves, hangers, supports, and all rough-in work',
            'All plumbing permits, inspections, and certificates',
            'Insulation of all domestic hot water and cold water piping',
          ],
          excluded: [
            'Fire suppression/sprinkler systems (by separate fire sprinkler subcontractor)',
            'Site utilities beyond 5 feet of building foundation',
            'Medical gas systems (by specialty contractor)',
            'Process piping for equipment not shown on plumbing drawings',
            'Roofing drains and leaders (by roofing contractor)',
          ],
          standards: 'Comply with IPC (current adopted edition), local amendments, and IAPMO standards. All fixtures to be ADA compliant where required.',
          coordination: 'Coordinate rough-in dimensions with architectural millwork and tile contractor. Coordinate equipment connections with mechanical. Submit plumbing fixture submittals for architect approval prior to ordering.',
        },
        hvac: {
          included: [
            'All HVAC equipment — AHUs, RTUs, fan coil units, VAV boxes per equipment schedule',
            'Complete ductwork distribution system — supply, return, and exhaust',
            'Hydronic piping, pumps, and associated equipment (if applicable)',
            'Building automation system (BAS/DDC) controls for HVAC equipment',
            'Balancing of all air and water systems — TAB report required',
            'Insulation of all ductwork and hydronic piping',
            'Kitchen exhaust hoods and make-up air units (if shown on mechanical plans)',
            'Equipment screens and vibration isolation',
            'Start-up and commissioning of all mechanical equipment',
            'Owner training on all HVAC systems',
            'All mechanical permits, inspections, and certificates',
            'Refrigerant management plan and certification',
          ],
          excluded: [
            'Plumbing and domestic water connections to equipment (by plumbing contractor)',
            'Electrical power wiring to equipment (by electrical contractor)',
            'Specialty lab or clean room HVAC (unless specifically included in scope)',
            'Process cooling or industrial ventilation not shown on mechanical drawings',
          ],
          standards: 'Comply with IMC, ASHRAE 62.1 ventilation standards, SMACNA duct construction standards, and local energy code. All refrigerants to be EPA 608 compliant.',
          coordination: 'Coordinate duct routing with structural, electrical, and plumbing for clash-free installation. BIM coordination required. Coordinate equipment pads with concrete contractor.',
        },
        framing: {
          included: [
            'Complete structural and non-structural metal stud framing per architectural and structural drawings',
            'All exterior wall framing including sheathing and weather-resistive barrier',
            'Interior partition framing per architectural plans',
            'Soffit, bulkhead, and ceiling framing',
            'Backing and blocking for cabinets, toilet accessories, handrails, and wall-mounted equipment',
            'Door and window rough openings and headers',
            'Framing around mechanical, electrical, and plumbing penetrations',
            'All anchors, fasteners, and framing accessories',
            'Rough-in coordination openings for all trades',
          ],
          excluded: [
            'Structural steel (by structural steel subcontractor)',
            'Drywall and finishing (by drywall subcontractor)',
            'Insulation within framing (by insulation subcontractor)',
            'Doors, frames, and hardware (by separate scope)',
            'Exterior cladding systems (by separate subcontractor)',
          ],
          standards: 'Comply with AISC, AISI, local building code, and structural engineer of record\'s specifications. All light gauge framing per ASTM C645 and C754.',
          coordination: 'Coordinate framing layout with MEP trades prior to installation. Install all backing and blocking prior to drywall. Provide shop drawings for architect/structural review.',
        },
        drywall: {
          included: [
            'All gypsum board installation — walls, ceilings, and soffits',
            'Taping, mudding, and finishing to specified level (Level 4 standard unless noted)',
            'Texture application where specified',
            'Corner bead, control joints, and trim accessories',
            'Shaft wall and area separation wall assemblies (fire-rated)',
            'Acoustic insulation in partitions for sound attenuation',
            'Patch and repair of framing contractor\'s rough openings after MEP rough-in',
            'Preparation of surfaces for paint — sanding, priming',
          ],
          excluded: [
            'Framing (by framing subcontractor)',
            'Paint and wall coverings (by painting subcontractor)',
            'Tile backer board installation (by tile subcontractor)',
            'Exterior EIFS or stucco systems (by separate subcontractor)',
            'Firestopping of penetrations (by MEP trades or dedicated firestop subcontractor)',
          ],
          standards: 'Comply with GA-216 application standards, ASTM C840, and AWCI Technical Manual 12-B. Fire-rated assemblies to UL-listed assemblies per plans.',
          coordination: 'Verify all MEP rough-in is complete, inspected, and approved prior to closing walls. Coordinate with painter for primer type requirements.',
        },
        concrete: {
          included: [
            'All cast-in-place concrete per structural drawings — footings, foundations, slabs, walls',
            'Formwork design, supply, and installation',
            'Reinforcing steel placement per structural drawings',
            'Embedded items, anchor bolts, sleeves, and inserts',
            'Concrete mix design submittals and special inspection coordination',
            'Curing, joint sealing, and surface finishing',
            'Slab-on-grade including sub-base preparation (after earthwork by others)',
            'Flatwork — sidewalks, curbs, and pads as shown on civil/architectural plans',
            'Concrete pumping and placement equipment',
          ],
          excluded: [
            'Earthwork, excavation, and grading (by civil/earthwork contractor)',
            'Waterproofing and damp-proofing of foundation walls (by waterproofing contractor)',
            'Underslab insulation and vapor barrier (by separate scope)',
            'Post-installed anchors (by trade requiring anchors)',
            'Decorative concrete overlays and polishing (by specialty contractor)',
          ],
          standards: 'ACI 301, ACI 318 (structural), ACI 305 (hot weather), ACI 306 (cold weather). Concrete mix designs to be submitted for EOR approval. Special inspection per IBC Chapter 17.',
          coordination: 'Coordinate all embedded items with MEP contractors before pour. Provide pour schedule to owner/architect. Coordinate with structural special inspector.',
        },
        roofing: {
          included: [
            'Complete roofing system per specifications — membrane type, insulation, and coverboard',
            'Roof insulation — tapered and flat as shown on roof plan',
            'All roof flashings — base, counter, pitch pocket, and edge metal',
            'Roof drains, scuppers, and overflow drains (rough-in by plumber; final connection by roofer)',
            'Penetration flashings for all MEP penetrations',
            'Walkway pads and equipment support pads',
            'Manufacturer warranty — 20-year NDL warranty minimum',
            'All permits and inspections',
            'Pre-roofing inspection and pre-roofing meeting',
          ],
          excluded: [
            'Roof deck structure (by structural/framing contractor)',
            'HVAC equipment curbs fabrication (by HVAC contractor — roofing contractor sets and flashes curbs)',
            'Roof penetration cutting for MEP (by respective MEP contractors)',
            'Gutters and downspouts (by separate scope unless noted)',
          ],
          standards: 'NRCA standards, FM Global approval where required, local building code. All materials to be UL-classified. Contractor shall be a certified installer for specified manufacturer.',
          coordination: 'Attend pre-roofing meeting with owner and architect. Coordinate MEP penetration schedule to minimize interruptions. Provide installer certification prior to commencement.',
        },
        painting: {
          included: [
            'Interior painting — walls, ceilings, doors, frames, and trim per finish schedule',
            'Exterior painting — all painted surfaces per specifications',
            'Surface preparation — cleaning, sanding, caulking, spot priming',
            'Primer and finish coats per paint system specified',
            'Epoxy coatings in mechanical rooms, restrooms, and utility areas where specified',
            'Line striping in parking areas (if shown on civil plans)',
            'Protective coatings on structural steel where exposed',
            'Color samples and mock-ups for architect approval prior to field application',
          ],
          excluded: [
            'Factory-applied coatings on equipment, doors, and millwork',
            'Staining or clear finishing of wood (unless specifically included)',
            'Anti-graffiti coatings (unless specified)',
            'Traffic marking beyond building limits (by civil contractor)',
            'Wallcovering installation (by separate contractor)',
          ],
          standards: 'MPI (Master Painters Institute) standards. Surfaces to be clean, dry, and within specified temperature and humidity ranges. Paint products to be VOC-compliant per local regulations.',
          coordination: 'Verify all substrates are ready before mobilizing. Coordinate with drywall contractor for primer type. Provide paint schedule and color samples for owner/architect review.',
        },
      };

      const tradeKey = Object.keys(scopeData).find(k => trade.includes(k)) ?? '';
      const scopeInfo = scopeData[tradeKey];

      if (!scopeInfo) {
        return `
═══════════════════════════════════════
SUBCONTRACT SCOPE OF WORK
${String(input.trade).toUpperCase()} — ${projectName}
═══════════════════════════════════════
Date: ${date}
Project Type: ${projectType}
${input.contract_amount ? `Subcontract Amount: ${contractAmt}` : ''}

SCOPE OF WORK — GENERAL:
Subcontractor shall furnish all labor, materials, equipment, tools, supervision, permits, and incidentals necessary to perform and complete all ${input.trade} work for ${projectName} in strict accordance with the contract documents, applicable codes, and good industry practice.

INCLUDED WORK:
All ${input.trade} work as shown on the contract drawings and described in the project specifications, including but not limited to all work reasonably inferable from the contract documents.
${specialReqs ? `\nSPECIAL REQUIREMENTS:\n${specialReqs}` : ''}

EXCLUDED WORK:
Items specifically excluded from this subcontract shall be identified by mutual agreement and listed via written addendum.

QUALITY STANDARDS:
All work shall comply with applicable local, state, and federal codes and regulations in effect at the time of construction.

COORDINATION:
Subcontractor shall cooperate and coordinate with all other trades. Attend coordination meetings as required.

Prepared: ${date}
Project: ${projectName}
═══════════════════════════════════════`;
      }

      const includedList = scopeInfo.included.map((item, i) => `  ${i + 1}. ${item}`).join('\n');
      const excludedList = scopeInfo.excluded.map((item, i) => `  ${i + 1}. ${item}`).join('\n');

      return `
═══════════════════════════════════════
SUBCONTRACT SCOPE OF WORK
${String(input.trade).toUpperCase()} — ${projectName}
═══════════════════════════════════════
Date: ${date}
Project: ${projectName}
Project Type: ${projectType.charAt(0).toUpperCase() + projectType.slice(1)}
${input.contract_amount ? `Subcontract Amount: ${contractAmt}` : ''}

GENERAL SCOPE:
Subcontractor shall furnish all labor, materials, equipment, tools, supervision, permits, and incidentals necessary to perform and complete all ${input.trade} work for ${projectName} in strict accordance with the contract documents, applicable codes, and the following scope.

SPECIFICALLY INCLUDED:
${includedList}
${specialReqs ? `\nSPECIAL REQUIREMENTS / PROJECT-SPECIFIC INCLUSIONS:\n${specialReqs}` : ''}

SPECIFICALLY EXCLUDED (unless added by written change order):
${excludedList}

QUALITY STANDARDS AND CODE COMPLIANCE:
${scopeInfo.standards}

COORDINATION REQUIREMENTS:
${scopeInfo.coordination}

GENERAL PROVISIONS:
  - Subcontractor shall review the full contract documents and clarify any scope questions prior to execution.
  - All work shall be performed by qualified personnel holding required licenses and certifications.
  - Subcontractor is responsible for safety of its own employees and compliance with OSHA standards.
  - Changes to this scope require a written, signed change order prior to performing additional work.
  - Subcontractor shall maintain as-built markups and deliver to GC at project completion.

Prepared: ${date}
Project: ${projectName}
═══════════════════════════════════════`;
    }

    case 'calculate_bid_markup': {
      const directCost = Number(input.direct_cost);
      const overheadRate = Number(input.home_office_overhead_rate ?? 12) / 100;
      const profitRate = Number(input.target_profit_rate ?? 5) / 100;
      const bondRequired = Boolean(input.bond_required ?? false);
      const insuranceRate = Number(input.insurance_rate ?? 1.5) / 100;
      const contingencyRate = Number(input.contingency_rate ?? 3) / 100;
      const competitivePressure = String(input.competitive_pressure ?? 'medium');

      const overheadDollars = directCost * overheadRate;
      const insuranceDollars = directCost * insuranceRate;
      const contingencyDollars = directCost * contingencyRate;
      const bondDollars = bondRequired ? (directCost * 1.15) * 0.012 : 0;
      const subtotalWithOverhead = directCost + overheadDollars + insuranceDollars + contingencyDollars + bondDollars;
      const profitDollars = subtotalWithOverhead * profitRate;
      const bidPrice = subtotalWithOverhead + profitDollars;
      const allInMarkup = directCost > 0 ? ((bidPrice - directCost) / directCost) * 100 : 0;
      const gpDollars = bidPrice - directCost;
      const gpPercent = bidPrice > 0 ? (gpDollars / bidPrice) * 100 : 0;

      const competitiveAnalysis: Record<string, string> = {
        low: 'Low competition — current markup is appropriate. Consider holding or increasing profit.',
        medium: 'Moderate competition — markup is reasonable for market conditions.',
        high: 'High competition — consider trimming contingency or profit to sharpen bid. Be cautious not to underprice.',
        very_high: 'Very high competition — evaluate whether this is a strategic bid or if margin preservation is critical. Consider a GO/NO-GO review.',
      };
      const competitiveNote = competitiveAnalysis[competitivePressure] ?? competitiveAnalysis['medium'];

      return JSON.stringify({
        direct_cost: directCost.toFixed(2),
        overhead: overheadDollars.toFixed(2),
        overhead_rate: `${(overheadRate * 100).toFixed(1)}%`,
        insurance: insuranceDollars.toFixed(2),
        contingency: contingencyDollars.toFixed(2),
        bond_cost: bondDollars > 0 ? bondDollars.toFixed(2) : 'N/A (no bond required)',
        subtotal_with_overhead: subtotalWithOverhead.toFixed(2),
        profit: profitDollars.toFixed(2),
        bid_price: bidPrice.toFixed(2),
        all_in_markup_over_direct: `${allInMarkup.toFixed(1)}%`,
        gross_profit_dollars: gpDollars.toFixed(2),
        gross_profit_percent: `${gpPercent.toFixed(1)}%`,
        competitive_analysis: competitiveNote,
      });
    }

    case 'analyze_project_risk': {
      const projectType = String(input.project_type).toLowerCase();
      const contractType = String(input.contract_type).toLowerCase();
      const contractAmount = Number(input.contract_amount);
      const durationMonths = Number(input.duration_months);
      const hasDesignRisk = Boolean(input.has_design_risk ?? false);
      const isOccupied = Boolean(input.is_occupied_facility ?? false);
      const hasHazmat = Boolean(input.has_hazmat ?? false);
      const isRemote = Boolean(input.is_remote_location ?? false);
      const isUnion = Boolean(input.is_union ?? false);

      type RiskItem = { risk: string; probability: number; impact: number; score: number; mitigation: string };
      const risks: RiskItem[] = [
        {
          risk: 'Scope Creep / Undefined Scope',
          probability: contractType === 'lump_sum' ? 4 : 3,
          impact: 4,
          score: 0,
          mitigation: 'Establish rigorous change order process at kickoff. Define scope boundaries in writing. Require written owner authorization before proceeding with any potential extra.',
        },
        {
          risk: 'Subcontractor Default',
          probability: contractAmount > 10_000_000 ? 3 : 2,
          impact: 5,
          score: 0,
          mitigation: 'Pre-qualify all subs financially. Require sub bonds on contracts over $500K. Carry subcontractor default insurance (SDI). Maintain backup sub list.',
        },
        {
          risk: 'Material Price Escalation',
          probability: 3,
          impact: 3,
          score: 0,
          mitigation: 'Include material escalation clause in contract. Lock in prices for long-lead items at award. Consider escalation allowance in bid.',
        },
        {
          risk: 'Schedule Delay / Liquidated Damages',
          probability: durationMonths > 18 ? 4 : 3,
          impact: contractType === 'lump_sum' ? 5 : 3,
          score: 0,
          mitigation: 'Develop detailed CPM schedule at project start. Identify critical path and float. Submit time impact analyses promptly for all owner-caused delays. Document weather days.',
        },
        {
          risk: 'Owner / Payment Insolvency',
          probability: 2,
          impact: 5,
          score: 0,
          mitigation: 'Require payment bond or letter of credit on private projects over $1M. File preliminary notice on all projects. Monitor payment pattern and escalate at first missed payment.',
        },
        {
          risk: 'Labor Availability / Shortage',
          probability: isUnion ? 2 : 3,
          impact: 3,
          score: 0,
          mitigation: 'Pre-book key subcontractors early. Consider prefabrication to reduce field labor. Establish relationships with multiple labor sources including out-of-area crews.',
        },
        {
          risk: 'Adverse Weather',
          probability: durationMonths > 12 ? 4 : 2,
          impact: 2,
          score: 0,
          mitigation: 'Include weather contingency in schedule. Document weather days contemporaneously. Review contract force majeure and weather day provisions.',
        },
        {
          risk: 'Design Errors / Incomplete Drawings',
          probability: hasDesignRisk ? 4 : 3,
          impact: hasDesignRisk ? 5 : 3,
          score: 0,
          mitigation: 'Conduct thorough pre-construction design review. Issue RFIs early. Establish clear design responsibility matrix for design-build. Consider professional liability insurance.',
        },
      ];

      if (isOccupied) {
        risks.push({
          risk: 'Occupied Facility — Phasing / Infection Control',
          probability: 4,
          impact: 4,
          score: 0,
          mitigation: 'Develop detailed phasing plan with owner. Establish ICRA/ILSM protocols (healthcare). Install dust barriers, negative air, and maintain egress at all times. Conduct safety orientation for all workers.',
        });
      }
      if (hasHazmat) {
        risks.push({
          risk: 'Hazardous Materials — Abatement / Environmental',
          probability: 4,
          impact: 5,
          score: 0,
          mitigation: 'Engage licensed abatement contractor. Develop HASP. Ensure regulatory notifications (EPA, OSHA). Maintain clear chain of custody for all waste manifests.',
        });
      }
      if (isRemote) {
        risks.push({
          risk: 'Remote Location — Logistics / Access',
          probability: 3,
          impact: 3,
          score: 0,
          mitigation: 'Pre-order long-lead materials well in advance. Establish on-site material storage. Plan for mobilization surcharges. Consider worker housing and per diem costs.',
        });
      }
      if (projectType === 'federal') {
        risks.push({
          risk: 'Federal Compliance — Davis-Bacon / Certified Payroll',
          probability: 3,
          impact: 4,
          score: 0,
          mitigation: 'Ensure all subs understand Davis-Bacon requirements. Implement weekly certified payroll review process. Audit subcontractor compliance monthly.',
        });
      }
      if (projectType === 'heavy_civil') {
        risks.push({
          risk: 'Differing Site Conditions — Subsurface',
          probability: 4,
          impact: 5,
          score: 0,
          mitigation: 'Review all geotech reports thoroughly. Include DSC clause protection in contract. Document existing conditions with photos/video before mobilizing.',
        });
      }

      const scoredRisks = risks
        .map(r => ({ ...r, score: r.probability * r.impact }))
        .sort((a, b) => b.score - a.score);

      const highRisks = scoredRisks.filter(r => r.score >= 12);
      const medRisks = scoredRisks.filter(r => r.score >= 6 && r.score < 12);
      const lowRisks = scoredRisks.filter(r => r.score < 6);

      return JSON.stringify({
        project_summary: {
          project_type: input.project_type,
          contract_type: input.contract_type,
          contract_amount: `$${contractAmount.toLocaleString()}`,
          duration_months: durationMonths,
        },
        risk_matrix: scoredRisks,
        risk_summary: {
          high_risks: highRisks.length,
          medium_risks: medRisks.length,
          low_risks: lowRisks.length,
          top_risk: scoredRisks[0]?.risk ?? 'None identified',
        },
        scoring_legend: 'Probability and Impact scored 1 (low) to 5 (high). Risk Score = P × I. Score ≥12 = High, 6–11 = Medium, <6 = Low.',
      });
    }

    case 'calculate_equipment_roi': {
      const equipmentName = String(input.equipment_name);
      const purchasePrice = Number(input.purchase_price);
      const usefulLifeYears = Number(input.useful_life_years ?? 7);
      const annualUtilizationHours = Number(input.annual_utilization_hours);
      const rentalRatePerHour = Number(input.rental_rate_per_hour);
      const salvageValue = Number(input.salvage_value ?? purchasePrice * 0.20);
      const financingRate = Number(input.financing_rate ?? 6) / 100;

      const annualDepreciation = (purchasePrice - salvageValue) / usefulLifeYears;
      const annualInterest = purchasePrice * financingRate * 0.55;
      const annualMaintenance = purchasePrice * 0.12;
      const annualInsurance = purchasePrice * 0.015;
      const totalAnnualOwnershipCost = annualDepreciation + annualInterest + annualMaintenance + annualInsurance;
      const ownershipCostPerHour = annualUtilizationHours > 0 ? totalAnnualOwnershipCost / annualUtilizationHours : 0;
      const rentalCostPerYear = rentalRatePerHour * annualUtilizationHours;
      const annualSavingsIfOwned = rentalCostPerYear - totalAnnualOwnershipCost;
      const paybackMonths = annualSavingsIfOwned > 0 ? (purchasePrice / (annualSavingsIfOwned / 12)) : null;

      let recommendation = '';
      if (annualSavingsIfOwned > 0) {
        recommendation = paybackMonths != null && paybackMonths <= 36
          ? `RECOMMEND PURCHASE — Positive annual savings of $${annualSavingsIfOwned.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} with payback in ${paybackMonths.toFixed(0)} months.`
          : `MARGINAL — Positive savings but long payback of ${paybackMonths != null ? paybackMonths.toFixed(0) : 'N/A'} months. Consider rental if utilization may decline.`;
      } else {
        recommendation = `RECOMMEND RENTING — Ownership costs exceed rental costs at current utilization. Would need ${Math.ceil(Math.abs(annualSavingsIfOwned / rentalRatePerHour + annualUtilizationHours))} hours/year to break even.`;
      }

      return JSON.stringify({
        equipment_name: equipmentName,
        purchase_price: purchasePrice.toFixed(2),
        useful_life_years: usefulLifeYears,
        annual_utilization_hours: annualUtilizationHours,
        annual_cost_breakdown: {
          depreciation: annualDepreciation.toFixed(2),
          interest: annualInterest.toFixed(2),
          maintenance: annualMaintenance.toFixed(2),
          insurance: annualInsurance.toFixed(2),
          total_annual_ownership_cost: totalAnnualOwnershipCost.toFixed(2),
        },
        ownership_cost_per_hour: ownershipCostPerHour.toFixed(2),
        rental_rate_per_hour: rentalRatePerHour.toFixed(2),
        rental_cost_per_year: rentalCostPerYear.toFixed(2),
        annual_savings_if_owned: annualSavingsIfOwned.toFixed(2),
        payback_months: paybackMonths != null ? paybackMonths.toFixed(1) : 'N/A — renting is more economical',
        recommendation,
      });
    }

    case 'draft_demand_letter': {
      const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const deadlineDate = new Date();
      deadlineDate.setDate(deadlineDate.getDate() + 14);
      const deadlineDateStr = deadlineDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const amountOwed = Number(input.amount_owed);
      const daysOutstanding = Number(input.days_outstanding);
      const state = input.state ? String(input.state).toUpperCase() : null;
      const amountStr = amountOwed.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

      const promptPaymentRates: Record<string, string> = {
        AZ: '10% per year (A.R.S. §32-1129.02)',
        CA: '2% per month (Cal. Civil Code §3260)',
        TX: '18% per year (Tex. Property Code §28.004)',
        FL: '12% per year on retainage (Fla. Stat. §255.073 / §715.12)',
        NV: '10% per year (NRS §624.630)',
        WA: '12% per year (RCW 39.76.011)',
        CO: '15% per year (C.R.S. §24-91-103)',
        OR: '12% per year (ORS §701.630)',
        GA: '12% per year (O.C.G.A. §13-6-13)',
        NC: '8% per year (N.C.G.S. §22C-6)',
      };

      const interestText = state && promptPaymentRates[state]
        ? `Interest accrues on the unpaid balance at ${promptPaymentRates[state]}, calculated from the date payment was originally due.`
        : 'Interest accrues on the unpaid balance at the applicable legal rate under your state\'s prompt payment statute.';

      const invoiceRef = input.invoice_numbers
        ? `including Pay Application(s)/Invoice(s) No. ${String(input.invoice_numbers)},`
        : '';

      const priorCommsText = input.prior_communications
        ? `\nPRIOR COLLECTION EFFORTS:\nDespite ${String(input.prior_communications)}, payment has not been received.\n`
        : '';

      return `
═══════════════════════════════════════
FORMAL DEMAND FOR PAYMENT
═══════════════════════════════════════
${date}

VIA CERTIFIED MAIL, RETURN RECEIPT REQUESTED
AND EMAIL

${input.debtor_name}
[Address]
[City, State ZIP]

RE: FORMAL DEMAND FOR PAYMENT
    Project: ${input.project_name}
    Amount Due and Owing: ${amountStr}

Dear ${input.debtor_name}:

This letter constitutes a formal demand for immediate payment of ${amountStr}, which remains due and owing to ${input.claimant_name} for labor, materials, and/or services furnished at the above-referenced project ${invoiceRef} and has been outstanding for ${daysOutstanding} days.

AMOUNT DUE AND OWING:
  Total Amount Outstanding:       ${amountStr}
  Days Outstanding:                ${daysOutstanding} days
${input.invoice_numbers ? `  Invoice/Pay App Reference(s):   ${String(input.invoice_numbers)}` : ''}
  ${input.contract_clause ? `Contract Clause: ${String(input.contract_clause)}` : ''}
${priorCommsText}
DEMAND FOR PAYMENT:
YOU ARE HEREBY DEMANDED to remit payment in full in the amount of ${amountStr} no later than 10 business days from the date of this letter — by ${deadlineDateStr}.

ACCRUING INTEREST:
${interestText}

CONSEQUENCES OF NON-PAYMENT:
If payment in full is not received by ${deadlineDateStr}, ${input.claimant_name} will, without further notice, exercise any and all of the following remedies available under applicable law:

  1. File a mechanic's lien / materialman's lien against the project property;
  2. Make a claim against any payment bond posted for the project;
  3. Suspend performance of all work until payment is received in full;
  4. Refer this matter to legal counsel and commence litigation to recover all amounts owed, including principal, interest, attorneys' fees, and all costs of collection.

RESERVATION OF ALL RIGHTS:
${input.claimant_name} expressly reserves all rights, claims, and remedies available under the contract, applicable state and federal law, and at equity. This demand letter does not constitute a waiver of any such rights.

Please govern yourself accordingly.

Very truly yours,

${input.claimant_name}

By: _______________________
Name: _______________________
Title: _______________________
Date: ${date}

cc: [Legal Counsel]
cc: [Surety, if applicable]
═══════════════════════════════════════`;
    }

    case 'calculate_overhead_rate': {
      const annualRevenue = Number(input.annual_revenue);
      const directLabor = Number(input.direct_labor);
      const directMaterials = Number(input.direct_materials);
      const directSubcontractors = Number(input.direct_subcontractors);
      const totalAnnualOverhead = Number(input.total_annual_overhead);
      const targetNetProfitPercent = Number(input.target_net_profit_percent ?? 5);

      const directCosts = directLabor + directMaterials + directSubcontractors;
      const grossProfit = annualRevenue - directCosts;
      const grossMarginPct = annualRevenue > 0 ? (grossProfit / annualRevenue) * 100 : 0;
      const overheadAsPctRevenue = annualRevenue > 0 ? (totalAnnualOverhead / annualRevenue) * 100 : 0;
      const overheadAsPctDirect = directCosts > 0 ? (totalAnnualOverhead / directCosts) * 100 : 0;
      const netProfit = grossProfit - totalAnnualOverhead;
      const netMarginPct = annualRevenue > 0 ? (netProfit / annualRevenue) * 100 : 0;
      const breakEvenRevenue = grossMarginPct > 0 ? totalAnnualOverhead / (grossMarginPct / 100) : 0;
      const markupToCoverOverhead = directCosts > 0 ? (totalAnnualOverhead / directCosts) * 100 : 0;
      const fullMarkupForTargetProfit = directCosts > 0
        ? (((directCosts + totalAnnualOverhead) / directCosts - 1) * 100) + targetNetProfitPercent
        : 0;

      let benchmarkNotes = '';
      if (grossMarginPct < 15) benchmarkNotes += 'ALERT: Gross margin below 15% is dangerously thin for most GCs — review field productivity and change order capture. ';
      if (grossMarginPct > 30) benchmarkNotes += 'Note: Gross margin above 30% is above average — verify that all direct costs are correctly coded. ';
      if (overheadAsPctRevenue > 15) benchmarkNotes += 'Overhead as % of revenue exceeds 15% — review G&A for reduction opportunities. ';
      if (netMarginPct < 2) benchmarkNotes += 'ALERT: Net margin below 2% leaves no cushion for errors or claims. ';
      if (benchmarkNotes === '') benchmarkNotes = 'Financial metrics are within healthy construction industry ranges.';

      return JSON.stringify({
        annual_revenue: annualRevenue.toFixed(2),
        direct_costs_breakdown: {
          direct_labor: directLabor.toFixed(2),
          direct_materials: directMaterials.toFixed(2),
          direct_subcontractors: directSubcontractors.toFixed(2),
          total_direct_costs: directCosts.toFixed(2),
        },
        gross_profit: grossProfit.toFixed(2),
        gross_margin_percent: `${grossMarginPct.toFixed(1)}%`,
        total_annual_overhead: totalAnnualOverhead.toFixed(2),
        overhead_as_pct_of_revenue: `${overheadAsPctRevenue.toFixed(1)}%`,
        overhead_as_pct_of_direct_cost: `${overheadAsPctDirect.toFixed(1)}%`,
        net_profit: netProfit.toFixed(2),
        net_margin_percent: `${netMarginPct.toFixed(1)}%`,
        break_even_revenue: breakEvenRevenue.toFixed(2),
        markup_to_cover_overhead_only: `${markupToCoverOverhead.toFixed(1)}%`,
        full_markup_for_target_profit: `${fullMarkupForTargetProfit.toFixed(1)}%`,
        benchmark_notes: benchmarkNotes,
      });
    }

    case 'generate_schedule_recovery': {
      const projectName = String(input.project_name);
      const originalDate = new Date(String(input.original_completion_date));
      const currentDate = new Date(String(input.current_projected_completion));
      const delayCause = String(input.delay_cause).toLowerCase();
      const contractAmount = Number(input.contract_amount);
      const remainingWork = String(input.remaining_work_description);
      const accelerationBudget = input.available_budget_for_acceleration != null ? Number(input.available_budget_for_acceleration) : null;

      const delayDays = Math.round((currentDate.getTime() - originalDate.getTime()) / (1000 * 60 * 60 * 24));

      const isOwnerCaused = delayCause.includes('owner') || delayCause.includes('design') || delayCause.includes('change');
      const isWeather = delayCause.includes('weather');
      const isLabor = delayCause.includes('labor') || delayCause.includes('crew') || delayCause.includes('staffing');
      const isMaterial = delayCause.includes('material') || delayCause.includes('supply') || delayCause.includes('delivery');

      const overtimeCost = Math.round(contractAmount * 0.02);
      const secondShiftCost = Math.round(contractAmount * 0.04);
      const weekendCost = Math.round(contractAmount * 0.015);
      const crewAugmentCost = Math.round(contractAmount * 0.03);

      const immediateActions = [
        'Convene schedule recovery meeting with all key subcontractors and owner within 5 business days',
        'Update and rebaseline the project CPM schedule to reflect current status',
        'Identify critical path activities and float on all near-critical paths',
        'Assess current crew sizes and productivity against planned production rates',
        'Review upcoming material delivery schedule and expedite long-lead items',
      ];

      const recoveryStrategies = [
        {
          strategy: 'Overtime / Extended Work Hours',
          description: '10-hour days, 6 days/week for critical path crews',
          estimated_cost_impact: `$${overtimeCost.toLocaleString()}`,
          schedule_gain_potential: `${Math.round(delayDays * 0.3)}–${Math.round(delayDays * 0.4)} days`,
          risk: 'Worker fatigue, quality risk after extended periods, premium cost',
          recommended: !isWeather,
        },
        {
          strategy: 'Second Shift Operations',
          description: 'Add evening crew for interior work not weather-dependent',
          estimated_cost_impact: `$${secondShiftCost.toLocaleString()}`,
          schedule_gain_potential: `${Math.round(delayDays * 0.4)}–${Math.round(delayDays * 0.6)} days`,
          risk: 'Supervision costs, coordination complexity, noise restrictions',
          recommended: delayDays > 30,
        },
        {
          strategy: 'Weekend Work',
          description: 'Saturday and Sunday work for critical path activities',
          estimated_cost_impact: `$${weekendCost.toLocaleString()}`,
          schedule_gain_potential: `${Math.round(delayDays * 0.2)}–${Math.round(delayDays * 0.3)} days`,
          risk: 'Permit restrictions, neighborhood/owner concerns, premium labor cost',
          recommended: true,
        },
        {
          strategy: 'Crew Augmentation',
          description: 'Add additional crews to work in parallel on multiple areas',
          estimated_cost_impact: `$${crewAugmentCost.toLocaleString()}`,
          schedule_gain_potential: `${Math.round(delayDays * 0.35)}–${Math.round(delayDays * 0.5)} days`,
          risk: 'Labor availability, site congestion, coordination challenges',
          recommended: isLabor || delayDays > 45,
        },
        {
          strategy: 'Procurement Acceleration',
          description: 'Air freight or expedited delivery of long-lead materials',
          estimated_cost_impact: 'Varies — typically $5K–$50K depending on materials',
          schedule_gain_potential: `${Math.round(delayDays * 0.15)}–${Math.round(delayDays * 0.25)} days`,
          risk: 'Premium shipping costs, availability of air cargo',
          recommended: isMaterial,
        },
        {
          strategy: 'Prefabrication / Modular Substitution',
          description: 'Substitute field-fabricated work with prefab assemblies',
          estimated_cost_impact: 'Neutral to slight premium (5–10%)',
          schedule_gain_potential: `${Math.round(delayDays * 0.2)}–${Math.round(delayDays * 0.35)} days`,
          risk: 'Lead time for prefab, coordination with design team',
          recommended: delayDays > 60,
        },
      ];

      const ownerCausedNotice = isOwnerCaused ? `
NOTICE / CLAIM LANGUAGE (OWNER-CAUSED DELAY):
Because this delay is attributable to owner-caused events (${input.delay_cause}), ${projectName} contractor should:
  1. Issue a formal Notice of Delay to the owner within the contract-required timeframe
  2. Document all acceleration costs as a separate line item for future claim
  3. Reserve the right to seek full time extension AND delay damages / extended general conditions
  4. Do NOT absorb owner-caused acceleration costs without written authorization` : '';

      return JSON.stringify({
        project_name: projectName,
        original_completion_date: input.original_completion_date,
        current_projected_completion: input.current_projected_completion,
        delay_days: delayDays,
        delay_cause: input.delay_cause,
        contract_amount: `$${contractAmount.toLocaleString()}`,
        remaining_work: remainingWork,
        acceleration_budget_available: accelerationBudget != null ? `$${accelerationBudget.toLocaleString()}` : 'Not specified',
        immediate_actions_week_1_2: immediateActions,
        recovery_strategies: recoveryStrategies,
        recommended_approach: recoveryStrategies.filter(s => s.recommended).map(s => s.strategy),
        owner_caused_notice: ownerCausedNotice.trim() || 'N/A — delay is contractor-risk event',
        monitoring: 'Issue weekly 3-week look-ahead schedules. Conduct daily standup on critical path. Report recovery progress to owner weekly until original milestone is recovered.',
      });
    }

    case 'draft_meeting_minutes': {
      const meetingTypeLabels: Record<string, string> = {
        oac: 'OWNER-ARCHITECT-CONTRACTOR (OAC) MEETING',
        preconstruction: 'PRECONSTRUCTION MEETING',
        progress: 'PROGRESS MEETING',
        subcontractor_coordination: 'SUBCONTRACTOR COORDINATION MEETING',
        safety: 'SAFETY MEETING',
        design: 'DESIGN COORDINATION MEETING',
      };
      const meetingTypeKey = String(input.meeting_type).toLowerCase();
      const meetingTypeLabel = meetingTypeLabels[meetingTypeKey] ?? `${String(input.meeting_type).toUpperCase()} MEETING`;
      const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      const attendeeList = String(input.attendees)
        .split(',')
        .map((a, i) => `  ${i + 1}. ${a.trim()}`)
        .join('\n');

      const agendaList = String(input.agenda_items)
        .split(/[,;\n]/)
        .filter(a => a.trim().length > 0)
        .map((item, i) => `  ${i + 1}. ${item.trim()}\n     Discussion: [Notes to be added]\n     Status/Resolution: [Outcome]`)
        .join('\n\n');

      const actionList = String(input.action_items)
        .split(/[,;\n]/)
        .filter(a => a.trim().length > 0)
        .map((item, i) => {
          const trimmed = item.trim();
          return `  ${i + 1}. | ${trimmed.padEnd(50)} | [Responsible Party] | [Due Date]`;
        })
        .join('\n');

      return `
═══════════════════════════════════════
MEETING MINUTES
${meetingTypeLabel}
═══════════════════════════════════════
Project:        ${input.project_name}
Meeting Type:   ${meetingTypeLabel}
Date:           ${input.meeting_date}
Location:       ${input.location ?? '[Location / Conference Call / Video]'}
Minutes By:     [Name / Title]
Distributed:    ${date}

━━━ ATTENDEES ━━━
${attendeeList}

━━━ PREVIOUS ACTION ITEMS STATUS ━━━
  [Review action items from previous meeting — mark COMPLETE, IN PROGRESS, or OPEN]
  All open items from previous meeting are carried forward below.

━━━ AGENDA ITEMS / DISCUSSION ━━━
${agendaList}

━━━ ACTION ITEMS ━━━
  #  | Item                                               | Responsible Party   | Due Date
  ───|────────────────────────────────────────────────────|─────────────────────|──────────
${actionList}

━━━ NEXT MEETING ━━━
${input.next_meeting_date
  ? `  Next meeting scheduled: ${String(input.next_meeting_date)}\n  Location: [To be confirmed]\n  Agenda: [To be distributed 48 hours in advance]`
  : '  Next meeting date: To be determined — coordinator will issue calendar invite'}

━━━ DISTRIBUTION ━━━
  All attendees listed above
  [Project file]
  [Owner representative]
  [Architect of record]

Prepared by: _______________________
Title: _______________________
Date: ${date}

NOTICE: These minutes are considered accurate unless written corrections are submitted within 5 business days of distribution.
═══════════════════════════════════════`;
    }

    default:
      return JSON.stringify({ error: 'Unknown tool' });
  }
}

// Helper for preliminary notice state-specific language
function claimantNoticeText(state: string): string {
  const notices: Record<string, string> = {
    AZ: 'This notice is given pursuant to ARS §33-992.01. Failure to serve this notice may result in loss of lien rights.',
    CA: 'This preliminary notice is given pursuant to California Civil Code §8200. This is NOT a lien. It is a notice that the undersigned has furnished or will furnish labor, services, equipment, or materials.',
    FL: 'This Notice to Owner is given pursuant to Florida Statute §713.06. THIS IS NOT A LIEN. This is a notice that people named below have provided or expect to provide labor, services, or materials for the improvement of your property.',
    TX: 'This notice is given pursuant to Chapter 53, Texas Property Code. NOTICE: If you or your contractor fail to pay a subcontractor or material supplier, the subcontractor or material supplier has a right to file a lien against your property.',
    NV: 'This notice is given pursuant to NRS Chapter 108. THIS IS NOT A LIEN on your property. This is a notice that a person has provided or will provide labor, materials, or equipment for the improvement of your property.',
    WA: 'This notice is given pursuant to RCW 60.04.031. THIS IS NOT A LIEN. Your contractor is required to give you this notice to inform you that people other than your contractor may provide labor, materials, or equipment for the construction work on your property.',
  };
  return notices[state] ?? `This notice is given pursuant to the mechanics lien laws of the State of ${state} to preserve the undersigned's right to file a lien if payment is not received.`;
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!checkRateLimit(user.id)) {
    return Response.json({ error: 'You\'ve hit 150 messages this hour. Limit resets in 60 minutes.' }, { status: 429 });
  }

  try {
    const { messages, memoryContext, styleInstructions, currentPage, projectId } = await req.json();
    const db = createServerClient();

    // Pull rich live data from Supabase in parallel
    const [
      { data: projects },
      { data: bids },
      { data: contacts },
      { data: changeOrders },
      { data: payApps },
      { data: openRfis },
      { data: userProfile },
    ] = await Promise.all([
      db.from('projects')
        .select('id, name, status, contract_amount, start_date, end_date, address, owner_name, percent_complete, retainage_percent')
        .eq('tenant_id', user.tenantId)
        .order('updated_at', { ascending: false })
        .limit(20),
      db.from('bids')
        .select('id, project_name, bid_amount, status, due_date, ai_score')
        .eq('tenant_id', user.tenantId)
        .order('due_date', { ascending: true })
        .limit(10),
      db.from('contacts')
        .select('id, name, company, role, email, phone')
        .eq('tenant_id', user.tenantId)
        .limit(20),
      db.from('change_orders')
        .select('id, project_id, title, status, amount, created_at')
        .eq('tenant_id', user.tenantId)
        .in('status', ['pending', 'submitted', 'under_review'])
        .order('created_at', { ascending: false })
        .limit(10),
      db.from('pay_applications')
        .select('id, project_id, app_number, status, net_payment_due, period_to, submitted_at')
        .order('created_at', { ascending: false })
        .limit(10),
      db.from('rfis')
        .select('id, project_id, rfi_number, subject, status, due_date, created_at')
        .eq('tenant_id', user.tenantId)
        .in('status', ['open', 'pending_response', 'submitted'])
        .order('due_date', { ascending: true })
        .limit(10),
      db.from('user_profiles')
        .select('full_name, company_name')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    // Build structured context for the Sage prompt
    const today = new Date().toISOString().split('T')[0];
    const activeProjects = (projects ?? []).filter((p: any) => p.status === 'active' || p.status === 'in_progress');
    const currentProjectData = projectId
      ? (projects ?? []).find((p: any) => p.id === projectId)
      : null;

    // Per-project computed values
    const projectRFIs = (openRfis ?? []).filter((r: any) => !currentProjectData || r.project_id === currentProjectData.id);
    const overdueRFIs = projectRFIs.filter((r: any) => r.due_date && r.due_date < today).length;
    const projectCOs = (changeOrders ?? []).filter((c: any) => !currentProjectData || c.project_id === currentProjectData.id);
    const pendingCOValue = projectCOs.reduce((sum: number, c: any) => sum + (c.amount ?? 0), 0);
    const projectPayApps = (payApps ?? []).filter((p: any) => !currentProjectData || p.project_id === currentProjectData.id);
    const pendingPayAppsCount = projectPayApps.filter((p: any) => p.status === 'pending' || p.status === 'submitted').length;
    const lastPayApp = projectPayApps[0];

    // Portfolio-wide overdue RFIs
    const allOverdueRFIs = (openRfis ?? []).filter((r: any) => r.due_date && r.due_date < today).length;

    const ctx: SageContext = {
      user: {
        name: (userProfile as any)?.full_name || user.email.split('@')[0],
        email: user.email,
        company: (userProfile as any)?.company_name,
      },
      currentProject: currentProjectData ? {
        id: currentProjectData.id,
        name: currentProjectData.name,
        contractSum: currentProjectData.contract_amount ?? 0,
        status: currentProjectData.status,
        owner: currentProjectData.owner_name,
        startDate: currentProjectData.start_date,
        scheduledCompletion: currentProjectData.end_date,
        percentComplete: currentProjectData.percent_complete,
        openRFIs: projectRFIs.length,
        overdueRFIs,
        openChangeOrders: projectCOs.length,
        pendingCOValue,
        pendingPayApps: pendingPayAppsCount,
        lastPayAppAmount: lastPayApp?.net_payment_due ?? 0,
      } : undefined,
      portfolioSummary: {
        activeProjects: activeProjects.length,
        totalContractValue: activeProjects.reduce((sum: number, p: any) => sum + (p.contract_amount ?? 0), 0),
        openBids: (bids ?? []).filter((b: any) => b.status === 'open' || b.status === 'pending').length,
        pendingPayApps: (payApps ?? []).filter((p: any) => p.status === 'pending' || p.status === 'submitted').length,
        openRFIs: (openRfis ?? []).length,
        overdueRFIs: allOverdueRFIs,
      },
      currentPage: currentPage ?? 'Dashboard',
    };

    const SYSTEM_PROMPT = [
      getAuthenticatedSagePrompt(ctx),
      `
═══════════════════════════════════════
LIVE ACCOUNT DATA
═══════════════════════════════════════

ACTIVE PROJECTS (${projects?.length ?? 0}):
${JSON.stringify(projects ?? [], null, 2)}

ACTIVE BIDS (${bids?.length ?? 0}):
${JSON.stringify(bids ?? [], null, 2)}

CONTACTS (${contacts?.length ?? 0}):
${JSON.stringify(contacts ?? [], null, 2)}

PENDING CHANGE ORDERS (${changeOrders?.length ?? 0}):
${JSON.stringify(changeOrders ?? [], null, 2)}

RECENT PAY APPLICATIONS (${payApps?.length ?? 0}):
${JSON.stringify(payApps ?? [], null, 2)}

OPEN RFIs (${openRfis?.length ?? 0}):
${JSON.stringify(openRfis ?? [], null, 2)}

NAVIGATION PATHS:
  All projects → /app/projects
  Takeoff → /app/projects/{id}/takeoff
  Pay applications → /app/projects/{id}/pay-apps
  Lien waivers → /app/projects/{id}/lien-waivers
  Change orders → /app/projects/{id}/change-orders
  Daily log → /app/projects/{id}/daily-log
  RFIs → /app/projects/{id}/rfis
  Submittals → /app/projects/{id}/submittals
  Bids → /app/bids
  Bid packages → /app/bid-packages
  Contacts → /app/contacts
  Autopilot → /app/autopilot
  Reports → /app/reports
  Settings → /app/settings
  Billing → /app/billing
  AI Takeoff upload → /app/takeoff

TOOL USE GUIDANCE:
- Calculations (pay app, lien deadlines, labor costs, cash flow, estimates) → USE THE TOOL, show real numbers
- Drafting documents (RFI, COR, daily log, lien waiver, prelim notice, claim notice, transmittal) → USE THE TOOL
- After using a tool, present results clearly and offer the next logical step
- Reference the user's actual project names in every response
- If you spot a risk in their data (overdue RFI, pending CO, approaching lien deadline), flag it
`,
      memoryContext ?? '',
      styleInstructions ?? '',
    ].filter(Boolean).join('\n\n');

    const conversationMessages: Anthropic.MessageParam[] = (messages as Array<{ role: 'user' | 'assistant'; content: string }>).slice(-50);

    // ── Agentic loop ───────────────────────────────────────────────────────
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          let currentMessages: Anthropic.MessageParam[] = [...conversationMessages];
          let iterations = 0;

          while (iterations < 8) {
            iterations++;
            const stream = client.messages.stream({
              model: 'claude-sonnet-4-6',
              max_tokens: 4096,
              system: SYSTEM_PROMPT,
              tools: SAGE_TOOLS,
              tool_choice: { type: 'auto' },
              messages: currentMessages,
            });

            let fullText = '';
            let toolUseBlock: { id: string; name: string; input: Record<string, unknown> } | null = null;
            let toolInputJson = '';
            let inToolUse = false;

            for await (const chunk of stream) {
              if (chunk.type === 'content_block_start') {
                if (chunk.content_block.type === 'tool_use') {
                  inToolUse = true;
                  toolUseBlock = { id: chunk.content_block.id, name: chunk.content_block.name, input: {} };
                  toolInputJson = '';
                }
              } else if (chunk.type === 'content_block_delta') {
                if (chunk.delta.type === 'text_delta') {
                  fullText += chunk.delta.text;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`));
                } else if (chunk.delta.type === 'input_json_delta') {
                  toolInputJson += chunk.delta.partial_json;
                }
              } else if (chunk.type === 'content_block_stop' && inToolUse && toolUseBlock) {
                inToolUse = false;
                try { toolUseBlock.input = JSON.parse(toolInputJson); } catch { toolUseBlock.input = {}; }
              } else if (chunk.type === 'message_delta' && chunk.delta.stop_reason === 'tool_use' && toolUseBlock) {
                const toolResult = executeTool(toolUseBlock.name, toolUseBlock.input);
                currentMessages = [
                  ...currentMessages,
                  {
                    role: 'assistant' as const,
                    content: [
                      ...(fullText ? [{ type: 'text' as const, text: fullText }] : []),
                      { type: 'tool_use' as const, id: toolUseBlock.id, name: toolUseBlock.name, input: toolUseBlock.input },
                    ],
                  },
                  {
                    role: 'user' as const,
                    content: [{ type: 'tool_result' as const, tool_use_id: toolUseBlock.id, content: toolResult }],
                  },
                ];
                fullText = '';
                toolUseBlock = null;
                break;
              } else if (chunk.type === 'message_delta' && chunk.delta.stop_reason === 'end_turn') {
                iterations = 999;
              }
            }

            if (iterations >= 999) break;
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          console.error('Sage stream error:', err);
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('CRM chat error:', error);
    return Response.json({ error: 'Sage is unavailable right now. Please try again.' }, { status: 500 });
  }
}
