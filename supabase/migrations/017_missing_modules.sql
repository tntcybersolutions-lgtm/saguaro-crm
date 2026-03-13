-- Migration 017: Missing modules for full Procore parity
-- Tables: timesheets, contracts, todos, incidents, commissioning, closeout, coordination_issues, waste_tracking

-- ============================================================
-- TIMESHEETS (weekly timesheet entries with approval workflow)
-- ============================================================
CREATE TABLE IF NOT EXISTS timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  employee_id UUID REFERENCES user_profiles(id),
  week_ending DATE NOT NULL,
  work_date DATE NOT NULL,
  hours_regular NUMERIC(5,2) DEFAULT 0,
  hours_overtime NUMERIC(5,2) DEFAULT 0,
  hours_double NUMERIC(5,2) DEFAULT 0,
  total_hours NUMERIC(5,2) GENERATED ALWAYS AS (hours_regular + hours_overtime + hours_double) STORED,
  cost_code TEXT,
  location TEXT,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','revision_requested')),
  submitted_at TIMESTAMPTZ,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_timesheets_project ON timesheets(project_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_tenant ON timesheets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_week ON timesheets(project_id, week_ending);
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- CONTRACTS (prime and subcontracts with SOV)
-- ============================================================
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contract_number TEXT,
  title TEXT NOT NULL,
  contract_type TEXT DEFAULT 'subcontract' CHECK (contract_type IN ('prime','subcontract','purchase_order','service_agreement')),
  vendor_name TEXT,
  vendor_email TEXT,
  description TEXT,
  original_amount NUMERIC(14,2) DEFAULT 0,
  approved_changes NUMERIC(14,2) DEFAULT 0,
  revised_amount NUMERIC(14,2) GENERATED ALWAYS AS (original_amount + approved_changes) STORED,
  invoiced_amount NUMERIC(14,2) DEFAULT 0,
  paid_amount NUMERIC(14,2) DEFAULT 0,
  retainage_pct NUMERIC(5,2) DEFAULT 10,
  start_date DATE,
  end_date DATE,
  signed_date DATE,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','pending','executed','complete','terminated','void')),
  scope_of_work TEXT,
  insurance_required BOOLEAN DEFAULT true,
  insurance_verified BOOLEAN DEFAULT false,
  bonding_required BOOLEAN DEFAULT false,
  bonding_verified BOOLEAN DEFAULT false,
  file_url TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contracts_project ON contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON contracts(tenant_id);
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TODOS / ACTION ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT,
  assigned_to_id UUID,
  due_date DATE,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','cancelled')),
  category TEXT DEFAULT 'general',
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  linked_module TEXT,
  linked_id UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_todos_project ON todos(project_id);
CREATE INDEX IF NOT EXISTS idx_todos_tenant ON todos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(project_id, status);
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- INCIDENTS (OSHA-reportable, near misses, property damage)
-- ============================================================
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  incident_number TEXT,
  title TEXT NOT NULL,
  incident_type TEXT DEFAULT 'injury' CHECK (incident_type IN ('injury','illness','near_miss','property_damage','environmental','vehicle','fire','other')),
  incident_date DATE NOT NULL,
  incident_time TIME,
  location TEXT,
  description TEXT NOT NULL,
  severity TEXT DEFAULT 'minor' CHECK (severity IN ('minor','moderate','serious','critical','fatal')),
  injured_person TEXT,
  injured_company TEXT,
  injury_type TEXT,
  body_part TEXT,
  treatment TEXT CHECK (treatment IN ('none','first_aid','medical','hospitalization','fatality')),
  days_away INTEGER DEFAULT 0,
  days_restricted INTEGER DEFAULT 0,
  recordable BOOLEAN DEFAULT false,
  osha_reportable BOOLEAN DEFAULT false,
  witnesses JSONB DEFAULT '[]',
  root_cause TEXT,
  corrective_actions JSONB DEFAULT '[]',
  preventive_measures TEXT,
  investigation_by TEXT,
  investigation_date DATE,
  investigation_notes TEXT,
  photos JSONB DEFAULT '[]',
  status TEXT DEFAULT 'open' CHECK (status IN ('open','investigating','corrective_action','closed','reopened')),
  reported_by TEXT,
  reported_to TEXT,
  supervisor_name TEXT,
  gps_lat NUMERIC(10,7),
  gps_lng NUMERIC(10,7),
  file_url TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incidents_project ON incidents(project_id);
CREATE INDEX IF NOT EXISTS idx_incidents_tenant ON incidents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_incidents_date ON incidents(project_id, incident_date);
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- COMMISSIONING (system startup & testing)
-- ============================================================
CREATE TABLE IF NOT EXISTS commissioning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  system_name TEXT NOT NULL,
  system_type TEXT DEFAULT 'mechanical' CHECK (system_type IN ('mechanical','electrical','plumbing','fire_protection','controls','elevator','specialty','other')),
  location TEXT,
  phase TEXT DEFAULT 'pre_functional' CHECK (phase IN ('pre_functional','functional','seasonal','deferred')),
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','issues_found','passed','failed','deferred')),
  assigned_to TEXT,
  scheduled_date DATE,
  completed_date DATE,
  checklist JSONB DEFAULT '[]',
  test_results JSONB DEFAULT '[]',
  issues JSONB DEFAULT '[]',
  equipment_tag TEXT,
  manufacturer TEXT,
  model_number TEXT,
  serial_number TEXT,
  warranty_start DATE,
  warranty_end DATE,
  notes TEXT,
  photos JSONB DEFAULT '[]',
  file_url TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commissioning_project ON commissioning(project_id);
CREATE INDEX IF NOT EXISTS idx_commissioning_tenant ON commissioning(tenant_id);
ALTER TABLE commissioning ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- CLOSEOUT (warranty, O&M, as-builts, attic stock)
-- ============================================================
CREATE TABLE IF NOT EXISTS closeout (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('warranty','om_manual','as_built','attic_stock','spare_parts','training','certificate','leed_doc','closeout_photo','other')),
  title TEXT NOT NULL,
  description TEXT,
  trade TEXT,
  responsible_party TEXT,
  due_date DATE,
  received_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','submitted','under_review','accepted','rejected','na')),
  warranty_start DATE,
  warranty_end DATE,
  warranty_duration TEXT,
  manufacturer TEXT,
  file_url TEXT,
  file_name TEXT,
  notes TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_closeout_project ON closeout(project_id);
CREATE INDEX IF NOT EXISTS idx_closeout_tenant ON closeout(tenant_id);
CREATE INDEX IF NOT EXISTS idx_closeout_type ON closeout(project_id, item_type);
ALTER TABLE closeout ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- COORDINATION ISSUES (BIM clashes, field conflicts)
-- ============================================================
CREATE TABLE IF NOT EXISTS coordination_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  issue_number TEXT,
  title TEXT NOT NULL,
  description TEXT,
  issue_type TEXT DEFAULT 'field_conflict' CHECK (issue_type IN ('bim_clash','field_conflict','design_conflict','rfi_related','scope_gap','coordination','other')),
  location TEXT,
  drawing_ref TEXT,
  trades_involved JSONB DEFAULT '[]',
  assigned_to TEXT,
  ball_in_court TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open','in_review','resolved','closed','deferred')),
  resolution TEXT,
  resolved_by TEXT,
  resolved_date DATE,
  cost_impact NUMERIC(12,2) DEFAULT 0,
  schedule_impact INTEGER DEFAULT 0,
  linked_rfi_id UUID,
  linked_co_id UUID,
  photos JSONB DEFAULT '[]',
  due_date DATE,
  meeting_date DATE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coord_issues_project ON coordination_issues(project_id);
CREATE INDEX IF NOT EXISTS idx_coord_issues_tenant ON coordination_issues(tenant_id);
ALTER TABLE coordination_issues ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- WASTE TRACKING (environmental compliance, diversion)
-- ============================================================
CREATE TABLE IF NOT EXISTS waste_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ticket_number TEXT,
  waste_date DATE NOT NULL,
  waste_type TEXT NOT NULL CHECK (waste_type IN ('concrete','wood','metal','drywall','roofing','masonry','plastic','cardboard','mixed_c_d','hazardous','soil','asphalt','glass','insulation','other')),
  disposal_method TEXT DEFAULT 'landfill' CHECK (disposal_method IN ('landfill','recycling','reuse','donation','hazardous_facility','composting','other')),
  quantity NUMERIC(10,2) NOT NULL,
  unit TEXT DEFAULT 'tons' CHECK (unit IN ('tons','cubic_yards','pounds','loads','dumpsters','gallons')),
  hauler_name TEXT,
  hauler_ticket TEXT,
  destination_facility TEXT,
  cost NUMERIC(10,2) DEFAULT 0,
  recycled BOOLEAN DEFAULT false,
  diverted BOOLEAN DEFAULT false,
  manifest_number TEXT,
  notes TEXT,
  photos JSONB DEFAULT '[]',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_waste_project ON waste_tracking(project_id);
CREATE INDEX IF NOT EXISTS idx_waste_tenant ON waste_tracking(tenant_id);
CREATE INDEX IF NOT EXISTS idx_waste_date ON waste_tracking(project_id, waste_date);
ALTER TABLE waste_tracking ENABLE ROW LEVEL SECURITY;
