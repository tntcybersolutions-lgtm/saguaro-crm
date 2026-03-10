-- Migration: 005_document_engine_supplement.sql
-- Supplements 004_documents.sql with additional columns and tables
-- needed by the document generation engine (g702, g703, g704, g706,
-- a310, a312, wh347, closeout, lien waivers, bonds, certified payroll).

-- ──────────────────────────────────────────────────────────────────────────────
-- Extend projects table with document-engine columns
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS retainage_pct            numeric(5,2)  DEFAULT 10,
  ADD COLUMN IF NOT EXISTS state_jurisdiction       text,
  ADD COLUMN IF NOT EXISTS public_project           boolean       DEFAULT false,
  ADD COLUMN IF NOT EXISTS prevailing_wage          boolean       DEFAULT false,
  ADD COLUMN IF NOT EXISTS project_number           text,
  ADD COLUMN IF NOT EXISTS bid_date                 date,
  ADD COLUMN IF NOT EXISTS award_date               date,
  ADD COLUMN IF NOT EXISTS substantial_date         date,
  ADD COLUMN IF NOT EXISTS substantial_completion_actual date,
  ADD COLUMN IF NOT EXISTS owner_entity             jsonb         DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS architect_entity         jsonb         DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS gc_entity                jsonb         DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS g704_pdf_url             text,
  ADD COLUMN IF NOT EXISTS created_by               text;

-- ──────────────────────────────────────────────────────────────────────────────
-- Extend lien_waivers table to match generator output
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE lien_waivers
  ADD COLUMN IF NOT EXISTS claimant          text,
  ADD COLUMN IF NOT EXISTS claimant_address  text,
  ADD COLUMN IF NOT EXISTS owner_name        text,
  ADD COLUMN IF NOT EXISTS check_number      text,
  ADD COLUMN IF NOT EXISTS signed_pdf_url    text;

-- ──────────────────────────────────────────────────────────────────────────────
-- Extend pay_applications for generator fields
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE pay_applications
  ADD COLUMN IF NOT EXISTS period_from       date,
  ADD COLUMN IF NOT EXISTS period_to         date;

-- ──────────────────────────────────────────────────────────────────────────────
-- schedule_of_values: G703 line items
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_of_values (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id       text NOT NULL,
  pay_app_id       uuid REFERENCES pay_applications(id) ON DELETE SET NULL,
  item_no          text NOT NULL,
  description      text NOT NULL,
  scheduled_value  numeric(14,2) DEFAULT 0,
  prev_completed   numeric(14,2) DEFAULT 0,
  this_period      numeric(14,2) DEFAULT 0,
  stored_materials numeric(14,2) DEFAULT 0,
  retainage_pct    numeric(5,2)  DEFAULT 10,
  sort_order       integer       DEFAULT 0,
  created_at       timestamptz   DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- bonds: A310 bid bond, A312 performance + payment bonds
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bonds (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id      text NOT NULL,
  bond_type       text NOT NULL CHECK (bond_type IN ('bid', 'performance', 'payment')),
  bond_number     text,
  principal_name  text,
  principal_address text,
  surety_name     text,
  surety_address  text,
  surety_state    text,
  bond_amount     numeric(14,2),
  bid_amount      numeric(14,2),
  contract_amount numeric(14,2),
  issued_date     date,
  pdf_url         text,
  status          text DEFAULT 'issued',
  created_at      timestamptz DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- certified_payroll: WH-347 payroll records (replaces/extends payroll_records)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certified_payroll (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id       text NOT NULL,
  tenant_id        text,
  payroll_number   integer NOT NULL,
  week_ending      date NOT NULL,
  contractor_name  text,
  worker_count     integer DEFAULT 0,
  total_gross_wages numeric(14,2) DEFAULT 0,
  total_net_wages  numeric(14,2) DEFAULT 0,
  pdf_url          text,
  status           text DEFAULT 'draft',
  created_at       timestamptz DEFAULT now(),
  UNIQUE (project_id, payroll_number)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- osha_300_log: OSHA 300 recordable incidents
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS osha_300_log (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id        text NOT NULL,
  tenant_id         text,
  case_number       text,
  employee_name     text NOT NULL,
  job_title         text,
  date_of_injury    date NOT NULL,
  location          text,
  description       text,
  recordable_type   text CHECK (recordable_type IN ('death','days_away','restricted','other_recordable','first_aid')),
  days_away         integer DEFAULT 0,
  days_restricted   integer DEFAULT 0,
  injury_type       text,
  created_at        timestamptz DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- Extend w9_requests with sub_id column (used by onSubOnboarded trigger)
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE w9_requests
  ADD COLUMN IF NOT EXISTS sub_id       text,
  ADD COLUMN IF NOT EXISTS expires_at   timestamptz;

-- ──────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ──────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bonds_project           ON bonds(project_id);
CREATE INDEX IF NOT EXISTS idx_sov_project             ON schedule_of_values(project_id);
CREATE INDEX IF NOT EXISTS idx_certified_payroll_proj  ON certified_payroll(project_id);
CREATE INDEX IF NOT EXISTS idx_osha_300_project        ON osha_300_log(project_id);
CREATE INDEX IF NOT EXISTS idx_lien_waivers_type       ON lien_waivers(project_id, waiver_type);
CREATE INDEX IF NOT EXISTS idx_notifications_user      ON notifications(user_id, read);
