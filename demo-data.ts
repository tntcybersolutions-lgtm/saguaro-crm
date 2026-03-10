/**
 * demo-data.ts
 *
 * Rich mock data for local preview mode.
 * Used when NEXT_PUBLIC_DEMO_MODE=true so the CRM
 * runs without a real Supabase connection.
 *
 * Every API route checks isDemoMode() and returns this
 * data instead of hitting the database.
 */

export const isDemoMode = () =>
  process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://demo.supabase.co';

export const DEMO_TENANT_ID   = 'demo-tenant-00000000-0000-0000-0000-000000000001';
export const DEMO_PROJECT_ID  = 'demo-project-00000000-0000-0000-0000-000000000001';
export const DEMO_CONTRACT_ID = 'demo-contract-00000000-0000-0000-0000-000000000001';

export const DEMO_PROJECT = {
  id:                  DEMO_PROJECT_ID,
  tenant_id:           DEMO_TENANT_ID,
  name:                'Riverdale Medical Pavilion',
  description:         '24,000 SF medical office building — 2-story Type V-B construction with CMU exterior, TPO roofing, and full MEP buildout.',
  address:             '4711 E Camelback Rd, Phoenix, AZ 85018',
  project_type:        'commercial',
  status:              'active',
  contract_amount:     2_850_000,
  retainage_pct:       10,
  prevailing_wage:     false,
  public_project:      false,
  state_jurisdiction:  'AZ',
  project_number:      'RMP-2026-001',
  budget:              3_100_000,
  bid_date:            '2025-12-01',
  award_date:          '2025-12-15',
  start_date:          '2026-01-15',
  substantial_date:    '2026-09-30',
  owner_entity:        { name: 'Desert Health Partners LLC', address: '2800 N 44th St Suite 300, Phoenix AZ 85008', email: 'dh.partners@example.com' },
  architect_entity:    { name: 'Sonoran Architecture Group', address: '1 E Washington St, Phoenix AZ 85004', email: 'projects@sonarch.example.com' },
  gc_entity:           { name: 'Copper State Developments', address: '3200 W Camelback Rd, Phoenix AZ 85017', email: 'pm@copperstate.example.com' },
  created_at:          '2025-12-16T00:00:00Z',
  updated_at:          '2026-03-01T00:00:00Z',
};

export const DEMO_SUBS = [
  { id: 'sub-001', name: 'Desert Electrical Contractors', primary_email: 'bids@desertelectric.example.com', status: 'active', contract_amount: 385_000, trade: 'Electrical' },
  { id: 'sub-002', name: 'AZ Concrete Solutions',        primary_email: 'est@azconcrete.example.com',      status: 'active', contract_amount: 290_000, trade: 'Concrete'   },
  { id: 'sub-003', name: 'Southwest Roofing & Sheet Metal', primary_email: 'bids@swroofing.example.com',   status: 'active', contract_amount: 195_000, trade: 'Roofing'    },
  { id: 'sub-004', name: 'Rio Framing & Carpentry',      primary_email: 'bids@rioframing.example.com',     status: 'active', contract_amount: 480_000, trade: 'Framing'    },
  { id: 'sub-005', name: 'Pinnacle Mechanical Inc.',     primary_email: 'est@pinnaclemech.example.com',    status: 'active', contract_amount: 340_000, trade: 'HVAC'       },
  { id: 'sub-006', name: 'Blue River Plumbing',          primary_email: 'bids@blueriver.example.com',      status: 'active', contract_amount: 220_000, trade: 'Plumbing'   },
];

export const DEMO_PAY_APPS = [
  {
    id: 'pa-001', application_number: 1, period_from: '2026-01-15', period_to: '2026-01-31',
    contract_sum: 2_850_000, net_change_orders: 0, contract_sum_to_date: 2_850_000,
    total_completed_and_stored: 142_500, retainage_pct: 10, retainage_held: 14_250,
    total_previous_payments: 0, current_payment_due: 128_250,
    status: 'paid', paid_at: '2026-02-14', submitted_at: '2026-02-01',
  },
  {
    id: 'pa-002', application_number: 2, period_from: '2026-02-01', period_to: '2026-02-28',
    contract_sum: 2_850_000, net_change_orders: 45_000, contract_sum_to_date: 2_895_000,
    total_completed_and_stored: 428_500, retainage_pct: 10, retainage_held: 42_850,
    total_previous_payments: 128_250, current_payment_due: 257_400,
    status: 'approved', submitted_at: '2026-03-02',
  },
  {
    id: 'pa-003', application_number: 3, period_from: '2026-03-01', period_to: '2026-03-31',
    contract_sum: 2_850_000, net_change_orders: 45_000, contract_sum_to_date: 2_895_000,
    total_completed_and_stored: 0, retainage_pct: 10, retainage_held: 0,
    total_previous_payments: 385_650, current_payment_due: 0,
    status: 'draft', submitted_at: null,
  },
];

export const DEMO_RFIS = [
  { id: 'rfi-001', number: 'RFI-001', title: 'Electrical outlet conflict at column grid C-4', status: 'answered',    priority: 'high',   response_due_date: '2026-02-10', responded_at: '2026-02-08', cost_impact_amount: 0,      schedule_impact_days: 0, created_at: '2026-02-01' },
  { id: 'rfi-002', number: 'RFI-002', title: 'Structural beam depth at roof level (ref S3.1)',  status: 'under_review', priority: 'urgent', response_due_date: '2026-03-10', responded_at: null,        cost_impact_amount: 28_500, schedule_impact_days: 5, created_at: '2026-02-28' },
  { id: 'rfi-003', number: 'RFI-003', title: 'Confirm TPO membrane color at parapet cap',       status: 'open',       priority: 'normal', response_due_date: '2026-03-15', responded_at: null,        cost_impact_amount: 0,      schedule_impact_days: 0, created_at: '2026-03-05' },
];

export const DEMO_CHANGE_ORDERS = [
  { id: 'co-001', co_number: 'CO-001', title: 'Add electrical panel 200A upgrade per owner request', status: 'approved', cost_impact: 45_000, schedule_impact_days: 3, created_at: '2026-02-10' },
  { id: 'co-002', co_number: 'CO-002', title: 'Skylight addition at reception — architect-directed',  status: 'submitted', cost_impact: 18_200, schedule_impact_days: 0, created_at: '2026-03-02' },
];

export const DEMO_BUDGET_LINES = [
  { id: 'bl-001', cost_code: '03-0000', description: 'Concrete', category: 'subcontract',     original_budget: 310_000, committed_cost: 290_000, actual_cost: 195_000, forecast_cost: 295_000 },
  { id: 'bl-002', cost_code: '06-1000', description: 'Framing',  category: 'subcontract',     original_budget: 500_000, committed_cost: 480_000, actual_cost: 240_000, forecast_cost: 490_000 },
  { id: 'bl-003', cost_code: '07-5000', description: 'Roofing',  category: 'subcontract',     original_budget: 200_000, committed_cost: 195_000, actual_cost: 0,       forecast_cost: 195_000 },
  { id: 'bl-004', cost_code: '26-0000', description: 'Electrical', category: 'subcontract',   original_budget: 400_000, committed_cost: 385_000, actual_cost: 120_000, forecast_cost: 430_000 },
  { id: 'bl-005', cost_code: '23-0000', description: 'HVAC',     category: 'subcontract',     original_budget: 350_000, committed_cost: 340_000, actual_cost: 0,       forecast_cost: 345_000 },
  { id: 'bl-006', cost_code: '22-0000', description: 'Plumbing', category: 'subcontract',     original_budget: 230_000, committed_cost: 220_000, actual_cost: 45_000,  forecast_cost: 225_000 },
  { id: 'bl-007', cost_code: '01-0000', description: 'General Conditions', category: 'general_conditions', original_budget: 285_000, committed_cost: 285_000, actual_cost: 95_000, forecast_cost: 288_000 },
  { id: 'bl-008', cost_code: '01-9000', description: 'GC Overhead & Profit', category: 'overhead', original_budget: 228_000, committed_cost: 228_000, actual_cost: 76_000, forecast_cost: 228_000 },
];

export const DEMO_AUTOPILOT_ALERTS = [
  { id: 'al-001', rule_code: 'RFI_OVERDUE',           title: '⚠️ Overdue RFI: RFI-002',            summary: 'RFI-002 (Structural beam depth) is 4 days past due. Blocking roof framing — schedule risk.', severity: 'high',     status: 'open', entity_type: 'rfi',      created_at: '2026-03-05' },
  { id: 'al-002', rule_code: 'INVOICE_OVERDUE',        title: 'Invoice overdue: Rio Framing',         summary: 'Invoice INV-0042 from Rio Framing — $48,000 balance — 12 days overdue.',                 severity: 'medium',   status: 'open', entity_type: 'invoice',  created_at: '2026-03-03' },
  { id: 'al-003', rule_code: 'PROJECT_RISK_ROLLUP',    title: '🔴 Project Risk: Riverdale Medical',   summary: '2 open high/critical alerts. RFI blocking critical path, invoice overdue.', severity: 'high',     status: 'open', entity_type: 'project',  created_at: '2026-03-06' },
];

export const DEMO_CONTEXT = {
  project:    DEMO_PROJECT,
  owner:      { name: 'Desert Health Partners LLC',  address: '2800 N 44th St Suite 300, Phoenix AZ 85008', email: 'dh.partners@example.com' },
  architect:  { name: 'Sonoran Architecture Group',  address: '1 E Washington St, Phoenix AZ 85004',         email: 'projects@sonarch.example.com' },
  engineer:   null,
  gc:         { name: 'Copper State Developments',   address: '3200 W Camelback Rd, Phoenix AZ 85017',       email: 'pm@copperstate.example.com' },
  lender:     null,
  surety:     null,
  subs:       DEMO_SUBS.map(s => ({ ...s, contract_id: `contract-${s.id}`, retainage_pct: 10, has_insurance_coi: true, has_w9: true })),
  latestPayApp: { ...DEMO_PAY_APPS[1], id: 'pa-002', app_number: 2, period_to: '2026-02-28', total_completed: 428_500, prev_payments: 128_250, net_payment_due: 257_400 },
  financials: {
    total_contract_value:  2_850_000,
    net_change_orders:       45_000,
    contract_sum_to_date:  2_895_000,
    total_billed_to_date:    428_500,
    retainage_held:           42_850,
    total_paid:              128_250,
    balance_remaining:     2_466_500,
    pct_complete:               14.8,
  },
  contracts:          DEMO_SUBS.map((s,i) => ({ id: `contract-${s.id}`, contract_number: `C-2026-00${i+1}`, title: `${s.trade} — ${s.name}`, contract_value: s.contract_amount, status: 'active', sub_name: s.name })),
  rfiSummary:         { total: 3, open: 2, last_number: 'RFI-003', next_number: 'RFI-004' },
  changeOrderSummary: { count: 2, approved_total: 45_000, pending_total: 18_200, last_co_number: 'CO-002', next_co_number: 'CO-003' },
  compliance:         { all_cois_active: true, all_w9s_collected: true, prelim_notices_sent: true, lien_waivers_current: true, certified_payroll_current: true, open_issues: [] },
  today: new Date().toISOString().split('T')[0],
};
