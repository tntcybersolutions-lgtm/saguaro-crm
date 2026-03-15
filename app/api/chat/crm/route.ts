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
];

// ── Tool execution (pure computation — no external calls) ───────────────────
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
        AZ: {
          prelim_notice: addDays(firstDate, 20),
          lien_filing: scDate ? addDays(scDate, 120) : addDays(lastDate, 120),
          enforce_by: scDate ? addDays(scDate, 300) : addDays(lastDate, 300),
          notes: 'AZ: Prelim notice within 20 days of first furnishing. Lien within 120 days of substantial completion. Enforce within 6 months of filing.',
        },
        CA: {
          prelim_notice: addDays(firstDate, 20),
          lien_filing: addDays(lastDate, 90),
          enforce_by: addDays(lastDate, 180),
          notes: 'CA: 20-day prelim required. Mechanics lien within 90 days of completion/cessation. Enforce within 90 days of filing.',
        },
        TX: {
          prelim_notice: addDays(firstDate, 45),
          lien_filing: addDays(lastDate, 120),
          enforce_by: addDays(lastDate, 240),
          notes: 'TX: Complex monthly notice system. Send notice by 15th of 2nd month following each unpaid month. Lien by 15th of 4th month. Consult TX attorney.',
        },
        FL: {
          prelim_notice: addDays(firstDate, 45),
          lien_filing: addDays(lastDate, 90),
          enforce_by: addDays(lastDate, 455),
          notes: 'FL: Notice to Owner within 45 days of first furnishing. Lien within 90 days. Enforce within 1 year.',
        },
        NV: {
          prelim_notice: addDays(firstDate, 31),
          lien_filing: addDays(lastDate, 90),
          enforce_by: addDays(lastDate, 270),
          notes: 'NV: Prelim notice within 31 days. Lien within 90 days. Enforce within 6 months.',
        },
        CO: {
          prelim_notice: addDays(firstDate, 0),
          lien_filing: addDays(lastDate, 120),
          enforce_by: addDays(lastDate, 300),
          notes: 'CO: No prelim notice for GC. Subs must serve Notice of Intent 10 days before filing. Lien within 4 months (2 months residential).',
        },
        WA: {
          prelim_notice: addDays(firstDate, 60),
          lien_filing: addDays(lastDate, 90),
          enforce_by: addDays(lastDate, 330),
          notes: 'WA: Prelim notice within 60 days. Lien within 90 days. Enforce within 8 months of filing.',
        },
      };

      const result = deadlines[state] ?? {
        prelim_notice: 'Varies — check state law',
        lien_filing: addDays(lastDate, 90),
        enforce_by: 'Varies — check state law',
        notes: `${state}: Specific deadlines not in my immediate data. Approximate lien filing deadline shown. VERIFY with a local construction attorney immediately.`,
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

NOTICE: This document waives rights unconditionally and states that you have been paid for giving up those rights. It is prohibited for a person to require you to sign this document if you have not been paid the payment amount set forth above. If you have not been paid, use a conditional release form.

${isConditional ? '' : ''}

Claimant Signature: _______________________
Printed Name: _______________________
Title: _______________________
Date: ${date}

Notary (if required by state):
State of _________ County of _________
Subscribed and sworn before me this ___ day of __________, 20___
Notary Signature: _______________________ My Commission Expires: __________

NOTE: This form provides general language. ${String(input.state).toUpperCase()} may have specific statutory requirements. Verify with a construction attorney.
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
        workers: workers,
        hours: hours,
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

    default:
      return JSON.stringify({ error: 'Unknown tool' });
  }
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
      { data: recentActivity },
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
      db.from('projects')
        .select('name, status, updated_at')
        .eq('tenant_id', user.tenantId)
        .order('updated_at', { ascending: false })
        .limit(5),
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

RECENT ACTIVITY:
${JSON.stringify(recentActivity ?? [], null, 2)}

CURRENT PAGE THE USER IS ON: ${currentPage ?? 'unknown'}

USER IDENTITY:
- Tenant ID: ${user.tenantId}
- User: ${user.email}

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
- When a user asks for calculations (pay app amounts, lien deadlines, labor costs, savings) → USE THE TOOL, show the real numbers
- When a user asks you to "draft", "write", "create", or "generate" a document → USE THE TOOL, produce the actual document
- After using a tool, present the results clearly and offer the next logical step
- You CAN create draft documents — present them as ready-to-use starting points

${memoryContext ?? ''}
${styleInstructions ?? ''}`;

    const conversationMessages = (messages as Array<{ role: 'user' | 'assistant'; content: string }>).slice(-40);

    // ── Agentic loop: handle tool use ──────────────────────────────────────
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          let currentMessages = [...conversationMessages];
          let iterations = 0;

          while (iterations < 5) {
            iterations++;
            const stream = client.messages.stream({
              model: 'claude-sonnet-4-6',
              max_tokens: 2048,
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
                try {
                  toolUseBlock.input = JSON.parse(toolInputJson);
                } catch { toolUseBlock.input = {}; }
              } else if (chunk.type === 'message_delta' && chunk.delta.stop_reason === 'tool_use' && toolUseBlock) {
                // Execute the tool
                const toolResult = executeTool(toolUseBlock.name, toolUseBlock.input);

                // Add assistant turn + tool result to messages and continue
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
                break; // continue the while loop to get final response
              } else if (chunk.type === 'message_delta' && chunk.delta.stop_reason === 'end_turn') {
                // Normal end — we're done
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
