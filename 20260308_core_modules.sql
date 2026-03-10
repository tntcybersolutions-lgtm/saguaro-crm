-- ============================================================
-- Saguaro CRM — Core Module Expansion
-- Migration: 20260308_core_modules.sql
-- Adds: contracts, purchase_orders, rfi_transmittals,
--        punch_list_items, equipment, safety_incidents,
--        cost_codes, budget_line_items, project_contacts,
--        bid_jackets
-- ============================================================

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ────────────────────────────────────────────────────────────
-- COST CODES  (CSI-style, per-tenant master list)
-- ────────────────────────────────────────────────────────────
create table if not exists public.cost_codes (
  id          uuid    primary key default gen_random_uuid(),
  tenant_id   uuid    not null,
  code        text    not null,
  description text    not null,
  division    text,                -- CSI division label e.g. '03 – Concrete'
  category    text    not null
    check (category in ('labor','material','equipment','subcontract','general_conditions','overhead')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists idx_cost_codes_tenant
  on public.cost_codes (tenant_id, is_active);

-- ────────────────────────────────────────────────────────────
-- BUDGET LINE ITEMS  (detailed budget by cost code per project)
-- ────────────────────────────────────────────────────────────
create table if not exists public.budget_line_items (
  id               uuid    primary key default gen_random_uuid(),
  tenant_id        uuid    not null,
  project_id       uuid    not null,
  cost_code_id     uuid    references public.cost_codes(id) on delete set null,
  cost_code        text,
  description      text    not null,
  category         text    not null
    check (category in ('labor','material','equipment','subcontract','general_conditions','overhead')),
  original_budget  numeric(14,2) not null default 0,
  approved_changes numeric(14,2) not null default 0,  -- from approved change orders
  committed_cost   numeric(14,2) not null default 0,  -- from contracts / POs
  actual_cost      numeric(14,2) not null default 0,  -- from paid invoices
  forecast_cost    numeric(14,2) not null default 0,  -- projected final cost
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_budget_line_items_project
  on public.budget_line_items (tenant_id, project_id);

-- ────────────────────────────────────────────────────────────
-- PROJECT CONTACTS  (owner, architect, subs, inspector, etc.)
-- ────────────────────────────────────────────────────────────
create table if not exists public.project_contacts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  project_id   uuid not null,
  contact_type text not null
    check (contact_type in (
      'owner','architect','engineer','general_contractor',
      'subcontractor','inspector','lender','surety','other'
    )),
  company_name text not null,
  contact_name text,
  email        text,
  phone        text,
  address      text,
  license_number text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_project_contacts_project
  on public.project_contacts (tenant_id, project_id, contact_type);

-- ────────────────────────────────────────────────────────────
-- CONTRACTS  (executed agreements with subcontractors / vendors)
-- ────────────────────────────────────────────────────────────
create table if not exists public.contracts (
  id                          uuid    primary key default gen_random_uuid(),
  tenant_id                   uuid    not null,
  project_id                  uuid    not null,
  bid_submission_id           uuid    references public.bid_submissions(id) on delete set null,
  subcontractor_company_id    uuid    references public.subcontractor_companies(id) on delete set null,
  contract_number             text    not null,
  title                       text    not null,
  scope_of_work               text,
  contract_value              numeric(14,2) not null default 0,
  executed_value              numeric(14,2) not null default 0,  -- adjusted by change orders
  status                      text    not null default 'draft'
    check (status in ('draft','sent_for_signature','executed','active','substantial_complete','final_complete','terminated')),
  contract_date               date,
  notice_to_proceed_date      date,
  start_date                  date,
  substantial_completion_date date,
  final_completion_date       date,
  actual_completion_date      date,
  retainage_percent           numeric(5,2) not null default 10,
  insurance_verified_at       timestamptz,
  bond_received_at            timestamptz,
  lien_waiver_required        boolean not null default true,
  notes                       text,
  created_by                  uuid,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists idx_contracts_project
  on public.contracts (tenant_id, project_id, status);
create index if not exists idx_contracts_submission
  on public.contracts (bid_submission_id);

-- ────────────────────────────────────────────────────────────
-- CONTRACT MILESTONES  (payment schedule tied to contract)
-- ────────────────────────────────────────────────────────────
create table if not exists public.contract_milestones (
  id                  uuid    primary key default gen_random_uuid(),
  contract_id         uuid    not null references public.contracts(id) on delete cascade,
  sort_order          integer not null default 0,
  title               text    not null,
  description         text,
  percent_of_contract numeric(5,2) not null default 0,
  amount              numeric(14,2) not null default 0,
  due_date            date,
  invoice_id          uuid,                           -- populated when invoice is created
  paid_at             timestamptz,
  status              text not null default 'pending'
    check (status in ('pending','invoiced','approved','paid')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_contract_milestones_contract
  on public.contract_milestones (contract_id, sort_order);

-- ────────────────────────────────────────────────────────────
-- PURCHASE ORDERS
-- ────────────────────────────────────────────────────────────
create table if not exists public.purchase_orders (
  id            uuid    primary key default gen_random_uuid(),
  tenant_id     uuid    not null,
  project_id    uuid    not null,
  contract_id   uuid    references public.contracts(id) on delete set null,
  po_number     text    not null,
  vendor_name   text    not null,
  vendor_email  text,
  description   text,
  cost_code     text,
  amount        numeric(14,2) not null default 0,
  received_amount numeric(14,2) not null default 0,
  status        text not null default 'draft'
    check (status in ('draft','issued','partially_received','received','closed','voided')),
  issued_date   date,
  required_date date,
  received_date date,
  notes         text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_purchase_orders_project
  on public.purchase_orders (tenant_id, project_id, status);

-- ────────────────────────────────────────────────────────────
-- RFI TRANSMITTALS  (formal RFI workflow audit chain)
-- ────────────────────────────────────────────────────────────
create table if not exists public.rfi_transmittals (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null,
  project_id           uuid not null,
  rfi_id               uuid not null,           -- references rfis(id)
  transmittal_number   text not null,           -- e.g. T-001
  transmittal_type     text not null
    check (transmittal_type in (
      'submitted','transmitted','acknowledged',
      'responded','returned_for_info','closed','voided'
    )),
  from_party           text,
  to_party             text,
  subject              text,
  body                 text,
  response_required_by date,
  responded_at         timestamptz,
  response_body        text,
  cost_impact_amount   numeric(14,2),           -- null = no impact
  schedule_impact_days integer,                 -- null = no impact
  attachments          jsonb not null default '[]'::jsonb,
  created_by           uuid,
  created_at           timestamptz not null default now()
);

create index if not exists idx_rfi_transmittals_rfi
  on public.rfi_transmittals (tenant_id, rfi_id, created_at desc);

-- ────────────────────────────────────────────────────────────
-- PUNCH LIST ITEMS  (formal close-out punch list)
-- ────────────────────────────────────────────────────────────
create table if not exists public.punch_list_items (
  id                      uuid    primary key default gen_random_uuid(),
  tenant_id               uuid    not null,
  project_id              uuid    not null,
  inspection_id           uuid,
  item_number             text    not null,     -- e.g. PL-042
  location                text,
  description             text    not null,
  responsible_party       text,
  subcontractor_company_id uuid   references public.subcontractor_companies(id) on delete set null,
  priority                text    not null default 'normal'
    check (priority in ('low','normal','high','critical')),
  status                  text    not null default 'open'
    check (status in ('open','in_progress','ready_for_review','accepted','rejected','waived')),
  photo_ids               jsonb   not null default '[]'::jsonb,
  due_date                date,
  resolved_at             timestamptz,
  resolved_by             uuid,
  rejection_reason        text,
  created_by              uuid,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_punch_list_project
  on public.punch_list_items (tenant_id, project_id, status, priority);

-- ────────────────────────────────────────────────────────────
-- EQUIPMENT  (fleet / rental tracking)
-- ────────────────────────────────────────────────────────────
create table if not exists public.equipment (
  id                    uuid    primary key default gen_random_uuid(),
  tenant_id             uuid    not null,
  name                  text    not null,
  equipment_type        text    not null,       -- e.g. 'excavator','crane','compactor'
  make                  text,
  model                 text,
  year                  integer,
  serial_number         text,
  vin                   text,
  license_plate         text,
  ownership_type        text    not null default 'owned'
    check (ownership_type in ('owned','rented','leased')),
  status                text    not null default 'available'
    check (status in ('available','in_use','maintenance','out_of_service','retired')),
  current_project_id    uuid,
  daily_rate            numeric(10,2),
  purchase_price        numeric(14,2),
  purchase_date         date,
  last_maintenance_date date,
  next_maintenance_date date,
  maintenance_interval_days integer,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_equipment_tenant
  on public.equipment (tenant_id, status);

-- ────────────────────────────────────────────────────────────
-- SAFETY INCIDENTS
-- ────────────────────────────────────────────────────────────
create table if not exists public.safety_incidents (
  id                    uuid    primary key default gen_random_uuid(),
  tenant_id             uuid    not null,
  project_id            uuid    not null,
  incident_number       text    not null,       -- e.g. SI-2026-001
  incident_type         text    not null
    check (incident_type in (
      'near_miss','first_aid','recordable','lost_time',
      'fatality','property_damage','environmental','theft'
    )),
  severity              text    not null default 'low'
    check (severity in ('low','medium','high','critical')),
  incident_date         timestamptz not null,
  location              text,
  weather_conditions    text,
  description           text    not null,
  injured_party_name    text,
  injured_party_role    text,
  body_part_affected    text,
  treatment_type        text
    check (treatment_type in ('none','first_aid','medical','hospitalization')),
  root_cause            text,
  contributing_factors  text,
  corrective_actions    text,
  follow_up_due_date    date,
  osha_reportable       boolean not null default false,
  osha_reported_at      timestamptz,
  osha_case_number      text,
  reported_by           uuid,
  supervisor_notified_at timestamptz,
  status                text    not null default 'open'
    check (status in ('open','investigation','corrective_action','closed')),
  closed_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_safety_incidents_project
  on public.safety_incidents (tenant_id, project_id, status, incident_date desc);

-- ────────────────────────────────────────────────────────────
-- BID JACKETS  (AI-generated bid package document)
-- ────────────────────────────────────────────────────────────
create table if not exists public.bid_jackets (
  id                      uuid    primary key default gen_random_uuid(),
  tenant_id               uuid    not null,
  project_id              uuid    not null,
  bid_package_id          uuid    not null references public.bid_packages(id) on delete cascade,
  ai_generated            boolean not null default false,
  ai_model                text,
  ai_prompt_tokens        integer,
  ai_output_tokens        integer,
  generated_at            timestamptz,
  -- Narrative sections (AI-populated)
  project_summary         text,
  scope_of_work           text,
  work_description        text,
  qualification_requirements text,
  insurance_requirements  text,
  bonding_requirements    text,
  bid_instructions        text,
  invitation_letter       text,
  special_conditions      text,
  -- Structured data (AI-populated, stored as JSONB)
  suggested_subcontractors jsonb not null default '[]'::jsonb,
  -- [{trade: string, companies: string[]}]
  required_documents      jsonb not null default '[]'::jsonb,
  -- [string]
  evaluation_criteria     jsonb not null default '[]'::jsonb,
  -- [{criterion: string, weight_percent: number}]
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (bid_package_id)  -- one jacket per package
);

create index if not exists idx_bid_jackets_project
  on public.bid_jackets (tenant_id, project_id);

-- ────────────────────────────────────────────────────────────
-- TRIGGERS
-- ────────────────────────────────────────────────────────────

do $$ begin
  create trigger trg_budget_line_items_updated_at
    before update on public.budget_line_items
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_project_contacts_updated_at
    before update on public.project_contacts
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_contracts_updated_at
    before update on public.contracts
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_contract_milestones_updated_at
    before update on public.contract_milestones
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_purchase_orders_updated_at
    before update on public.purchase_orders
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_punch_list_items_updated_at
    before update on public.punch_list_items
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_equipment_updated_at
    before update on public.equipment
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_safety_incidents_updated_at
    before update on public.safety_incidents
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_bid_jackets_updated_at
    before update on public.bid_jackets
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- ────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

alter table public.cost_codes           enable row level security;
alter table public.budget_line_items    enable row level security;
alter table public.project_contacts     enable row level security;
alter table public.contracts            enable row level security;
alter table public.contract_milestones  enable row level security;
alter table public.purchase_orders      enable row level security;
alter table public.rfi_transmittals     enable row level security;
alter table public.punch_list_items     enable row level security;
alter table public.equipment            enable row level security;
alter table public.safety_incidents     enable row level security;
alter table public.bid_jackets          enable row level security;

-- Cost codes
create policy if not exists "tenant members manage cost codes"
  on public.cost_codes for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Budget line items
create policy if not exists "tenant members manage budget line items"
  on public.budget_line_items for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Project contacts
create policy if not exists "tenant members manage project contacts"
  on public.project_contacts for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Contracts
create policy if not exists "tenant members manage contracts"
  on public.contracts for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Contract milestones (via parent contract)
create policy if not exists "tenant members manage contract milestones"
  on public.contract_milestones for all
  using (
    contract_id in (
      select id from public.contracts
      where tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    )
  );

-- Purchase orders
create policy if not exists "tenant members manage purchase orders"
  on public.purchase_orders for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- RFI transmittals
create policy if not exists "tenant members manage rfi transmittals"
  on public.rfi_transmittals for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Punch list
create policy if not exists "tenant members manage punch list"
  on public.punch_list_items for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Equipment
create policy if not exists "tenant members manage equipment"
  on public.equipment for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Safety incidents
create policy if not exists "tenant members manage safety incidents"
  on public.safety_incidents for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Bid jackets
create policy if not exists "tenant members manage bid jackets"
  on public.bid_jackets for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ────────────────────────────────────────────────────────────
-- USEFUL VIEWS
-- ────────────────────────────────────────────────────────────

-- Budget summary per project
create or replace view public.project_budget_summary as
select
  tenant_id,
  project_id,
  sum(original_budget)                                    as total_budget,
  sum(original_budget + approved_changes)                 as revised_budget,
  sum(committed_cost)                                     as total_committed,
  sum(actual_cost)                                        as total_actual,
  sum(forecast_cost)                                      as total_forecast,
  sum(original_budget + approved_changes) - sum(forecast_cost) as projected_variance
from public.budget_line_items
group by 1, 2;

-- Contract value summary per project
create or replace view public.project_contract_summary as
select
  tenant_id,
  project_id,
  count(*)                                          as contract_count,
  sum(contract_value)                               as total_contracted,
  sum(executed_value)                               as total_executed,
  count(*) filter (where status = 'executed')       as executed_count,
  count(*) filter (where status = 'active')         as active_count,
  count(*) filter (where status in ('substantial_complete','final_complete')) as complete_count
from public.contracts
group by 1, 2;

-- Safety incident summary per project
create or replace view public.project_safety_summary as
select
  tenant_id,
  project_id,
  count(*)                                                         as total_incidents,
  count(*) filter (where incident_type = 'near_miss')             as near_misses,
  count(*) filter (where incident_type = 'recordable')            as recordables,
  count(*) filter (where incident_type = 'lost_time')             as lost_time_incidents,
  count(*) filter (where osha_reportable)                         as osha_reportable_count,
  count(*) filter (where status != 'closed')                      as open_count
from public.safety_incidents
group by 1, 2;
