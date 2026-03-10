-- Migration: 004_documents.sql
-- Document engine tables: generated PDFs, pay apps, lien waivers,
-- notifications, W-9 requests, insurance certs, payroll, and report runs.

-- generated_documents: tracks all generated PDFs
CREATE TABLE IF NOT EXISTS generated_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text,
  tenant_id text,
  doc_type text NOT NULL,
  pdf_url text,
  data_snapshot jsonb DEFAULT '{}',
  status text DEFAULT 'draft',
  created_by text,
  created_at timestamptz DEFAULT now()
);

-- pay_applications: AIA G702/G703 records
CREATE TABLE IF NOT EXISTS pay_applications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text NOT NULL,
  app_number integer NOT NULL,
  period_from date,
  period_to date,
  scheduled_value numeric(14,2) DEFAULT 0,
  prev_completed numeric(14,2) DEFAULT 0,
  this_period numeric(14,2) DEFAULT 0,
  stored_materials numeric(14,2) DEFAULT 0,
  retainage_held numeric(14,2) DEFAULT 0,
  net_payment_due numeric(14,2) DEFAULT 0,
  status text DEFAULT 'draft',
  g702_pdf_url text,
  g703_pdf_url text,
  submitted_at timestamptz,
  certified_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- lien_waivers: tracks all lien waiver documents
CREATE TABLE IF NOT EXISTS lien_waivers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text NOT NULL,
  claimant_name text,
  waiver_type text CHECK (waiver_type IN ('conditional_partial','unconditional_partial','conditional_final','unconditional_final')),
  amount numeric(14,2),
  through_date date,
  state text,
  pdf_url text,
  signed_at timestamptz,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- notifications: in-app notification bell
CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text,
  project_id text,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- w9_requests: W-9 collection portal
CREATE TABLE IF NOT EXISTS w9_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text,
  tenant_id text,
  vendor_name text,
  vendor_email text,
  token text UNIQUE NOT NULL,
  status text DEFAULT 'pending',
  submitted_at timestamptz,
  pdf_url text,
  created_at timestamptz DEFAULT now()
);

-- insurance_certificates: COI tracking
CREATE TABLE IF NOT EXISTS insurance_certificates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text,
  tenant_id text,
  sub_name text NOT NULL,
  sub_id text,
  policy_type text,
  carrier text,
  policy_number text,
  effective_date date,
  expiry_date date NOT NULL,
  coverage_amount numeric(14,2),
  pdf_url text,
  status text DEFAULT 'active',
  last_checked_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- payroll_records: WH-347 certified payroll
CREATE TABLE IF NOT EXISTS payroll_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text NOT NULL,
  tenant_id text,
  week_ending date NOT NULL,
  employee_count integer DEFAULT 0,
  total_gross_wages numeric(14,2) DEFAULT 0,
  pdf_url text,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now()
);

-- report_runs: tracks generated reports
CREATE TABLE IF NOT EXISTS report_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id text,
  project_id text,
  report_type text NOT NULL,
  pdf_url text,
  status text DEFAULT 'completed',
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_generated_docs_project ON generated_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_pay_apps_project ON pay_applications(project_id);
CREATE INDEX IF NOT EXISTS idx_lien_waivers_project ON lien_waivers(project_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id, read);
CREATE INDEX IF NOT EXISTS idx_insurance_expiry ON insurance_certificates(expiry_date, status);
CREATE INDEX IF NOT EXISTS idx_w9_token ON w9_requests(token);
