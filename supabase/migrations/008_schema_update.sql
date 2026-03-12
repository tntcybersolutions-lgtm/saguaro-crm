-- ═══════════════════════════════════════════════════════════
-- 008_schema_update.sql
-- Saguaro CRM — Schema Update
-- Domain: saguarocontrol.net
-- Safe to re-run — all statements are idempotent
-- Run in: Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════
-- TENANTS — add new columns
-- ═══════════════════════════════════════════════════════════

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS domain text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trialing';

-- ═══════════════════════════════════════════════════════════
-- PROJECTS — add flat owner/architect/pm columns
-- (old schema uses owner_entity/architect_entity jsonb,
--  new columns are preferred going forward)
-- ═══════════════════════════════════════════════════════════

ALTER TABLE projects ADD COLUMN IF NOT EXISTS state_jurisdiction text DEFAULT 'AZ';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ntp_date date;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS final_completion_date date;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_email text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_phone text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_address text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS architect_name text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS architect_email text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS gc_name text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pm_name text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pm_email text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pm_phone text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS public_project boolean DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bid_portal_token text DEFAULT gen_random_uuid()::text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_portal_token text DEFAULT gen_random_uuid()::text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS retainage_pct numeric DEFAULT 10;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS original_contract_amount numeric DEFAULT 0;

-- ═══════════════════════════════════════════════════════════
-- SUBCONTRACTORS — add missing columns
-- ═══════════════════════════════════════════════════════════

ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS w9_collected boolean DEFAULT false;

-- ═══════════════════════════════════════════════════════════
-- RFIS — normalize column names
-- ═══════════════════════════════════════════════════════════

ALTER TABLE rfis ADD COLUMN IF NOT EXISTS number integer;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal';
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS answered_at timestamptz;

-- ═══════════════════════════════════════════════════════════
-- PAY APPLICATIONS — ensure all columns exist
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pay_applications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  application_number integer NOT NULL DEFAULT 1,
  period_from date,
  period_to date,
  scheduled_value numeric DEFAULT 0,
  work_completed_prev numeric DEFAULT 0,
  work_completed_this numeric DEFAULT 0,
  stored_materials numeric DEFAULT 0,
  total_completed numeric DEFAULT 0,
  pct_complete numeric DEFAULT 0,
  retainage_amount numeric DEFAULT 0,
  total_earned_less_retainage numeric DEFAULT 0,
  previous_certificates numeric DEFAULT 0,
  net_payment_due numeric DEFAULT 0,
  balance_to_finish numeric DEFAULT 0,
  status text DEFAULT 'draft',
  owner_portal_token text DEFAULT gen_random_uuid()::text,
  submitted_at timestamptz,
  approved_at timestamptz,
  certified_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE pay_applications ADD COLUMN IF NOT EXISTS application_number integer DEFAULT 1;
ALTER TABLE pay_applications ADD COLUMN IF NOT EXISTS period_from date;
ALTER TABLE pay_applications ADD COLUMN IF NOT EXISTS period_to date;
ALTER TABLE pay_applications ADD COLUMN IF NOT EXISTS scheduled_value numeric DEFAULT 0;
ALTER TABLE pay_applications ADD COLUMN IF NOT EXISTS work_completed_prev numeric DEFAULT 0;
ALTER TABLE pay_applications ADD COLUMN IF NOT EXISTS work_completed_this numeric DEFAULT 0;
ALTER TABLE pay_applications ADD COLUMN IF NOT EXISTS stored_materials numeric DEFAULT 0;
ALTER TABLE pay_applications ADD COLUMN IF NOT EXISTS total_completed numeric DEFAULT 0;
ALTER TABLE pay_applications ADD COLUMN IF NOT EXISTS pct_complete numeric DEFAULT 0;
ALTER TABLE pay_applications ADD COLUMN IF NOT EXISTS retainage_amount numeric DEFAULT 0;
ALTER TABLE pay_applications ADD COLUMN IF NOT EXISTS total_earned_less_retainage numeric DEFAULT 0;
ALTER TABLE pay_applications ADD COLUMN IF NOT EXISTS previous_certificates numeric DEFAULT 0;
ALTER TABLE pay_applications ADD COLUMN IF NOT EXISTS net_payment_due numeric DEFAULT 0;
ALTER TABLE pay_applications ADD COLUMN IF NOT EXISTS balance_to_finish numeric DEFAULT 0;
ALTER TABLE pay_applications ADD COLUMN IF NOT EXISTS owner_portal_token text DEFAULT gen_random_uuid()::text;
ALTER TABLE pay_applications ADD COLUMN IF NOT EXISTS certified_at timestamptz;
ALTER TABLE pay_applications ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- ═══════════════════════════════════════════════════════════
-- SCHEDULE OF VALUES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS schedule_of_values (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  pay_application_id uuid REFERENCES pay_applications(id),
  item_number integer,
  description text,
  scheduled_value numeric DEFAULT 0,
  work_completed_prev numeric DEFAULT 0,
  work_completed_this numeric DEFAULT 0,
  stored_materials numeric DEFAULT 0,
  total_completed numeric DEFAULT 0,
  pct_complete numeric DEFAULT 0,
  balance numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- CHANGE ORDERS — add flat columns
-- ═══════════════════════════════════════════════════════════

ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS number integer;

-- ═══════════════════════════════════════════════════════════
-- BID PACKAGES — ensure all columns exist
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bid_packages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  name text,
  trade text,
  csi_division text,
  scope_summary text,
  due_date timestamptz,
  status text DEFAULT 'open',
  jacket_pdf_url text,
  bid_portal_token text DEFAULT gen_random_uuid()::text,
  public_project boolean DEFAULT false,
  bonding_required boolean DEFAULT false,
  prevailing_wage boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS jacket_pdf_url text;
ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS bid_portal_token text DEFAULT gen_random_uuid()::text;
ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS public_project boolean DEFAULT false;
ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS bonding_required boolean DEFAULT false;
ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS prevailing_wage boolean DEFAULT false;

-- ═══════════════════════════════════════════════════════════
-- BID PACKAGE ITEMS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bid_package_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bid_package_id uuid REFERENCES bid_packages(id) ON DELETE CASCADE,
  csi_code text,
  description text,
  quantity numeric,
  unit text,
  unit_cost numeric,
  total_cost numeric,
  created_at timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- BID PACKAGE INVITES — ensure token column exists
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bid_package_invites (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bid_package_id uuid REFERENCES bid_packages(id) ON DELETE CASCADE,
  subcontractor_id uuid REFERENCES subcontractors(id),
  email text,
  token uuid DEFAULT gen_random_uuid(),
  status text DEFAULT 'invited',
  invited_at timestamptz DEFAULT now(),
  viewed_at timestamptz,
  responded_at timestamptz
);

ALTER TABLE bid_package_invites ADD COLUMN IF NOT EXISTS token uuid DEFAULT gen_random_uuid();
ALTER TABLE bid_package_invites ADD COLUMN IF NOT EXISTS viewed_at timestamptz;
ALTER TABLE bid_package_invites ADD COLUMN IF NOT EXISTS responded_at timestamptz;

-- ═══════════════════════════════════════════════════════════
-- BID SUBMISSIONS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bid_submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bid_package_id uuid REFERENCES bid_packages(id) ON DELETE CASCADE,
  subcontractor_id uuid REFERENCES subcontractors(id),
  bid_amount numeric,
  notes text,
  status text DEFAULT 'submitted',
  awarded boolean DEFAULT false,
  submitted_at timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- SUB PERFORMANCE
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sub_performance (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid,
  subcontractor_id uuid REFERENCES subcontractors(id) ON DELETE CASCADE,
  trade text,
  invite_count integer DEFAULT 0,
  win_count integer DEFAULT 0,
  win_rate numeric DEFAULT 0,
  last_project text,
  last_project_date timestamptz,
  rating numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- INSURANCE CERTIFICATES — ensure all columns exist
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS insurance_certificates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  subcontractor_id uuid REFERENCES subcontractors(id),
  policy_type text,
  carrier text,
  policy_number text,
  expiry_date date,
  coverage_amount numeric,
  certificate_url text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE insurance_certificates ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE insurance_certificates ADD COLUMN IF NOT EXISTS coverage_amount numeric;
ALTER TABLE insurance_certificates ADD COLUMN IF NOT EXISTS certificate_url text;

-- ═══════════════════════════════════════════════════════════
-- LIEN WAIVERS — ensure sign_token exists
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lien_waivers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  subcontractor_id uuid REFERENCES subcontractors(id),
  pay_application_id uuid REFERENCES pay_applications(id),
  waiver_type text,
  through_date date,
  amount numeric,
  check_number text,
  status text DEFAULT 'generated',
  signed_at timestamptz,
  pdf_url text,
  sign_token text DEFAULT gen_random_uuid()::text,
  token uuid DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE lien_waivers ADD COLUMN IF NOT EXISTS sign_token text DEFAULT gen_random_uuid()::text;
ALTER TABLE lien_waivers ADD COLUMN IF NOT EXISTS token uuid DEFAULT gen_random_uuid();
ALTER TABLE lien_waivers ADD COLUMN IF NOT EXISTS check_number text;
ALTER TABLE lien_waivers ADD COLUMN IF NOT EXISTS through_date date;

-- ═══════════════════════════════════════════════════════════
-- W9 REQUESTS — ensure token is text (not uuid column)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS w9_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  subcontractor_id uuid REFERENCES subcontractors(id),
  project_id uuid REFERENCES projects(id),
  token text UNIQUE DEFAULT gen_random_uuid()::text,
  status text DEFAULT 'pending',
  sent_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  w9_url text
);

ALTER TABLE w9_requests ADD COLUMN IF NOT EXISTS token text DEFAULT gen_random_uuid()::text;
ALTER TABLE w9_requests ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE w9_requests ADD COLUMN IF NOT EXISTS w9_url text;

-- ═══════════════════════════════════════════════════════════
-- TAKEOFFS — ensure all columns exist
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS takeoffs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  name text,
  file_url text,
  file_name text,
  status text DEFAULT 'pending',
  building_area numeric,
  floor_count integer,
  perimeter numeric,
  total_cost numeric,
  confidence integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE takeoffs ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE takeoffs ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE takeoffs ADD COLUMN IF NOT EXISTS building_area numeric;
ALTER TABLE takeoffs ADD COLUMN IF NOT EXISTS floor_count integer;
ALTER TABLE takeoffs ADD COLUMN IF NOT EXISTS perimeter numeric;
ALTER TABLE takeoffs ADD COLUMN IF NOT EXISTS confidence integer;

-- ═══════════════════════════════════════════════════════════
-- TAKEOFF MATERIALS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS takeoff_materials (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  takeoff_id uuid REFERENCES takeoffs(id) ON DELETE CASCADE,
  csi_code text,
  csi_name text,
  description text,
  quantity numeric,
  unit text,
  unit_cost numeric,
  total_cost numeric,
  labor_hours numeric,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- NOTIFICATIONS — ensure all columns exist
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid,
  user_id uuid,
  type text,
  title text,
  body text,
  link text,
  project_id uuid,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS project_id uuid;

-- ═══════════════════════════════════════════════════════════
-- GENERATED DOCUMENTS — ensure all columns exist
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS generated_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  document_name text,
  storage_path text,
  storage_url text,
  file_size integer,
  version integer DEFAULT 1,
  pay_application_id uuid,
  bid_package_id uuid,
  subcontractor_id uuid,
  change_order_id uuid,
  metadata jsonb DEFAULT '{}',
  generated_by text DEFAULT 'system',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS storage_url text;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS file_size integer;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS pay_application_id uuid;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS bid_package_id uuid;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS subcontractor_id uuid;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS change_order_id uuid;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS generated_by text DEFAULT 'system';

-- ═══════════════════════════════════════════════════════════
-- DOCUMENT QUEUE (retry/async job system)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS document_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event text NOT NULL,
  entity_id uuid,
  payload jsonb DEFAULT '{}',
  status text DEFAULT 'pending',
  retries integer DEFAULT 0,
  max_retries integer DEFAULT 3,
  error text,
  scheduled_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- INDEXES — performance for common queries
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_subcontractors_tenant ON subcontractors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subcontractors_project ON subcontractors(project_id);
CREATE INDEX IF NOT EXISTS idx_pay_apps_project ON pay_applications(project_id);
CREATE INDEX IF NOT EXISTS idx_pay_apps_tenant ON pay_applications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pay_apps_status ON pay_applications(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_change_orders_project ON change_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_rfis_project ON rfis(project_id);
CREATE INDEX IF NOT EXISTS idx_rfis_tenant ON rfis(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rfis_status ON rfis(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_bid_packages_tenant ON bid_packages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bid_packages_project ON bid_packages(project_id);
CREATE INDEX IF NOT EXISTS idx_bid_packages_token ON bid_packages(bid_portal_token);
CREATE INDEX IF NOT EXISTS idx_bid_invites_package ON bid_package_invites(bid_package_id);
CREATE INDEX IF NOT EXISTS idx_bid_submissions_package ON bid_submissions(bid_package_id);
CREATE INDEX IF NOT EXISTS idx_insurance_project ON insurance_certificates(project_id);
CREATE INDEX IF NOT EXISTS idx_insurance_expiry ON insurance_certificates(expiry_date);
CREATE INDEX IF NOT EXISTS idx_lien_waivers_project ON lien_waivers(project_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(tenant_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant ON user_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sov_project ON schedule_of_values(project_id);
CREATE INDEX IF NOT EXISTS idx_takeoff_materials_takeoff ON takeoff_materials(takeoff_id);
CREATE INDEX IF NOT EXISTS idx_doc_queue_status ON document_queue(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_daily_logs_project ON daily_logs(project_id, log_date);
CREATE INDEX IF NOT EXISTS idx_generated_docs_project ON generated_documents(project_id);

-- ═══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — enable on all new tables
-- ═══════════════════════════════════════════════════════════

ALTER TABLE pay_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_of_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_package_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE lien_waivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE w9_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE takeoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE takeoff_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_queue ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- SERVICE ROLE POLICIES — Saguaro app uses service role key
-- which bypasses RLS, so blanket service-role access is fine
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'pay_applications','schedule_of_values','bid_packages','bid_package_items',
    'bid_package_invites','bid_submissions','sub_performance','insurance_certificates',
    'lien_waivers','w9_requests','takeoffs','takeoff_materials',
    'notifications','generated_documents','document_queue'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS service_role_all_%I ON %I',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY service_role_all_%I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════
-- DONE
-- ═══════════════════════════════════════════════════════════
SELECT 'Schema 008 applied successfully' AS result;
