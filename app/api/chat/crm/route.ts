import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { getUser, createServerClient } from '@/lib/supabase-server';
import { BASE_CONSTRUCTION_KNOWLEDGE, CRM_EXTENSION } from '@/lib/sage-prompts';

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
    const { messages, memoryContext, styleInstructions, currentPage } = await req.json();
    const db = createServerClient();

    // Pull rich live data from Supabase in parallel
    const [
      { data: projects },
      { data: bids },
      { data: contacts },
      { data: changeOrders },
      { data: payApps },
      { data: openRfis },
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
    ]);

    const SYSTEM_PROMPT = `${BASE_CONSTRUCTION_KNOWLEDGE}

${CRM_EXTENSION}

═══════════════════════════════════════
LIVE ACCOUNT DATA — ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
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

CURRENT PAGE: ${currentPage ?? 'unknown'}
USER: ${user.email} | Tenant: ${user.tenantId}

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

${memoryContext ?? ''}
${styleInstructions ?? ''}`;

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
