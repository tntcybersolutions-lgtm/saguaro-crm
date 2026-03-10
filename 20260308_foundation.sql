-- ============================================================
-- Saguaro CRM — Foundation Tables
-- Migration: 20260308_foundation.sql
-- Run FIRST before all other migrations
-- ============================================================
-- Creates the core tables that all modules depend on.
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ────────────────────────────────────────────────────────────
-- TENANTS  (one per company — the top-level isolation unit)
-- ────────────────────────────────────────────────────────────
create table if not exists public.tenants (
  id                  uuid    primary key default gen_random_uuid(),
  name                text    not null,
  slug                text    not null unique,       -- URL-safe identifier
  logo_url            text,
  -- Sandbox flags
  is_sandbox          boolean not null default false,
  sandbox_expires_at  timestamptz,
  -- White-label / reseller
  reseller_id         uuid,                          -- FK to reseller_accounts.id
  -- Settings
  timezone            text    not null default 'America/Phoenix',
  currency            text    not null default 'USD',
  -- Stripe
  stripe_customer_id  text,
  -- Status
  status              text    not null default 'active'
    check (status in ('active','suspended','canceled','sandbox')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_tenants_slug   on public.tenants (slug);
create index if not exists idx_tenants_status on public.tenants (status);

-- ────────────────────────────────────────────────────────────
-- TENANT MEMBERSHIPS  (users → tenants with roles)
-- ────────────────────────────────────────────────────────────
create table if not exists public.tenant_memberships (
  id          uuid    primary key default gen_random_uuid(),
  tenant_id   uuid    not null references public.tenants(id) on delete cascade,
  user_id     uuid    not null,                      -- Supabase auth user ID
  role        text    not null default 'member'
    check (role in ('owner','admin','manager','member','guest','client','sub')),
  invited_by  uuid,
  invited_at  timestamptz,
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists idx_tenant_memberships_user   on public.tenant_memberships (user_id);
create index if not exists idx_tenant_memberships_tenant on public.tenant_memberships (tenant_id, role);

-- ────────────────────────────────────────────────────────────
-- PROJECTS
-- ────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id              uuid    primary key default gen_random_uuid(),
  tenant_id       uuid    not null references public.tenants(id) on delete cascade,
  name            text    not null,
  description     text,
  address         text,
  location        text,                              -- city/region shorthand
  project_type    text    not null default 'residential'
    check (project_type in ('residential','commercial','industrial','addition','remodel','multifamily','mixed_use','healthcare','education','government')),
  status          text    not null default 'pre_construction'
    check (status in ('pre_construction','bidding','awarded','active','substantial_complete','final_complete','warranty','archived')),
  -- Budget
  budget          numeric(14,2) not null default 0,
  -- Key dates
  bid_date        date,
  award_date      date,
  start_date      date,
  substantial_completion_date date,
  final_completion_date       date,
  -- Sandbox flag
  is_sandbox      boolean not null default false,
  -- AI-generated project data (JSON fields for safety, documents, etc.)
  safety_hazards            jsonb not null default '[]',
  safety_orientation_topics jsonb not null default '[]',
  osha_requirements         jsonb not null default '[]',
  document_folders          jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_projects_tenant on public.projects (tenant_id, status, created_at desc);

-- ────────────────────────────────────────────────────────────
-- SCHEDULE TASKS
-- ────────────────────────────────────────────────────────────
create table if not exists public.schedule_tasks (
  id                    uuid    primary key default gen_random_uuid(),
  tenant_id             uuid    not null,
  project_id            uuid    not null references public.projects(id) on delete cascade,
  name                  text    not null,
  description           text,
  phase                 text,
  assigned_trade        text,
  -- Dates
  start_date            date,
  finish_date           date,
  baseline_start_date   date,
  baseline_finish_date  date,
  actual_start_date     date,
  actual_finish_date    date,
  -- Duration
  duration_days         integer,
  -- Progress
  percent_complete      numeric(5,2) not null default 0,
  status                text not null default 'not_started'
    check (status in ('not_started','in_progress','complete','delayed','blocked')),
  -- Critical path
  is_critical_path      boolean not null default false,
  is_milestone          boolean not null default false,
  -- Dependencies (array of task IDs)
  predecessor_ids       jsonb   not null default '[]',
  -- Auto-generated by AI
  auto_generated        boolean not null default false,
  sort_order            integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_schedule_tasks_project on public.schedule_tasks (project_id, sort_order);
create index if not exists idx_schedule_tasks_critical on public.schedule_tasks (project_id, is_critical_path)
  where is_critical_path = true;

-- ────────────────────────────────────────────────────────────
-- SCHEDULE ANALYTICS  (variance tracking per task)
-- ────────────────────────────────────────────────────────────
create table if not exists public.schedule_analytics (
  id              uuid    primary key default gen_random_uuid(),
  task_id         uuid    not null references public.schedule_tasks(id) on delete cascade,
  baseline_date   date,
  actual_date     date,
  variance_days   integer,
  percent_complete numeric(5,2) not null default 0,
  created_at      timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- RFIs
-- ────────────────────────────────────────────────────────────
create table if not exists public.rfis (
  id                          uuid    primary key default gen_random_uuid(),
  tenant_id                   uuid    not null,
  project_id                  uuid    not null references public.projects(id) on delete cascade,
  number                      text    not null,       -- e.g. RFI-001
  title                       text    not null,
  description                 text,
  status                      text    not null default 'open'
    check (status in ('open','under_review','answered','closed','voided')),
  priority                    text    not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  assigned_to                 text,                   -- email or name
  due_date                    date,
  response_due_date           date,
  drawing_reference           text,
  specification_section       text,
  response                    text,
  responded_at                timestamptz,
  closed_at                   timestamptz,
  cost_impact_potential       numeric(14,2),
  cost_impact_amount          numeric(14,2),
  schedule_impact_potential_days integer,
  schedule_impact_days        integer,
  created_by                  uuid,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists idx_rfis_project on public.rfis (project_id, status, created_at desc);
create index if not exists idx_rfis_due     on public.rfis (tenant_id, response_due_date)
  where status in ('open','under_review');

-- ────────────────────────────────────────────────────────────
-- INVOICES
-- ────────────────────────────────────────────────────────────
create table if not exists public.invoices (
  id              uuid    primary key default gen_random_uuid(),
  tenant_id       uuid    not null,
  project_id      uuid    not null references public.projects(id) on delete cascade,
  invoice_number  text    not null,
  invoice_type    text    not null default 'owner'
    check (invoice_type in ('owner','sub','vendor','internal')),
  from_party      text,
  to_party        text,
  status          text    not null default 'draft'
    check (status in ('draft','sent','approved','partially_paid','paid','overdue','voided')),
  amount          numeric(14,2) not null default 0,
  amount_paid     numeric(14,2) not null default 0,
  balance_due     numeric(14,2) generated always as (amount - amount_paid) stored,
  due_date        date,
  paid_at         timestamptz,
  period_start    date,
  period_end      date,
  notes           text,
  quickbooks_id   text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_invoices_project on public.invoices (project_id, status);
create index if not exists idx_invoices_due     on public.invoices (tenant_id, due_date)
  where status in ('sent','approved','overdue');

-- ────────────────────────────────────────────────────────────
-- CHANGE ORDERS
-- ────────────────────────────────────────────────────────────
create table if not exists public.change_orders (
  id              uuid    primary key default gen_random_uuid(),
  tenant_id       uuid    not null,
  project_id      uuid    not null references public.projects(id) on delete cascade,
  co_number       text    not null,
  title           text    not null,
  description     text,
  status          text    not null default 'draft'
    check (status in ('draft','submitted','approved','rejected','voided')),
  cost_impact     numeric(14,2) not null default 0,
  schedule_impact_days integer not null default 0,
  submitted_at    timestamptz,
  approved_at     timestamptz,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_change_orders_project on public.change_orders (project_id, status);

-- ────────────────────────────────────────────────────────────
-- DAILY LOGS
-- ────────────────────────────────────────────────────────────
create table if not exists public.daily_logs (
  id              uuid    primary key default gen_random_uuid(),
  tenant_id       uuid    not null,
  project_id      uuid    not null references public.projects(id) on delete cascade,
  log_date        date    not null,
  weather         text,
  temperature_f   integer,
  workers_on_site integer,
  work_performed  text,
  delays          text,
  visitors        text,
  safety_notes    text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_daily_logs_project on public.daily_logs (project_id, log_date desc);

-- ────────────────────────────────────────────────────────────
-- FIELD ISSUES
-- ────────────────────────────────────────────────────────────
create table if not exists public.field_issues (
  id              uuid    primary key default gen_random_uuid(),
  tenant_id       uuid    not null,
  project_id      uuid    not null references public.projects(id) on delete cascade,
  issue_number    text    not null,
  title           text    not null,
  description     text,
  severity        text    not null default 'medium'
    check (severity in ('low','medium','high','critical')),
  status          text    not null default 'open'
    check (status in ('open','in_progress','resolved','closed','wont_fix')),
  location        text,
  reported_by     uuid,
  assigned_to     uuid,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_field_issues_project on public.field_issues (project_id, status, severity);

-- ────────────────────────────────────────────────────────────
-- PROJECT PHOTOS
-- ────────────────────────────────────────────────────────────
create table if not exists public.project_photos (
  id              uuid    primary key default gen_random_uuid(),
  tenant_id       uuid    not null,
  project_id      uuid    not null references public.projects(id) on delete cascade,
  file_path       text    not null,
  file_name       text,
  file_size       bigint,
  content_type    text    default 'image/jpeg',
  entity_type     text,       -- rfi, field_issue, daily_log, etc.
  entity_id       uuid,
  gps_latitude    numeric(10,6),
  gps_longitude   numeric(10,6),
  ai_tags         jsonb   not null default '[]',
  taken_at        timestamptz,
  uploaded_by     uuid,
  created_at      timestamptz not null default now()
);

create index if not exists idx_project_photos_project on public.project_photos (project_id, created_at desc);

-- ────────────────────────────────────────────────────────────
-- DRAWINGS
-- ────────────────────────────────────────────────────────────
create table if not exists public.drawings (
  id              uuid    primary key default gen_random_uuid(),
  tenant_id       uuid    not null,
  project_id      uuid    not null references public.projects(id) on delete cascade,
  sheet_number    text    not null,   -- A1.0, S2.1, etc.
  title           text    not null,
  discipline      text,               -- Architectural, Structural, MEP, etc.
  revision        text    not null default '0',
  file_path       text,
  file_size       bigint,
  uploaded_by     uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_drawings_project on public.drawings (project_id, discipline, sheet_number);

-- ────────────────────────────────────────────────────────────
-- INSPECTIONS
-- ────────────────────────────────────────────────────────────
create table if not exists public.inspections (
  id              uuid    primary key default gen_random_uuid(),
  tenant_id       uuid    not null,
  project_id      uuid    not null references public.projects(id) on delete cascade,
  inspection_type text    not null,
  phase           text,
  description     text,
  status          text    not null default 'scheduled'
    check (status in ('scheduled','passed','failed','conditional','canceled')),
  inspector_name  text,
  inspector_agency text,
  scheduled_date  date,
  completed_date  date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_inspections_project on public.inspections (project_id, status);

-- ────────────────────────────────────────────────────────────
-- PERMITS
-- ────────────────────────────────────────────────────────────
create table if not exists public.permits (
  id              uuid    primary key default gen_random_uuid(),
  tenant_id       uuid    not null,
  project_id      uuid    not null references public.projects(id) on delete cascade,
  permit_number   text,
  permit_type     text    not null,
  issuing_agency  text,
  status          text    not null default 'pending'
    check (status in ('pending','submitted','approved','issued','expired','closed')),
  applied_date    date,
  issued_date     date,
  expires_date    date,
  fee_amount      numeric(10,2),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_permits_project on public.permits (project_id, status);

-- ────────────────────────────────────────────────────────────
-- SYNC LOG  (offline sync queue)
-- ────────────────────────────────────────────────────────────
create table if not exists public.sync_log (
  id          uuid    primary key default gen_random_uuid(),
  tenant_id   uuid    not null,
  project_id  uuid,
  operation   text    not null,   -- create, update, delete
  table_name  text    not null,
  record_id   uuid,
  data        jsonb   not null default '{}',
  status      text    not null default 'pending'
    check (status in ('pending','synced','failed','conflict')),
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- ACTIVITY EVENTS  (audit log)
-- ────────────────────────────────────────────────────────────
create table if not exists public.activity_events (
  id          uuid    primary key default gen_random_uuid(),
  tenant_id   uuid    not null,
  project_id  uuid,
  user_id     uuid,
  entity_type text    not null,
  entity_id   uuid,
  action      text    not null,   -- created, updated, deleted, viewed, etc.
  metadata    jsonb   not null default '{}',
  ip_address  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_activity_events_tenant  on public.activity_events (tenant_id, created_at desc);
create index if not exists idx_activity_events_project on public.activity_events (project_id, created_at desc);

-- ────────────────────────────────────────────────────────────
-- TRIGGERS
-- ────────────────────────────────────────────────────────────

do $$ begin create trigger trg_tenants_updated_at before update on public.tenants for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_projects_updated_at before update on public.projects for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_schedule_tasks_updated_at before update on public.schedule_tasks for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_rfis_updated_at before update on public.rfis for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_invoices_updated_at before update on public.invoices for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_change_orders_updated_at before update on public.change_orders for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_daily_logs_updated_at before update on public.daily_logs for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_field_issues_updated_at before update on public.field_issues for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_drawings_updated_at before update on public.drawings for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_inspections_updated_at before update on public.inspections for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_permits_updated_at before update on public.permits for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;

-- ────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY  (all tables tenant-isolated)
-- ────────────────────────────────────────────────────────────

alter table public.tenants           enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.projects          enable row level security;
alter table public.schedule_tasks    enable row level security;
alter table public.schedule_analytics enable row level security;
alter table public.rfis              enable row level security;
alter table public.invoices          enable row level security;
alter table public.change_orders     enable row level security;
alter table public.daily_logs        enable row level security;
alter table public.field_issues      enable row level security;
alter table public.project_photos    enable row level security;
alter table public.drawings          enable row level security;
alter table public.inspections       enable row level security;
alter table public.permits           enable row level security;
alter table public.sync_log          enable row level security;
alter table public.activity_events   enable row level security;

-- Helper function: get calling user's tenant_id from JWT
create or replace function public.my_tenant_id() returns uuid language sql stable as $$
  select nullif((auth.jwt() ->> 'tenant_id'), '')::uuid
$$;

-- Generic tenant-isolation policies
create policy if not exists "tenant isolation on tenants"
  on public.tenants for all
  using (id = public.my_tenant_id());

create policy if not exists "tenant isolation on memberships"
  on public.tenant_memberships for all
  using (tenant_id = public.my_tenant_id());

create policy if not exists "tenant isolation on projects"
  on public.projects for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy if not exists "tenant isolation on schedule_tasks"
  on public.schedule_tasks for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy if not exists "tenant isolation on schedule_analytics"
  on public.schedule_analytics for all
  using (task_id in (select id from public.schedule_tasks where tenant_id = public.my_tenant_id()));

create policy if not exists "tenant isolation on rfis"
  on public.rfis for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy if not exists "tenant isolation on invoices"
  on public.invoices for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy if not exists "tenant isolation on change_orders"
  on public.change_orders for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy if not exists "tenant isolation on daily_logs"
  on public.daily_logs for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy if not exists "tenant isolation on field_issues"
  on public.field_issues for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy if not exists "tenant isolation on project_photos"
  on public.project_photos for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy if not exists "tenant isolation on drawings"
  on public.drawings for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy if not exists "tenant isolation on inspections"
  on public.inspections for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy if not exists "tenant isolation on permits"
  on public.permits for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy if not exists "tenant isolation on sync_log"
  on public.sync_log for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy if not exists "tenant isolation on activity_events"
  on public.activity_events for select
  using (tenant_id = public.my_tenant_id());
