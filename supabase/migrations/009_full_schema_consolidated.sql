-- ═══════════════════════════════════════════════════════════════
-- 009_full_schema_consolidated.sql
-- Saguaro CRM — COMPLETE Production Schema from scratch
-- Domain: saguarocontrol.net
-- Run this if tables do NOT exist yet.
-- Safe to re-run — all CREATE TABLE use IF NOT EXISTS
-- Run in: Supabase → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ───────────────────────────────────────────────────────────────
-- TENANTS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id                     uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name                   text NOT NULL,
  slug                   text UNIQUE,
  domain                 text,
  plan                   text DEFAULT 'trial',
  stripe_customer_id     text,
  stripe_subscription_id text,
  subscription_status    text DEFAULT 'trialing',
  trial_ends_at          timestamptz DEFAULT (now() + interval '14 days'),
  is_active              boolean DEFAULT true,
  settings               jsonb DEFAULT '{}',
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- USER PROFILES
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  email        text NOT NULL,
  full_name    text,
  role         text DEFAULT 'admin',
  avatar_url   text,
  phone        text,
  title        text,
  is_active    boolean DEFAULT true,
  last_seen_at timestamptz,
  settings     jsonb DEFAULT '{}',
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                     uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id              uuid REFERENCES tenants(id) ON DELETE CASCADE,
  stripe_subscription_id text UNIQUE,
  stripe_customer_id     text,
  plan                   text NOT NULL DEFAULT 'trial',
  status                 text NOT NULL DEFAULT 'trialing',
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at              timestamptz,
  canceled_at            timestamptz,
  trial_end              timestamptz,
  metadata               jsonb DEFAULT '{}',
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- PROJECTS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id                       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id                uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name                     text NOT NULL,
  project_number           text,
  address                  text,
  city                     text,
  state                    text,
  zip                      text,
  state_jurisdiction       text DEFAULT 'AZ',
  project_type             text DEFAULT 'commercial',
  status                   text DEFAULT 'active',
  contract_amount          numeric(14,2) DEFAULT 0,
  original_contract        numeric(14,2) DEFAULT 0,
  original_contract_amount numeric(14,2) DEFAULT 0,
  retainage_pct            numeric DEFAULT 10,
  start_date               date,
  end_date                 date,
  ntp_date                 date,
  substantial_date         date,
  final_completion_date    date,
  -- Flat owner/architect/PM fields (preferred over JSONB)
  owner_name               text,
  owner_email              text,
  owner_phone              text,
  owner_address            text,
  architect_name           text,
  architect_email          text,
  gc_name                  text,
  gc_license               text,
  pm_name                  text,
  pm_email                 text,
  pm_phone                 text,
  -- Legacy JSONB (keep for backward compat)
  owner_entity             jsonb DEFAULT '{}',
  architect_entity         jsonb DEFAULT '{}',
  is_public_project        boolean DEFAULT false,
  public_project           boolean DEFAULT false,
  prevailing_wage          boolean DEFAULT false,
  bid_portal_token         text DEFAULT gen_random_uuid()::text,
  owner_portal_token       text DEFAULT gen_random_uuid()::text,
  description              text,
  metadata                 jsonb DEFAULT '{}',
  created_by               uuid,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- SUBCONTRACTORS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subcontractors (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
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
  w9_collected    boolean DEFAULT false,
  w9_url          text,
  rating          numeric(3,1),
  notes           text,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- PAY APPLICATIONS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_applications (
  id                          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id                   uuid REFERENCES tenants(id) ON DELETE CASCADE,
  project_id                  uuid REFERENCES projects(id) ON DELETE CASCADE,
  application_number          integer NOT NULL DEFAULT 1,
  period_from                 date,
  period_to                   date,
  scheduled_value             numeric(14,2) DEFAULT 0,
  work_completed_prev         numeric(14,2) DEFAULT 0,
  work_completed_this         numeric(14,2) DEFAULT 0,
  stored_materials            numeric(14,2) DEFAULT 0,
  total_completed             numeric(14,2) DEFAULT 0,
  pct_complete                numeric DEFAULT 0,
  retainage_amount            numeric(14,2) DEFAULT 0,
  total_earned_less_retainage numeric(14,2) DEFAULT 0,
  previous_certificates       numeric(14,2) DEFAULT 0,
  net_payment_due             numeric(14,2) DEFAULT 0,
  balance_to_finish           numeric(14,2) DEFAULT 0,
  status                      text DEFAULT 'draft',
  owner_portal_token          text DEFAULT gen_random_uuid()::text,
  submitted_at                timestamptz,
  approved_at                 timestamptz,
  certified_at                timestamptz,
  paid_at                     timestamptz,
  metadata                    jsonb DEFAULT '{}',
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- SCHEDULE OF VALUES
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_of_values (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id           uuid REFERENCES projects(id) ON DELETE CASCADE,
  pay_application_id   uuid REFERENCES pay_applications(id) ON DELETE CASCADE,
  item_number          integer,
  description          text,
  scheduled_value      numeric(14,2) DEFAULT 0,
  work_completed_prev  numeric(14,2) DEFAULT 0,
  work_completed_this  numeric(14,2) DEFAULT 0,
  stored_materials     numeric(14,2) DEFAULT 0,
  total_completed      numeric(14,2) DEFAULT 0,
  pct_complete         numeric DEFAULT 0,
  balance              numeric(14,2) DEFAULT 0,
  created_at           timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- CHANGE ORDERS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS change_orders (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  number          integer,
  co_number       integer,
  title           text,
  description     text,
  reason          text,
  status          text DEFAULT 'pending',
  cost_impact     numeric(14,2) DEFAULT 0,
  schedule_impact integer DEFAULT 0,
  submitted_by    text,
  approved_by     text,
  approved_at     timestamptz,
  pdf_url         text,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- RFIS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfis (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid REFERENCES tenants(id) ON DELETE CASCADE,
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  rfi_number   integer,
  number       integer,
  subject      text,
  question     text,
  answer       text,
  status       text DEFAULT 'open',
  priority     text DEFAULT 'normal',
  spec_section text,
  due_date     date,
  answered_at  timestamptz,
  submitted_by text,
  assigned_to  text,
  is_overdue   boolean DEFAULT false,
  metadata     jsonb DEFAULT '{}',
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- DAILY LOGS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_logs (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid REFERENCES tenants(id) ON DELETE CASCADE,
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  log_date     date NOT NULL,
  weather      text,
  temperature  text,
  crew_count   integer DEFAULT 0,
  activities   text,
  work_performed text,
  equipment    text,
  materials    text,
  visitors     text,
  incidents    text,
  issues       text,
  photos       jsonb DEFAULT '[]',
  created_by   uuid,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- PUNCH LIST ITEMS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS punch_list_items (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid REFERENCES tenants(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  location      text,
  description   text NOT NULL,
  trade         text,
  assigned_to   uuid,
  status        text DEFAULT 'open',
  priority      text DEFAULT 'normal',
  due_date      date,
  completed_at  timestamptz,
  photo_urls    jsonb DEFAULT '[]',
  notes         text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- PROJECT TEAM
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_team (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  uuid REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  user_id    uuid,
  name       text,
  email      text,
  role       text,
  company    text,
  phone      text,
  is_primary boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- PROJECT FILES
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_files (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid REFERENCES tenants(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  file_url    text,
  file_type   text,
  file_size   bigint,
  category    text,
  uploaded_by uuid,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- PROJECT MESSAGES
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_messages (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid REFERENCES tenants(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
  sender_id   uuid,
  sender_name text,
  content     text NOT NULL,
  is_system   boolean DEFAULT false,
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- BID PACKAGES
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bid_packages (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        uuid REFERENCES tenants(id) ON DELETE CASCADE,
  project_id       uuid REFERENCES projects(id) ON DELETE CASCADE,
  name             text,
  trade            text,
  csi_division     text,
  scope_summary    text,
  due_date         timestamptz,
  status           text DEFAULT 'open',
  jacket_pdf_url   text,
  bid_portal_token text DEFAULT gen_random_uuid()::text,
  public_project   boolean DEFAULT false,
  bonding_required boolean DEFAULT false,
  prevailing_wage  boolean DEFAULT false,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- BID PACKAGE ITEMS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bid_package_items (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bid_package_id  uuid REFERENCES bid_packages(id) ON DELETE CASCADE,
  csi_code        text,
  description     text,
  quantity        numeric,
  unit            text,
  unit_cost       numeric,
  total_cost      numeric,
  created_at      timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- BID PACKAGE INVITES
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bid_package_invites (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bid_package_id   uuid REFERENCES bid_packages(id) ON DELETE CASCADE,
  subcontractor_id uuid REFERENCES subcontractors(id) ON DELETE CASCADE,
  email            text,
  token            uuid DEFAULT gen_random_uuid(),
  status           text DEFAULT 'invited',
  invited_at       timestamptz DEFAULT now(),
  viewed_at        timestamptz,
  responded_at     timestamptz
);

-- ───────────────────────────────────────────────────────────────
-- BID SUBMISSIONS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bid_submissions (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bid_package_id   uuid REFERENCES bid_packages(id) ON DELETE CASCADE,
  subcontractor_id uuid REFERENCES subcontractors(id) ON DELETE CASCADE,
  bid_amount       numeric,
  notes            text,
  status           text DEFAULT 'submitted',
  awarded          boolean DEFAULT false,
  submitted_at     timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- SUB PERFORMANCE
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sub_performance (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        uuid REFERENCES tenants(id) ON DELETE CASCADE,
  subcontractor_id uuid REFERENCES subcontractors(id) ON DELETE CASCADE,
  trade            text,
  invite_count     integer DEFAULT 0,
  win_count        integer DEFAULT 0,
  win_rate         numeric DEFAULT 0,
  last_project     text,
  last_project_date timestamptz,
  rating           numeric DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- INSURANCE CERTIFICATES
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS insurance_certificates (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        uuid REFERENCES tenants(id) ON DELETE CASCADE,
  project_id       uuid REFERENCES projects(id) ON DELETE CASCADE,
  subcontractor_id uuid REFERENCES subcontractors(id) ON DELETE CASCADE,
  policy_type      text,
  carrier          text,
  policy_number    text,
  expiry_date      date,
  coverage_amount  numeric,
  certificate_url  text,
  status           text DEFAULT 'active',
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- LIEN WAIVERS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lien_waivers (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        uuid REFERENCES tenants(id) ON DELETE CASCADE,
  project_id       uuid REFERENCES projects(id) ON DELETE CASCADE,
  subcontractor_id uuid REFERENCES subcontractors(id) ON DELETE CASCADE,
  pay_application_id uuid REFERENCES pay_applications(id),
  waiver_type      text,
  through_date     date,
  amount           numeric,
  check_number     text,
  status           text DEFAULT 'generated',
  signed_at        timestamptz,
  pdf_url          text,
  sign_token       text DEFAULT gen_random_uuid()::text,
  token            uuid DEFAULT gen_random_uuid(),
  created_at       timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- W9 REQUESTS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS w9_requests (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  subcontractor_id uuid REFERENCES subcontractors(id) ON DELETE CASCADE,
  project_id       uuid REFERENCES projects(id),
  token            text UNIQUE DEFAULT gen_random_uuid()::text,
  status           text DEFAULT 'pending',
  sent_at          timestamptz DEFAULT now(),
  completed_at     timestamptz,
  w9_url           text
);

-- ───────────────────────────────────────────────────────────────
-- GENERATED DOCUMENTS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS generated_documents (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           uuid REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          uuid REFERENCES projects(id) ON DELETE CASCADE,
  document_type       text NOT NULL,
  document_name       text,
  storage_path        text,
  storage_url         text,
  file_size           integer,
  version             integer DEFAULT 1,
  pay_application_id  uuid,
  bid_package_id      uuid,
  subcontractor_id    uuid,
  change_order_id     uuid,
  metadata            jsonb DEFAULT '{}',
  generated_by        text DEFAULT 'system',
  created_at          timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- TAKEOFFS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS takeoffs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid REFERENCES tenants(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  name          text,
  file_url      text,
  file_name     text,
  status        text DEFAULT 'pending',
  building_area numeric,
  floor_count   integer,
  perimeter     numeric,
  total_cost    numeric,
  confidence    integer,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- TAKEOFF MATERIALS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS takeoff_materials (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  takeoff_id  uuid REFERENCES takeoffs(id) ON DELETE CASCADE,
  csi_code    text,
  csi_name    text,
  description text,
  quantity    numeric,
  unit        text,
  unit_cost   numeric,
  total_cost  numeric,
  labor_hours numeric,
  notes       text,
  created_at  timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- NOTIFICATIONS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid,
  type       text,
  title      text,
  body       text,
  link       text,
  project_id uuid,
  read       boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- DOCUMENT QUEUE (retry / async job system)
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_queue (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event        text NOT NULL,
  entity_id    uuid,
  payload      jsonb DEFAULT '{}',
  status       text DEFAULT 'pending',
  retries      integer DEFAULT 0,
  max_retries  integer DEFAULT 3,
  error        text,
  scheduled_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at   timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- LEADS (marketing / contact forms)
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text,
  email      text,
  company    text,
  phone      text,
  message    text,
  source     text DEFAULT 'website',
  created_at timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- INSPECTIONS
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspections (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        uuid REFERENCES tenants(id) ON DELETE CASCADE,
  project_id       uuid REFERENCES projects(id) ON DELETE CASCADE,
  inspection_type  text,
  inspection_date  date,
  status           text DEFAULT 'scheduled',
  inspector_name   text,
  result           text,
  notes            text,
  corrective_action text,
  follow_up_date   date,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────
-- SCHEDULE OF VALUES (alter to add any missing cols)
-- ───────────────────────────────────────────────────────────────
ALTER TABLE schedule_of_values ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- ───────────────────────────────────────────────────────────────
-- INDEXES
-- ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant ON user_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_subcontractors_tenant ON subcontractors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subcontractors_project ON subcontractors(project_id);
CREATE INDEX IF NOT EXISTS idx_pay_apps_project ON pay_applications(project_id);
CREATE INDEX IF NOT EXISTS idx_pay_apps_tenant ON pay_applications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pay_apps_status ON pay_applications(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sov_project ON schedule_of_values(project_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_project ON change_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_rfis_project ON rfis(project_id);
CREATE INDEX IF NOT EXISTS idx_rfis_tenant ON rfis(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rfis_status ON rfis(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_daily_logs_project ON daily_logs(project_id, log_date);
CREATE INDEX IF NOT EXISTS idx_bid_packages_tenant ON bid_packages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bid_packages_project ON bid_packages(project_id);
CREATE INDEX IF NOT EXISTS idx_bid_packages_token ON bid_packages(bid_portal_token);
CREATE INDEX IF NOT EXISTS idx_bid_invites_package ON bid_package_invites(bid_package_id);
CREATE INDEX IF NOT EXISTS idx_bid_submissions_package ON bid_submissions(bid_package_id);
CREATE INDEX IF NOT EXISTS idx_insurance_project ON insurance_certificates(project_id);
CREATE INDEX IF NOT EXISTS idx_insurance_expiry ON insurance_certificates(expiry_date);
CREATE INDEX IF NOT EXISTS idx_lien_waivers_project ON lien_waivers(project_id);
CREATE INDEX IF NOT EXISTS idx_lien_token ON lien_waivers(sign_token);
CREATE INDEX IF NOT EXISTS idx_w9_token ON w9_requests(token);
CREATE INDEX IF NOT EXISTS idx_takeoffs_project ON takeoffs(project_id);
CREATE INDEX IF NOT EXISTS idx_takeoff_materials_takeoff ON takeoff_materials(takeoff_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(tenant_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_generated_docs_project ON generated_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_generated_docs_type ON generated_documents(project_id, document_type);
CREATE INDEX IF NOT EXISTS idx_doc_queue_status ON document_queue(status, scheduled_at);

-- ───────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ───────────────────────────────────────────────────────────────
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_of_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE punch_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_package_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE lien_waivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE w9_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE takeoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE takeoff_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;

-- ───────────────────────────────────────────────────────────────
-- SERVICE ROLE POLICIES (app uses service role key — bypasses RLS)
-- ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'tenants','user_profiles','subscriptions','projects','subcontractors',
    'pay_applications','schedule_of_values','change_orders','rfis','daily_logs',
    'punch_list_items','project_team','project_files','project_messages',
    'bid_packages','bid_package_items','bid_package_invites','bid_submissions',
    'sub_performance','insurance_certificates','lien_waivers','w9_requests',
    'generated_documents','takeoffs','takeoff_materials','notifications',
    'document_queue','leads','inspections'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS svc_%I ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY svc_%I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────
-- DONE
-- ───────────────────────────────────────────────────────────────
SELECT 'Saguaro CRM schema 009 applied successfully — all tables created' AS result;
