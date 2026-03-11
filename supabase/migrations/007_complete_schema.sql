-- ============================================================
-- 007_complete_schema.sql
-- Saguaro CRM — Complete Production Schema
-- Run in Supabase Dashboard > SQL Editor
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- AUTH / BILLING
-- ============================================================

CREATE TABLE IF NOT EXISTS tenants (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid,
  name          text NOT NULL,
  slug          text UNIQUE,
  plan          text DEFAULT 'trial',
  stripe_customer_id text,
  stripe_subscription_id text,
  trial_ends_at timestamptz DEFAULT (now() + interval '14 days'),
  is_active     boolean DEFAULT true,
  settings      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  user_id       uuid NOT NULL,
  email         text NOT NULL,
  full_name     text,
  role          text DEFAULT 'member',
  avatar_url    text,
  phone         text,
  title         text,
  is_active     boolean DEFAULT true,
  last_seen_at  timestamptz,
  settings      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  stripe_subscription_id text UNIQUE,
  stripe_customer_id text,
  plan          text NOT NULL DEFAULT 'trial',
  status        text NOT NULL DEFAULT 'trialing',
  current_period_start timestamptz,
  current_period_end   timestamptz,
  cancel_at     timestamptz,
  canceled_at   timestamptz,
  trial_end     timestamptz,
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- ============================================================
-- CORE — PROJECTS
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  name                text NOT NULL,
  address             text,
  city                text,
  state               text,
  zip                 text,
  project_number      text,
  project_type        text DEFAULT 'commercial',
  status              text DEFAULT 'active',
  contract_amount     numeric(14,2) DEFAULT 0,
  original_contract   numeric(14,2) DEFAULT 0,
  start_date          date,
  end_date            date,
  substantial_completion_date date,
  description         text,
  owner_entity        jsonb DEFAULT '{}',
  architect_entity    jsonb DEFAULT '{}',
  gc_license          text,
  is_public_project   boolean DEFAULT false,
  prevailing_wage     boolean DEFAULT false,
  metadata            jsonb DEFAULT '{}',
  created_by          uuid,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subcontractors (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  name            text NOT NULL,
  email           text,
  phone           text,
  address         text,
  city            text,
  state           text,
  zip             text,
  trade           text,
  license_number  text,
  license_state   text,
  contract_amount numeric(14,2) DEFAULT 0,
  status          text DEFAULT 'active',
  w9_status       text DEFAULT 'pending',
  w9_url          text,
  rating          numeric(3,1),
  notes           text,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS change_orders (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  co_number       integer,
  title           text NOT NULL,
  description     text,
  reason          text,
  status          text DEFAULT 'pending',
  cost_impact     numeric(14,2) DEFAULT 0,
  schedule_impact integer DEFAULT 0,
  submitted_by    uuid,
  approved_by     uuid,
  approved_at     timestamptz,
  pdf_url         text,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rfis (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  rfi_number      integer,
  subject         text NOT NULL,
  question        text,
  answer          text,
  status          text DEFAULT 'open',
  spec_section    text,
  due_date        date,
  answered_date   date,
  submitted_by    uuid,
  assigned_to     uuid,
  is_overdue      boolean DEFAULT false,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_logs (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  log_date        date NOT NULL,
  weather         text,
  temperature     integer,
  crew_count      integer DEFAULT 0,
  work_performed  text,
  visitors        text,
  issues          text,
  equipment       text,
  materials       text,
  photos          jsonb DEFAULT '[]',
  created_by      uuid,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inspections (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  inspection_type text,
  inspection_date date,
  status          text DEFAULT 'scheduled',
  inspector_name  text,
  result          text,
  notes           text,
  corrective_action text,
  follow_up_date  date,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS punch_list_items (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  location        text,
  description     text NOT NULL,
  trade           text,
  assigned_to     uuid,
  status          text DEFAULT 'open',
  priority        text DEFAULT 'normal',
  due_date        date,
  completed_date  date,
  photo_urls      jsonb DEFAULT '[]',
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_team (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  user_id         uuid,
  name            text,
  email           text,
  role            text,
  company         text,
  phone           text,
  is_primary      boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_files (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  name            text NOT NULL,
  file_url        text,
  file_type       text,
  file_size       bigint,
  category        text,
  uploaded_by     uuid,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_photos (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  url             text NOT NULL,
  thumbnail_url   text,
  caption         text,
  location        text,
  taken_at        timestamptz,
  uploaded_by     uuid,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_messages (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  sender_id       uuid,
  sender_name     text,
  content         text NOT NULL,
  is_system       boolean DEFAULT false,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schedule_items (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  name            text NOT NULL,
  start_date      date,
  end_date        date,
  duration_days   integer,
  percent_complete integer DEFAULT 0,
  predecessor_id  uuid,
  trade           text,
  assigned_to     uuid,
  is_milestone    boolean DEFAULT false,
  status          text DEFAULT 'not_started',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS specs (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  section_number  text,
  title           text,
  content         text,
  file_url        text,
  version         text DEFAULT '1.0',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS submittals (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  submittal_number text,
  title           text NOT NULL,
  spec_section    text,
  trade           text,
  status          text DEFAULT 'pending',
  submitted_date  date,
  required_date   date,
  approved_date   date,
  file_url        text,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS selections (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  category        text,
  item_name       text NOT NULL,
  description     text,
  manufacturer    text,
  model_number    text,
  status          text DEFAULT 'pending',
  approved_by     uuid,
  approved_date   date,
  cost_impact     numeric(14,2) DEFAULT 0,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permits (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  permit_type     text,
  permit_number   text,
  status          text DEFAULT 'pending',
  applied_date    date,
  issued_date     date,
  expires_date    date,
  issuing_authority text,
  fee_amount      numeric(10,2),
  notes           text,
  file_url        text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ============================================================
-- FINANCIAL
-- ============================================================

CREATE TABLE IF NOT EXISTS pay_applications (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  project_id          uuid REFERENCES projects(id) ON DELETE CASCADE,
  app_number          integer NOT NULL,
  period_from         date,
  period_to           date,
  status              text DEFAULT 'draft',
  contract_sum        numeric(14,2) DEFAULT 0,
  change_orders_total numeric(14,2) DEFAULT 0,
  contract_sum_to_date numeric(14,2) DEFAULT 0,
  prev_completed      numeric(14,2) DEFAULT 0,
  this_period         numeric(14,2) DEFAULT 0,
  materials_stored    numeric(14,2) DEFAULT 0,
  total_completed     numeric(14,2) DEFAULT 0,
  percent_complete    numeric(5,2) DEFAULT 0,
  retainage_percent   numeric(5,2) DEFAULT 10,
  retainage_amount    numeric(14,2) DEFAULT 0,
  total_earned_less_retainage numeric(14,2) DEFAULT 0,
  prev_payments       numeric(14,2) DEFAULT 0,
  current_payment_due numeric(14,2) DEFAULT 0,
  submitted_date      date,
  approved_date       date,
  certified_date      date,
  paid_date           date,
  owner_name          text,
  owner_address       text,
  architect_name      text,
  g702_pdf_url        text,
  g703_pdf_url        text,
  notes               text,
  metadata            jsonb DEFAULT '{}',
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schedule_of_values (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  pay_app_id      uuid REFERENCES pay_applications(id) ON DELETE CASCADE,
  line_number     integer,
  description     text NOT NULL,
  scheduled_value numeric(14,2) DEFAULT 0,
  work_from_prev  numeric(14,2) DEFAULT 0,
  work_this_period numeric(14,2) DEFAULT 0,
  materials_stored numeric(14,2) DEFAULT 0,
  total_completed numeric(14,2) DEFAULT 0,
  percent_complete numeric(5,2) DEFAULT 0,
  balance_to_finish numeric(14,2) DEFAULT 0,
  retainage       numeric(14,2) DEFAULT 0,
  csi_code        text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  invoice_number  text,
  vendor_name     text,
  amount          numeric(14,2) DEFAULT 0,
  status          text DEFAULT 'pending',
  due_date        date,
  paid_date       date,
  description     text,
  file_url        text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bills (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  vendor_name     text,
  bill_number     text,
  amount          numeric(14,2) DEFAULT 0,
  status          text DEFAULT 'unpaid',
  due_date        date,
  paid_date       date,
  description     text,
  file_url        text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  po_number       text,
  vendor_name     text,
  vendor_email    text,
  amount          numeric(14,2) DEFAULT 0,
  status          text DEFAULT 'draft',
  issued_date     date,
  required_date   date,
  description     text,
  line_items      jsonb DEFAULT '[]',
  file_url        text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budget_lines (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  csi_code        text,
  description     text NOT NULL,
  budgeted_amount numeric(14,2) DEFAULT 0,
  committed_amount numeric(14,2) DEFAULT 0,
  actual_amount   numeric(14,2) DEFAULT 0,
  forecast_amount numeric(14,2) DEFAULT 0,
  variance        numeric(14,2) DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ============================================================
-- DOCUMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS generated_documents (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  doc_type        text NOT NULL,
  doc_number      text,
  title           text,
  status          text DEFAULT 'generated',
  pdf_url         text,
  storage_path    text,
  file_size       bigint,
  snapshot        jsonb DEFAULT '{}',
  metadata        jsonb DEFAULT '{}',
  generated_by    uuid,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lien_waivers (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  sub_id          uuid REFERENCES subcontractors(id) ON DELETE SET NULL,
  pay_app_id      uuid REFERENCES pay_applications(id) ON DELETE SET NULL,
  waiver_type     text NOT NULL,
  state           text DEFAULT 'AZ',
  amount          numeric(14,2) DEFAULT 0,
  through_date    date,
  status          text DEFAULT 'pending',
  pdf_url         text,
  signed_date     date,
  signed_by       text,
  token           uuid DEFAULT gen_random_uuid(),
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bonds (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  bond_type       text NOT NULL,
  bond_number     text,
  surety_company  text,
  amount          numeric(14,2) DEFAULT 0,
  effective_date  date,
  expiry_date     date,
  status          text DEFAULT 'active',
  pdf_url         text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS insurance_certificates (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  sub_id          uuid REFERENCES subcontractors(id) ON DELETE SET NULL,
  policy_type     text NOT NULL,
  carrier         text,
  policy_number   text,
  effective_date  date,
  expiry_date     date,
  coverage_amount numeric(14,2) DEFAULT 0,
  status          text DEFAULT 'active',
  pdf_url         text,
  reminder_sent   boolean DEFAULT false,
  last_reminder   timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS certified_payroll (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  week_ending     date NOT NULL,
  payroll_number  integer,
  status          text DEFAULT 'draft',
  employees       jsonb DEFAULT '[]',
  total_gross     numeric(14,2) DEFAULT 0,
  total_net       numeric(14,2) DEFAULT 0,
  pdf_url         text,
  submitted_date  date,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS osha_300_log (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  case_number     text,
  employee_name   text,
  job_title       text,
  incident_date   date,
  incident_location text,
  description     text,
  injury_type     text,
  days_away       integer DEFAULT 0,
  days_restricted integer DEFAULT 0,
  recordable      boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS w9_requests (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  sub_id          uuid REFERENCES subcontractors(id) ON DELETE SET NULL,
  vendor_name     text NOT NULL,
  vendor_email    text NOT NULL,
  token           uuid DEFAULT gen_random_uuid() UNIQUE,
  status          text DEFAULT 'pending',
  sent_at         timestamptz,
  submitted_at    timestamptz,
  w9_data         jsonb DEFAULT '{}',
  pdf_url         text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bid_packages (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  name            text NOT NULL,
  trade           text NOT NULL,
  scope_summary   text,
  scope_narrative text,
  csi_codes       jsonb DEFAULT '[]',
  due_date        date,
  bid_instructions text,
  status          text DEFAULT 'draft',
  jacket_pdf_url  text,
  is_public_project boolean DEFAULT false,
  requires_bond   boolean DEFAULT false,
  insurance_requirements jsonb DEFAULT '{}',
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bid_package_items (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  bid_package_id  uuid REFERENCES bid_packages(id) ON DELETE CASCADE,
  description     text NOT NULL,
  quantity        numeric(14,3),
  unit            text,
  unit_price      numeric(14,2),
  total_amount    numeric(14,2),
  csi_code        text,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bid_package_invites (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  bid_package_id  uuid REFERENCES bid_packages(id) ON DELETE CASCADE,
  sub_id          uuid REFERENCES subcontractors(id) ON DELETE SET NULL,
  sub_name        text NOT NULL,
  sub_email       text NOT NULL,
  status          text DEFAULT 'invited',
  token           uuid DEFAULT gen_random_uuid() UNIQUE,
  invited_at      timestamptz DEFAULT now(),
  opened_at       timestamptz,
  declined_at     timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bid_submissions (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  bid_package_id  uuid REFERENCES bid_packages(id) ON DELETE CASCADE,
  invite_id       uuid REFERENCES bid_package_invites(id) ON DELETE SET NULL,
  sub_id          uuid REFERENCES subcontractors(id) ON DELETE SET NULL,
  sub_name        text NOT NULL,
  bid_amount      numeric(14,2) NOT NULL,
  status          text DEFAULT 'submitted',
  notes           text,
  alternates      jsonb DEFAULT '{}',
  file_url        text,
  submitted_at    timestamptz DEFAULT now(),
  awarded_at      timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ============================================================
-- INTELLIGENCE
-- ============================================================

CREATE TABLE IF NOT EXISTS bid_history (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE SET NULL,
  project_name    text,
  project_type    text,
  trade           text,
  bid_amount      numeric(14,2),
  won             boolean,
  margin_percent  numeric(5,2),
  owner_name      text,
  competitor_count integer DEFAULT 0,
  notes           text,
  bid_date        date,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sub_performance (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  sub_id          uuid REFERENCES subcontractors(id) ON DELETE CASCADE,
  sub_name        text NOT NULL,
  trade           text,
  project_count   integer DEFAULT 0,
  invite_count    integer DEFAULT 0,
  bid_count       integer DEFAULT 0,
  win_count       integer DEFAULT 0,
  win_rate        numeric(5,2) DEFAULT 0,
  avg_bid_amount  numeric(14,2) DEFAULT 0,
  avg_rating      numeric(3,1),
  last_project    text,
  last_project_date date,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS takeoffs (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  name            text,
  status          text DEFAULT 'pending',
  drawing_url     text,
  drawing_name    text,
  ai_model        text DEFAULT 'claude-sonnet-4-6',
  raw_output      text,
  total_material  numeric(14,2) DEFAULT 0,
  estimated_labor numeric(14,2) DEFAULT 0,
  suggested_bid   numeric(14,2) DEFAULT 0,
  processing_time_ms integer,
  error_message   text,
  created_by      uuid,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS takeoff_materials (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  takeoff_id      uuid REFERENCES takeoffs(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  csi_code        text,
  csi_division    text,
  description     text NOT NULL,
  quantity        numeric(14,3),
  unit            text,
  unit_cost       numeric(14,2),
  total_cost      numeric(14,2),
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  user_id         uuid,
  type            text NOT NULL,
  title           text NOT NULL,
  body            text,
  link            text,
  project_id      uuid REFERENCES projects(id) ON DELETE SET NULL,
  is_read         boolean DEFAULT false,
  read_at         timestamptz,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_subs_tenant ON subcontractors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subs_project ON subcontractors(project_id);
CREATE INDEX IF NOT EXISTS idx_pay_apps_project ON pay_applications(project_id);
CREATE INDEX IF NOT EXISTS idx_pay_apps_status ON pay_applications(status);
CREATE INDEX IF NOT EXISTS idx_sov_pay_app ON schedule_of_values(pay_app_id);
CREATE INDEX IF NOT EXISTS idx_bid_packages_project ON bid_packages(project_id);
CREATE INDEX IF NOT EXISTS idx_bid_invites_package ON bid_package_invites(bid_package_id);
CREATE INDEX IF NOT EXISTS idx_bid_invites_token ON bid_package_invites(token);
CREATE INDEX IF NOT EXISTS idx_bid_submissions_package ON bid_submissions(bid_package_id);
CREATE INDEX IF NOT EXISTS idx_lien_waivers_project ON lien_waivers(project_id);
CREATE INDEX IF NOT EXISTS idx_lien_waivers_token ON lien_waivers(token);
CREATE INDEX IF NOT EXISTS idx_insurance_project ON insurance_certificates(project_id);
CREATE INDEX IF NOT EXISTS idx_insurance_expiry ON insurance_certificates(expiry_date);
CREATE INDEX IF NOT EXISTS idx_takeoffs_project ON takeoffs(project_id);
CREATE INDEX IF NOT EXISTS idx_takeoff_materials_takeoff ON takeoff_materials(takeoff_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(tenant_id, user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_w9_requests_token ON w9_requests(token);
CREATE INDEX IF NOT EXISTS idx_rfis_project ON rfis(project_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_project ON change_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_generated_docs_project ON generated_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_sub_perf_tenant ON sub_performance(tenant_id, trade);
CREATE INDEX IF NOT EXISTS idx_bid_history_tenant ON bid_history(tenant_id, trade);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE punch_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE submittals ENABLE ROW LEVEL SECURITY;
ALTER TABLE selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_of_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE lien_waivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonds ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE certified_payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE osha_300_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE w9_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_package_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE takeoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE takeoff_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Service role bypass policies (all tables)
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'tenants','user_profiles','subscriptions','projects','subcontractors',
    'change_orders','rfis','daily_logs','inspections','punch_list_items',
    'project_team','project_files','project_photos','project_messages',
    'schedule_items','specs','submittals','selections','permits',
    'pay_applications','schedule_of_values','invoices','bills',
    'purchase_orders','budget_lines','generated_documents','lien_waivers',
    'bonds','insurance_certificates','certified_payroll','osha_300_log',
    'w9_requests','bid_packages','bid_package_items','bid_package_invites',
    'bid_submissions','bid_history','sub_performance','takeoffs',
    'takeoff_materials','notifications'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service_role_bypass" ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY "service_role_bypass" ON %I TO service_role USING (true) WITH CHECK (true)',
      tbl
    );
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation" ON %I', tbl);
    -- For tables with tenant_id column, allow read/write for matching tenant
    EXECUTE format(
      'CREATE POLICY "tenant_isolation" ON %I FOR ALL TO authenticated
       USING (tenant_id = auth.uid())
       WITH CHECK (tenant_id = auth.uid())',
      tbl
    );
  END LOOP;
END $$;

-- Public portal access (no auth) for tokens
CREATE POLICY IF NOT EXISTS "public_w9_token" ON w9_requests FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "public_bid_invite_token" ON bid_package_invites FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "public_lien_waiver_token" ON lien_waivers FOR SELECT USING (true);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'tenants','user_profiles','subscriptions','projects','subcontractors',
    'change_orders','rfis','daily_logs','inspections','punch_list_items',
    'project_team','project_files','project_photos','project_messages',
    'schedule_items','specs','submittals','selections','permits',
    'pay_applications','schedule_of_values','invoices','bills',
    'purchase_orders','budget_lines','generated_documents','lien_waivers',
    'bonds','insurance_certificates','certified_payroll','osha_300_log',
    'w9_requests','bid_packages','bid_package_items','bid_package_invites',
    'bid_submissions','bid_history','sub_performance','takeoffs',
    'takeoff_materials','notifications'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', tbl);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('documents', 'documents', false),
  ('photos', 'photos', true),
  ('drawings', 'drawings', false),
  ('insurance', 'insurance', false),
  ('w9', 'w9', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- DONE
-- ============================================================
-- To run: Supabase Dashboard → SQL Editor → New query → paste → Run
