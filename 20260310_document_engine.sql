-- ============================================================
-- SAGUARO DOCUMENT ENGINE MIGRATION
-- Run in Supabase SQL Editor
-- ============================================================

-- Extend projects table with document fields
ALTER TABLE projects ADD COLUMN IF NOT EXISTS retainage_pct DECIMAL(5,2) DEFAULT 10.00;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS prevailing_wage BOOLEAN DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS public_project BOOLEAN DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS state_jurisdiction CHAR(2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_entity JSONB DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS architect_entity JSONB DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS gc_entity JSONB DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_address TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS award_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS substantial_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS final_completion_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS lender_entity JSONB DEFAULT '{}';

-- Pay applications
CREATE TABLE IF NOT EXISTS pay_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  app_number INT NOT NULL,
  period_from DATE,
  period_to DATE,
  original_contract_sum DECIMAL(14,2) DEFAULT 0,
  net_change_orders DECIMAL(14,2) DEFAULT 0,
  prev_completed DECIMAL(14,2) DEFAULT 0,
  this_period DECIMAL(14,2) DEFAULT 0,
  stored_materials DECIMAL(14,2) DEFAULT 0,
  total_completed DECIMAL(14,2) GENERATED ALWAYS AS (prev_completed + this_period + stored_materials) STORED,
  retainage_pct DECIMAL(5,2) DEFAULT 10,
  retainage_held DECIMAL(14,2) DEFAULT 0,
  net_payment_due DECIMAL(14,2) DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','paid','rejected')),
  g702_pdf_url TEXT,
  g703_pdf_url TEXT,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schedule of values (G703 line items)
CREATE TABLE IF NOT EXISTS schedule_of_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  pay_app_id UUID REFERENCES pay_applications(id) ON DELETE SET NULL,
  line_item_no TEXT,
  description TEXT NOT NULL,
  scheduled_value DECIMAL(14,2) DEFAULT 0,
  prev_completed DECIMAL(14,2) DEFAULT 0,
  this_period DECIMAL(14,2) DEFAULT 0,
  stored_materials DECIMAL(14,2) DEFAULT 0,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lien waivers (all 4 types, all states)
CREATE TABLE IF NOT EXISTS lien_waivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  pay_app_id UUID REFERENCES pay_applications(id) ON DELETE SET NULL,
  sub_id UUID,
  waiver_type TEXT NOT NULL CHECK (waiver_type IN ('conditional_partial','unconditional_partial','conditional_final','unconditional_final')),
  state TEXT NOT NULL DEFAULT 'GENERIC',
  claimant TEXT NOT NULL,
  claimant_address TEXT,
  owner_name TEXT,
  through_date DATE,
  amount DECIMAL(14,2),
  check_number TEXT,
  signed_date DATE,
  pdf_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','signed','void')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insurance certificates (ACORD 25)
CREATE TABLE IF NOT EXISTS insurance_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  sub_id UUID,
  sub_name TEXT,
  cert_holder TEXT,
  insurer_a TEXT,
  gl_policy_no TEXT,
  gl_effective DATE,
  gl_expiry DATE,
  gl_each_occurrence DECIMAL(14,2),
  auto_policy_no TEXT,
  auto_effective DATE,
  auto_expiry DATE,
  wc_policy_no TEXT,
  wc_effective DATE,
  wc_expiry DATE,
  umbrella_limit DECIMAL(14,2),
  acord25_pdf_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','active','expiring_soon','expired','missing')),
  uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Certified payroll (WH-347)
CREATE TABLE IF NOT EXISTS certified_payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  week_ending DATE NOT NULL,
  payroll_no INT,
  contractor_name TEXT,
  contractor_address TEXT,
  workers JSONB NOT NULL DEFAULT '[]',
  validation_errors JSONB DEFAULT '[]',
  submitted_at TIMESTAMPTZ,
  wh347_pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- OSHA 300 Log
CREATE TABLE IF NOT EXISTS osha_300_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  case_no SERIAL,
  employee_name TEXT NOT NULL,
  job_title TEXT,
  date_of_injury DATE NOT NULL,
  location TEXT,
  description TEXT,
  classification TEXT NOT NULL,
  days_away INT DEFAULT 0,
  days_restricted INT DEFAULT 0,
  recordable BOOLEAN GENERATED ALWAYS AS (classification NOT LIKE '%First Aid%') STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bonds (bid bond, performance, payment)
CREATE TABLE IF NOT EXISTS bonds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  bond_type TEXT NOT NULL CHECK (bond_type IN ('bid','performance','payment')),
  principal TEXT,
  surety TEXT,
  penal_sum DECIMAL(14,2),
  effective_date DATE,
  bond_number TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- W-9 requests
CREATE TABLE IF NOT EXISTS w9_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  sub_id UUID,
  sub_name TEXT,
  sub_email TEXT,
  token TEXT UNIQUE NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  legal_name TEXT,
  business_name TEXT,
  tax_classification TEXT,
  address TEXT,
  tin TEXT,
  signature_date DATE,
  w9_pdf_url TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Preliminary notices
CREATE TABLE IF NOT EXISTS preliminary_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  sub_id UUID,
  claimant TEXT,
  state TEXT,
  first_furnishing_date DATE,
  deadline DATE,
  sent_date DATE,
  pdf_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','late')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generated documents audit trail
CREATE TABLE IF NOT EXISTS generated_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  doc_number TEXT,
  version INT DEFAULT 1,
  generated_by UUID,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  pdf_url TEXT,
  html_content TEXT,
  data_snapshot JSONB,
  status TEXT DEFAULT 'generated'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pay_apps_project ON pay_applications(project_id);
CREATE INDEX IF NOT EXISTS idx_pay_apps_tenant ON pay_applications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lien_waivers_project ON lien_waivers(project_id);
CREATE INDEX IF NOT EXISTS idx_insurance_project ON insurance_certificates(project_id);
CREATE INDEX IF NOT EXISTS idx_insurance_expiry ON insurance_certificates(gl_expiry, auto_expiry, wc_expiry);
CREATE INDEX IF NOT EXISTS idx_w9_token ON w9_requests(token);
CREATE INDEX IF NOT EXISTS idx_osha_project ON osha_300_log(project_id);

-- RLS Policies
ALTER TABLE pay_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE lien_waivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE certified_payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE osha_300_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE w9_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;

