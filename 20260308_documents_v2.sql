-- ============================================================
-- Saguaro CRM — Document System V2 (Blueprint Completion)
-- Migration: 20260308_documents_v2.sql
-- Run AFTER: 20260308_documents.sql
-- ============================================================
-- Adds all missing tables from the build blueprint:
--   insurance_certificates  — ACORD 25 COI tracking
--   certified_payroll       — WH-347 prevailing wage
--   osha_300_log            — OSHA recordable incidents
--   bonds                   — Bid, performance, payment bonds
--   w9_requests             — Token-gated vendor W-9 collection
--   owner_approvals         — Token-gated pay app approval workflow
--   sub_portal_sessions     — Token-gated sub access (COI, waivers, W-9)
--   preliminary_notices     — AZ/CA/TX prelim notice tracking
-- Also extends: projects with blueprint fields
-- ============================================================

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ────────────────────────────────────────────────────────────
-- EXTEND PROJECTS with blueprint fields (if not already present)
-- ────────────────────────────────────────────────────────────
alter table public.projects
  add column if not exists contract_amount        numeric(14,2),
  add column if not exists retainage_pct          numeric(5,2) not null default 10,
  add column if not exists prevailing_wage        boolean      not null default false,
  add column if not exists public_project         boolean      not null default false,
  add column if not exists state_jurisdiction     char(2),
  add column if not exists owner_entity           jsonb,      -- {name, address, ein, email, phone}
  add column if not exists architect_entity       jsonb,
  add column if not exists gc_entity              jsonb,
  add column if not exists lender_entity          jsonb,
  add column if not exists surety_entity          jsonb,
  add column if not exists notice_of_commencement text,
  add column if not exists bid_date               date,
  add column if not exists award_date             date,
  add column if not exists notice_to_proceed_date date,
  add column if not exists substantial_date       date,
  add column if not exists final_completion_date  date,
  add column if not exists project_number         text,
  add column if not exists estimated_value        numeric(14,2),
  add column if not exists contract_type          text check (contract_type in (
    'lump_sum','cost_plus_fixed_fee','cost_plus_pct','unit_price','design_build','gmp'));

-- ────────────────────────────────────────────────────────────
-- INSURANCE CERTIFICATES  (ACORD 25 — COI tracking per sub)
-- ────────────────────────────────────────────────────────────
create table if not exists public.insurance_certificates (
  id                  uuid    primary key default gen_random_uuid(),
  tenant_id           uuid    not null,
  project_id          uuid    references public.projects(id) on delete cascade,
  subcontractor_company_id uuid references public.subcontractor_companies(id) on delete set null,
  vendor_name         text    not null,   -- denormalized for non-sub vendors

  -- ACORD 25 fields (extracted by Claude from uploaded PDF)
  insured_name        text,
  insured_address     text,
  cert_holder_name    text,
  cert_holder_address text,

  -- Commercial General Liability
  gl_insurer          text,
  gl_policy_number    text,
  gl_effective        date,
  gl_expiry           date,
  gl_each_occurrence  numeric(14,2),
  gl_general_aggregate numeric(14,2),
  gl_products_completed_ops numeric(14,2),

  -- Auto Liability
  auto_insurer        text,
  auto_policy_number  text,
  auto_effective      date,
  auto_expiry         date,
  auto_combined_limit numeric(14,2),

  -- Workers Compensation
  wc_insurer          text,
  wc_policy_number    text,
  wc_effective        date,
  wc_expiry           date,
  wc_el_each_accident numeric(14,2),

  -- Umbrella / Excess
  umbrella_insurer    text,
  umbrella_policy_number text,
  umbrella_effective  date,
  umbrella_expiry     date,
  umbrella_limit      numeric(14,2),

  -- Professional Liability (E&O — for design-build, architects)
  pl_insurer          text,
  pl_policy_number    text,
  pl_effective        date,
  pl_expiry           date,
  pl_limit            numeric(14,2),

  -- Verification
  additional_insured  boolean not null default false,  -- GC named as AI
  waiver_of_subrogation boolean not null default false,
  primary_noncontributory boolean not null default false,

  -- File
  coi_pdf_url         text,   -- Supabase Storage path
  acord25_version     text,   -- ACORD 25 2016/05 or similar

  -- AI extraction metadata
  ai_extracted        boolean not null default false,
  ai_confidence       text    check (ai_confidence in ('high','medium','low')),
  ai_flags            jsonb   not null default '[]',  -- extracted issues

  -- Status
  status              text    not null default 'pending'
    check (status in ('pending','active','expiring_soon','expired','deficient','rejected')),
  deficiency_notes    text,
  verified_by         uuid,   -- user who verified
  verified_at         timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_insurance_certs_project on public.insurance_certificates (project_id, status);
create index if not exists idx_insurance_certs_expiry  on public.insurance_certificates (gl_expiry, auto_expiry, wc_expiry)
  where status = 'active';
create index if not exists idx_insurance_certs_sub     on public.insurance_certificates (subcontractor_company_id);

-- ────────────────────────────────────────────────────────────
-- CERTIFIED PAYROLL  (WH-347 — required for prevailing wage)
-- ────────────────────────────────────────────────────────────
create table if not exists public.certified_payroll (
  id                  uuid    primary key default gen_random_uuid(),
  tenant_id           uuid    not null,
  project_id          uuid    not null references public.projects(id) on delete cascade,
  contractor_name     text    not null,
  contractor_address  text,
  contractor_license  text,
  payroll_number      integer not null,     -- sequential per project
  week_ending         date    not null,
  project_number      text,
  -- Worker records (JSONB array — WH-347 format)
  workers             jsonb   not null default '[]',
  -- [{
  --   name, address, ssn_last4, work_classification,
  --   days_hours: {mon,tue,wed,thu,fri,sat,sun},
  --   hourly_rate_basic, hourly_rate_ot, fringe_benefits,
  --   gross_wages, deductions: {federal,state,fica,other},
  --   net_wages, check_number
  -- }]
  -- Compliance
  prevailing_wage_compliant boolean,
  violations          jsonb   not null default '[]',  -- [{worker, violation, amount}]
  -- Statement of compliance (Part II of WH-347)
  compliance_statement_signed boolean not null default false,
  authorized_signatory text,
  signed_date         date,
  -- PDF
  wh347_pdf_url       text,
  submitted_at        timestamptz,
  status              text    not null default 'draft'
    check (status in ('draft','validated','submitted','accepted','rejected')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists idx_certified_payroll_week on public.certified_payroll (project_id, contractor_name, week_ending);
create index if not exists idx_certified_payroll_project    on public.certified_payroll (project_id, week_ending desc);

-- ────────────────────────────────────────────────────────────
-- OSHA 300 LOG
-- ────────────────────────────────────────────────────────────
create table if not exists public.osha_300_log (
  id                  uuid    primary key default gen_random_uuid(),
  tenant_id           uuid    not null,
  project_id          uuid    not null references public.projects(id) on delete cascade,
  case_number         integer not null,     -- sequential per project-year
  year                integer not null,
  employee_name       text    not null,
  job_title           text,
  date_of_injury      date    not null,
  work_location       text,
  description         text    not null,
  -- OSHA Classification (check one)
  classification      text    not null
    check (classification in ('death','days_away','restricted_transfer','other_recordable','first_aid_only')),
  days_away_from_work integer not null default 0,
  days_restricted     integer not null default 0,
  -- Injury/illness type
  injury_type         text
    check (injury_type in ('injury','skin_disorder','respiratory','poisoning','hearing_loss','other_illness')),
  -- Reference to safety_incidents
  safety_incident_id  uuid    references public.safety_incidents(id) on delete set null,
  -- OSHA 300A annual summary
  is_privacy_case     boolean not null default false,  -- name withheld per OSHA rule
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists idx_osha_300_case on public.osha_300_log (project_id, year, case_number);
create index if not exists idx_osha_300_project on public.osha_300_log (project_id, year);

-- ────────────────────────────────────────────────────────────
-- BONDS  (bid bond, performance bond, payment bond)
-- ────────────────────────────────────────────────────────────
create table if not exists public.bonds (
  id                  uuid    primary key default gen_random_uuid(),
  tenant_id           uuid    not null,
  project_id          uuid    not null references public.projects(id) on delete cascade,
  contract_id         uuid    references public.contracts(id) on delete set null,
  bond_type           text    not null
    check (bond_type in ('bid','performance','payment','maintenance','supply')),
  -- Parties
  principal_name      text    not null,    -- contractor providing the bond
  principal_address   text,
  surety_name         text    not null,    -- insurance company
  surety_address      text,
  surety_am_best_rating text,             -- A, A-, A+, etc.
  obligee_name        text    not null,    -- project owner
  obligee_address     text,
  -- Bond terms
  bond_number         text,
  penal_sum           numeric(14,2) not null,
  effective_date      date,
  expiry_date         date,
  -- Reference
  contract_amount     numeric(14,2),
  project_description text,
  -- File
  bond_pdf_url        text,
  status              text    not null default 'draft'
    check (status in ('draft','issued','active','released','called','expired')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_bonds_project on public.bonds (project_id, bond_type, status);

-- ────────────────────────────────────────────────────────────
-- W-9 REQUESTS  (token-gated vendor W-9 collection)
-- ────────────────────────────────────────────────────────────
create table if not exists public.w9_requests (
  id                  uuid    primary key default gen_random_uuid(),
  tenant_id           uuid    not null,
  project_id          uuid    references public.projects(id) on delete set null,
  subcontractor_company_id uuid references public.subcontractor_companies(id) on delete set null,
  vendor_name         text    not null,
  vendor_email        text    not null,
  -- Secure access token
  token               text    not null unique default encode(gen_random_bytes(32),'hex'),
  expires_at          timestamptz not null default (now() + interval '30 days'),
  -- W-9 data (collected via self-service portal)
  legal_name          text,
  business_name       text,   -- if different from legal name
  tax_classification  text
    check (tax_classification in ('individual','c_corp','s_corp','partnership','trust','llc_c','llc_s','llc_p','other')),
  address             text,
  city_state_zip      text,
  tin_type            text    check (tin_type in ('ssn','ein')),
  tin_last4           text,   -- last 4 digits only — NEVER store full TIN
  tin_encrypted       text,   -- AES-256 encrypted full TIN if absolutely required
  exempt_payee_code   text,
  exemption_fatca     text,
  -- Signature
  signed_name         text,
  signed_date         date,
  signature_image_url text,   -- e-signature image stored in storage
  ip_address          text,   -- for compliance
  -- W-9 PDF
  w9_pdf_url          text,
  -- Status
  status              text    not null default 'pending'
    check (status in ('pending','completed','expired','voided')),
  completed_at        timestamptz,
  sent_at             timestamptz,
  reminder_sent_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_w9_requests_token   on public.w9_requests (token) where status = 'pending';
create index if not exists idx_w9_requests_vendor  on public.w9_requests (vendor_email, status);
create index if not exists idx_w9_requests_project on public.w9_requests (project_id, status);

-- ────────────────────────────────────────────────────────────
-- OWNER APPROVALS  (token-gated pay app approval portal)
-- ────────────────────────────────────────────────────────────
create table if not exists public.owner_approvals (
  id                  uuid    primary key default gen_random_uuid(),
  tenant_id           uuid    not null,
  project_id          uuid    not null references public.projects(id) on delete cascade,
  pay_application_id  uuid    references public.pay_applications(id) on delete set null,
  -- What's being approved
  approval_type       text    not null
    check (approval_type in ('pay_application','change_order','substantial_completion','final_completion','other')),
  entity_id           uuid,   -- the entity being approved
  title               text    not null,
  amount              numeric(14,2),
  description         text,
  -- Token-gated access
  owner_email         text    not null,
  owner_name          text,
  token               text    not null unique default encode(gen_random_bytes(32),'hex'),
  expires_at          timestamptz not null default (now() + interval '14 days'),
  -- Documents attached to this approval request
  document_urls       jsonb   not null default '[]',
  -- Approval decision
  status              text    not null default 'pending'
    check (status in ('pending','approved','rejected','expired','revoked')),
  decision_at         timestamptz,
  decision_notes      text,
  decision_ip         text,
  -- Notification tracking
  sent_at             timestamptz,
  reminder_sent_at    timestamptz,
  viewed_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_owner_approvals_token   on public.owner_approvals (token) where status = 'pending';
create index if not exists idx_owner_approvals_project on public.owner_approvals (project_id, status);

-- ────────────────────────────────────────────────────────────
-- SUB PORTAL SESSIONS  (token-gated sub access)
-- ────────────────────────────────────────────────────────────
create table if not exists public.sub_portal_sessions (
  id                  uuid    primary key default gen_random_uuid(),
  tenant_id           uuid    not null,
  project_id          uuid    references public.projects(id) on delete cascade,
  subcontractor_company_id uuid references public.subcontractor_companies(id) on delete cascade,
  sub_email           text    not null,
  sub_name            text,
  token               text    not null unique default encode(gen_random_bytes(32),'hex'),
  expires_at          timestamptz not null default (now() + interval '90 days'),
  -- What this sub can access in the portal
  can_access          jsonb   not null default '["lien_waivers","w9","insurance","bid_submission","pay_apps","rfis"]',
  -- Activity
  last_accessed_at    timestamptz,
  access_count        integer not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists idx_sub_portal_token on public.sub_portal_sessions (token) where expires_at > now();

-- ────────────────────────────────────────────────────────────
-- PRELIMINARY NOTICES  (protect lien rights — AZ/CA/TX/NV/FL)
-- ────────────────────────────────────────────────────────────
create table if not exists public.preliminary_notices (
  id                  uuid    primary key default gen_random_uuid(),
  tenant_id           uuid    not null,
  project_id          uuid    not null references public.projects(id) on delete cascade,
  subcontractor_company_id uuid references public.subcontractor_companies(id) on delete set null,
  -- State determines form and deadline
  state               char(2) not null,
  -- Parties
  claimant_name       text    not null,
  claimant_address    text,
  owner_name          text,
  owner_address       text,
  gc_name             text,
  gc_address          text,
  lender_name         text,   -- if known
  lender_address      text,
  -- Project
  project_address     text,
  description_of_work text    not null,
  estimated_value     numeric(14,2),
  -- Dates
  first_furnishing_date date  not null,
  deadline_date       date    not null,    -- statutory deadline
  sent_date           date,
  method_of_service   text    check (method_of_service in ('certified_mail','personal_service','email','overnight','registered_mail')),
  tracking_number     text,   -- USPS tracking
  -- Document
  notice_pdf_url      text,
  ai_generated        boolean not null default false,
  status              text    not null default 'draft'
    check (status in ('draft','sent','confirmed','expired','not_required')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_prelim_notices_project  on public.preliminary_notices (project_id, status);
create index if not exists idx_prelim_notices_deadline on public.preliminary_notices (deadline_date)
  where status = 'draft';

-- ────────────────────────────────────────────────────────────
-- TRIGGERS
-- ────────────────────────────────────────────────────────────

do $$ begin create trigger trg_insurance_certs_updated_at before update on public.insurance_certificates for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_certified_payroll_updated_at before update on public.certified_payroll for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_osha_300_updated_at before update on public.osha_300_log for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_bonds_updated_at before update on public.bonds for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_w9_requests_updated_at before update on public.w9_requests for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_owner_approvals_updated_at before update on public.owner_approvals for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_prelim_notices_updated_at before update on public.preliminary_notices for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;

-- ────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

alter table public.insurance_certificates  enable row level security;
alter table public.certified_payroll       enable row level security;
alter table public.osha_300_log            enable row level security;
alter table public.bonds                   enable row level security;
alter table public.w9_requests             enable row level security;
alter table public.owner_approvals         enable row level security;
alter table public.sub_portal_sessions     enable row level security;
alter table public.preliminary_notices     enable row level security;

create policy if not exists "tenant isolation on insurance_certificates"  on public.insurance_certificates for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());
create policy if not exists "tenant isolation on certified_payroll"       on public.certified_payroll      for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());
create policy if not exists "tenant isolation on osha_300_log"            on public.osha_300_log           for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());
create policy if not exists "tenant isolation on bonds"                   on public.bonds                  for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());
create policy if not exists "tenant isolation on w9_requests"             on public.w9_requests            for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());
create policy if not exists "tenant isolation on owner_approvals"         on public.owner_approvals        for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());
create policy if not exists "tenant isolation on sub_portal_sessions"     on public.sub_portal_sessions    for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());
create policy if not exists "tenant isolation on preliminary_notices"     on public.preliminary_notices    for all using (tenant_id = public.my_tenant_id()) with check (tenant_id = public.my_tenant_id());

-- Public (token-gated, service-role only for write):
-- w9_requests, owner_approvals, sub_portal_sessions are accessed via token
-- The API routes validate tokens and use service-role client — no RLS on reads needed

-- ────────────────────────────────────────────────────────────
-- COMPLIANCE DASHBOARD VIEW
-- ────────────────────────────────────────────────────────────

create or replace view public.project_compliance_dashboard as
select
  p.id                                            as project_id,
  p.tenant_id,
  p.name                                          as project_name,
  p.state_jurisdiction,
  p.prevailing_wage,
  p.public_project,
  -- Insurance
  count(ic.id)                                    as coi_count,
  count(ic.id) filter (where ic.status = 'active') as coi_active,
  count(ic.id) filter (where ic.status in ('expiring_soon','expired')) as coi_expiring,
  min(ic.gl_expiry)                               as next_coi_expiry,
  -- W-9
  count(w9.id)                                    as w9_requested,
  count(w9.id) filter (where w9.status = 'completed') as w9_completed,
  -- Lien waivers
  count(lw.id)                                    as lien_waivers_total,
  count(lw.id) filter (where lw.status = 'signed') as lien_waivers_signed,
  -- Pay apps
  count(pa.id)                                    as pay_apps_total,
  count(pa.id) filter (where pa.status in ('draft','submitted')) as pay_apps_pending,
  -- Prelim notices
  count(pn.id) filter (where pn.status = 'draft' and pn.deadline_date <= current_date + 5) as prelim_notices_urgent,
  -- Certified payroll
  count(cp.id) filter (where p.prevailing_wage and cp.status != 'submitted') as payroll_pending
from public.projects p
left join public.insurance_certificates ic on ic.project_id = p.id
left join public.w9_requests w9            on w9.project_id  = p.id
left join public.lien_waivers lw           on lw.project_id  = p.id
left join public.pay_applications pa       on pa.project_id  = p.id
left join public.preliminary_notices pn    on pn.project_id  = p.id
left join public.certified_payroll cp      on cp.project_id  = p.id
group by p.id, p.tenant_id, p.name, p.state_jurisdiction, p.prevailing_wage, p.public_project;
