-- ============================================================
-- SAGUARO CRM — COMPLETE DATABASE SETUP
-- Single file containing all 9 migrations in correct order.
-- Paste this entire file into Supabase SQL Editor and click Run.
-- Safe to run multiple times (uses IF NOT EXISTS everywhere).
-- ============================================================

-- ============================================================
-- MIGRATION: 20260308_foundation.sql
-- ============================================================

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



-- ============================================================
-- MIGRATION: 20260307_autopilot.sql
-- ============================================================

create extension if not exists pgcrypto;

do $$ begin
  create type alert_severity as enum ('low','medium','high','critical');
exception when duplicate_object then null; end $$;

do $$ begin
  create type alert_status as enum ('open','acknowledged','resolved','dismissed');
exception when duplicate_object then null; end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.autopilot_rule_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  rule_code text not null,
  is_enabled boolean not null default true,
  thresholds jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, rule_code)
);

create table if not exists public.autopilot_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  summary jsonb not null default '{}'::jsonb,
  error text
);

create table if not exists public.autopilot_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid,
  entity_type text not null check (entity_type in ('rfi','invoice','schedule_task','field_issue','project')),
  entity_id uuid,
  rule_code text not null,
  title text not null,
  summary text not null,
  severity alert_severity not null,
  status alert_status not null default 'open',
  fingerprint text not null,
  metadata jsonb not null default '{}'::jsonb,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  assigned_to uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, fingerprint)
);

create index if not exists idx_autopilot_alerts_tenant_status
  on public.autopilot_alerts (tenant_id, status, severity);

create index if not exists idx_autopilot_alerts_project
  on public.autopilot_alerts (project_id, last_detected_at desc);

create index if not exists idx_autopilot_alerts_rule
  on public.autopilot_alerts (tenant_id, rule_code, status);

create index if not exists idx_autopilot_runs_tenant
  on public.autopilot_runs (tenant_id, started_at desc);

drop trigger if exists trg_autopilot_rule_settings_updated_at on public.autopilot_rule_settings;
create trigger trg_autopilot_rule_settings_updated_at
before update on public.autopilot_rule_settings
for each row execute function public.set_updated_at();

drop trigger if exists trg_autopilot_alerts_updated_at on public.autopilot_alerts;
create trigger trg_autopilot_alerts_updated_at
before update on public.autopilot_alerts
for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- Row-Level Security
-- ────────────────────────────────────────────────────────────

alter table public.autopilot_rule_settings enable row level security;
alter table public.autopilot_runs enable row level security;
alter table public.autopilot_alerts enable row level security;

-- autopilot_rule_settings: tenant members can read their own settings;
-- only service-role (admin) can write (engine uses service role).
create policy if not exists "tenant members read own rule settings"
  on public.autopilot_rule_settings for select
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- autopilot_runs: tenant members can read their own run history.
create policy if not exists "tenant members read own runs"
  on public.autopilot_runs for select
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- autopilot_alerts: tenant members can read their own alerts and
-- acknowledge/dismiss (update status) on their own alerts.
create policy if not exists "tenant members read own alerts"
  on public.autopilot_alerts for select
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy if not exists "tenant members update own alert status"
  on public.autopilot_alerts for update
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ────────────────────────────────────────────────────────────

create or replace view public.autopilot_project_risk_summary as
select
  tenant_id,
  project_id,
  count(*) filter (where status in ('open', 'acknowledged')) as open_count,
  count(*) filter (where status in ('open', 'acknowledged') and severity = 'high') as high_count,
  count(*) filter (where status in ('open', 'acknowledged') and severity = 'critical') as critical_count,
  max(last_detected_at) as last_detected_at
from public.autopilot_alerts
group by 1, 2;



-- ============================================================
-- MIGRATION: 20260307_bid_portal.sql
-- ============================================================

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.bid_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  code text not null default '',
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','issued','awarded','closed')),
  due_at timestamptz,
  awarded_submission_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bid_package_items (
  id uuid primary key default gen_random_uuid(),
  bid_package_id uuid not null references public.bid_packages(id) on delete cascade,
  sort_order integer not null default 0,
  code text not null,
  title text not null,
  description text,
  uom text not null,
  quantity numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.subcontractor_companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  primary_email text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bid_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  bid_package_id uuid not null references public.bid_packages(id) on delete cascade,
  subcontractor_company_id uuid references public.subcontractor_companies(id) on delete set null,
  invite_id uuid,
  status text not null default 'draft' check (status in ('draft','submitted','withdrawn','awarded','rejected')),
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  total_amount numeric(14,2) not null default 0,
  submitted_at timestamptz,
  awarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subcontractor_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  bid_package_id uuid not null references public.bid_packages(id) on delete cascade,
  subcontractor_company_id uuid references public.subcontractor_companies(id) on delete set null,
  portal_submission_id uuid references public.bid_submissions(id) on delete set null,
  email text not null,
  company_name text not null,
  contact_name text,
  phone text,
  invite_token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','opened','accepted','expired','revoked')),
  expires_at timestamptz,
  opened_at timestamptz,
  accepted_at timestamptz,
  last_sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bid_submission_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.bid_submissions(id) on delete cascade,
  bid_package_item_id uuid not null references public.bid_package_items(id) on delete cascade,
  quantity numeric(14,2) not null default 0,
  unit_price numeric(14,2) not null default 0,
  included boolean not null default true,
  lead_time_days integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, bid_package_item_id)
);

create table if not exists public.bid_submission_documents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.bid_submissions(id) on delete cascade,
  bucket_name text not null,
  storage_path text not null,
  file_name text not null,
  file_size bigint,
  content_type text,
  created_at timestamptz not null default now()
);

create index if not exists idx_bid_packages_project on public.bid_packages (tenant_id, project_id, created_at desc);
create index if not exists idx_bid_package_items_package on public.bid_package_items (bid_package_id, sort_order);
create index if not exists idx_subcontractor_invites_lookup on public.subcontractor_invites (tenant_id, bid_package_id, email);
create index if not exists idx_bid_submissions_package on public.bid_submissions (tenant_id, bid_package_id, status);
create index if not exists idx_bid_submission_documents_submission on public.bid_submission_documents (submission_id, created_at desc);

-- Enforce one submission per (package, subcontractor) when subcontractor is known.
create unique index if not exists uidx_bid_submissions_package_company
  on public.bid_submissions (bid_package_id, subcontractor_company_id)
  where subcontractor_company_id is not null;

-- Prevent more than one anonymous (no subcontractor) draft per package per invite.
create unique index if not exists uidx_bid_submissions_package_invite_null_company
  on public.bid_submissions (bid_package_id, invite_id)
  where subcontractor_company_id is null and invite_id is not null;

do $$ begin
  alter table public.bid_submissions
    add constraint bid_submissions_invite_fk
    foreign key (invite_id) references public.subcontractor_invites(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.bid_packages
    add constraint bid_packages_awarded_submission_fk
    foreign key (awarded_submission_id) references public.bid_submissions(id) on delete set null;
exception when duplicate_object then null; end $$;

create or replace view public.bid_submission_totals as
select
  submission_id,
  sum(case when included then quantity * unit_price else 0 end) as total_amount
from public.bid_submission_items
group by 1;

drop trigger if exists trg_bid_packages_updated_at on public.bid_packages;
create trigger trg_bid_packages_updated_at
before update on public.bid_packages
for each row execute function public.set_updated_at();

drop trigger if exists trg_subcontractor_companies_updated_at on public.subcontractor_companies;
create trigger trg_subcontractor_companies_updated_at
before update on public.subcontractor_companies
for each row execute function public.set_updated_at();

drop trigger if exists trg_bid_submissions_updated_at on public.bid_submissions;
create trigger trg_bid_submissions_updated_at
before update on public.bid_submissions
for each row execute function public.set_updated_at();

drop trigger if exists trg_subcontractor_invites_updated_at on public.subcontractor_invites;
create trigger trg_subcontractor_invites_updated_at
before update on public.subcontractor_invites
for each row execute function public.set_updated_at();

drop trigger if exists trg_bid_submission_items_updated_at on public.bid_submission_items;
create trigger trg_bid_submission_items_updated_at
before update on public.bid_submission_items
for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- Row-Level Security
-- ────────────────────────────────────────────────────────────

alter table public.bid_packages enable row level security;
alter table public.bid_package_items enable row level security;
alter table public.subcontractor_companies enable row level security;
alter table public.bid_submissions enable row level security;
alter table public.subcontractor_invites enable row level security;
alter table public.bid_submission_items enable row level security;
alter table public.bid_submission_documents enable row level security;

-- Tenant members can read and manage their own bid packages.
create policy if not exists "tenant members manage own bid packages"
  on public.bid_packages for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Items belong to packages; access is controlled via the parent package's tenant.
create policy if not exists "tenant members manage own bid package items"
  on public.bid_package_items for all
  using (
    bid_package_id in (
      select id from public.bid_packages
      where tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    )
  );

-- Tenant members can manage their own subcontractor companies.
create policy if not exists "tenant members manage own subcontractor companies"
  on public.subcontractor_companies for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Tenant members can manage their own bid submissions.
create policy if not exists "tenant members manage own bid submissions"
  on public.bid_submissions for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Tenant members can manage their own subcontractor invites.
create policy if not exists "tenant members manage own invites"
  on public.subcontractor_invites for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Submission items are accessible via the parent submission's tenant.
create policy if not exists "tenant members manage own submission items"
  on public.bid_submission_items for all
  using (
    submission_id in (
      select id from public.bid_submissions
      where tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    )
  );

-- Submission documents are accessible via the parent submission's tenant.
create policy if not exists "tenant members manage own submission documents"
  on public.bid_submission_documents for all
  using (
    submission_id in (
      select id from public.bid_submissions
      where tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    )
  );



-- ============================================================
-- MIGRATION: 20260308_core_modules.sql
-- ============================================================

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



-- ============================================================
-- MIGRATION: 20260308_bid_intelligence.sql
-- ============================================================

-- ============================================================
-- Saguaro CRM — Bid Intelligence & Auto-Project Creation
-- Migration: 20260308_bid_intelligence.sql
-- Run AFTER: 20260307_bid_portal.sql, 20260308_core_modules.sql
-- ============================================================
-- Adds the AI learning layer that makes Saguaro smarter over time:
--   bid_outcomes          — every bid result with AI analysis of why
--   bid_intelligence_profiles — rolling company "brain" per tenant
--   bid_opportunity_scores    — incoming opps scored by AI
--   auto_created_projects     — audit of what AI built per project
-- ============================================================

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ────────────────────────────────────────────────────────────
-- BID OUTCOMES  (every bid tracked with AI post-mortem)
-- ────────────────────────────────────────────────────────────
create table if not exists public.bid_outcomes (
  id                        uuid    primary key default gen_random_uuid(),
  tenant_id                 uuid    not null,
  project_id                uuid,
  bid_submission_id         uuid    references public.bid_submissions(id) on delete set null,
  bid_package_id            uuid    references public.bid_packages(id)   on delete set null,

  -- What we bid on
  trade_category            text,   -- e.g. 'concrete','electrical','framing','mechanical'
  scope_summary             text,   -- brief description of scope we bid
  project_type              text,   -- 'commercial','residential','industrial','healthcare','education','government'
  project_size_sqft         integer,
  project_duration_days     integer,
  location                  text,
  owner_name                text,
  gc_name                   text,

  -- Our numbers
  bid_amount                numeric(14,2),
  estimated_cost            numeric(14,2),
  estimated_margin_percent  numeric(5,2),
  hours_spent_bidding       numeric(6,1),  -- time investment tracking

  -- Competitive context (fill in what you know)
  num_competitors_known     integer,
  winning_bid_amount        numeric(14,2),  -- null if unknown
  our_rank                  integer,        -- 1=won, 2=second, etc.
  winning_company           text,           -- who beat us (if known)

  -- Outcome
  outcome                   text    not null
    check (outcome in ('won','lost','no_bid','abandoned','pending')),
  outcome_date              date,
  lost_reason               text,   -- human-provided reason if lost

  -- AI Post-Mortem (generated by bid-intelligence.ts)
  ai_win_factors            jsonb,  -- [{factor, impact:'high'|'medium'|'low', detail}]
  ai_loss_factors           jsonb,  -- [{factor, impact, detail, corrective_action}]
  ai_price_analysis         jsonb,  -- {our_price_vs_market, strategy_used, recommended_strategy, adjustment_pct}
  ai_scope_fit_score        integer,  -- 0-100: how well the scope matched our strengths
  ai_relationship_score     integer,  -- 0-100: strength of relationship with owner/GC
  ai_lessons                jsonb,  -- [{lesson, recommendation, priority:'high'|'medium'|'low'}]
  ai_analysis_text          text,   -- full narrative analysis
  ai_model                  text,
  ai_analyzed_at            timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_bid_outcomes_tenant
  on public.bid_outcomes (tenant_id, outcome, outcome_date desc);
create index if not exists idx_bid_outcomes_trade
  on public.bid_outcomes (tenant_id, trade_category, outcome);
create index if not exists idx_bid_outcomes_project_type
  on public.bid_outcomes (tenant_id, project_type, outcome);

-- ────────────────────────────────────────────────────────────
-- BID INTELLIGENCE PROFILES  (rolling AI-built company brain)
-- One row per tenant — updated after every batch of outcomes
-- ────────────────────────────────────────────────────────────
create table if not exists public.bid_intelligence_profiles (
  id            uuid    primary key default gen_random_uuid(),
  tenant_id     uuid    not null unique,

  -- Rolling stats
  total_bids            integer not null default 0,
  total_wins            integer not null default 0,
  total_losses          integer not null default 0,
  total_no_bids         integer not null default 0,
  win_rate_percent      numeric(5,2),
  avg_margin_won        numeric(5,2),   -- avg margin % on won bids
  avg_bid_amount        numeric(14,2),
  total_revenue_won     numeric(16,2),

  -- Trade-level stats (JSON map: trade → stats)
  -- {electrical:{bids:10,wins:7,win_rate:70,avg_margin:18,avg_bid:125000}}
  trade_stats           jsonb not null default '{}',

  -- Project type stats
  project_type_stats    jsonb not null default '{}',

  -- Size range performance
  -- {small:{<250k,bids,wins,win_rate}, medium:{250k-1M,...}, large:{>1M,...}}
  size_range_stats      jsonb not null default '{}',

  -- Relationship-driven wins (how much owner/GC relationship matters)
  relationship_win_rate numeric(5,2),  -- win rate when relationship score >=70

  -- AI-generated intelligence (updated on every profile rebuild)
  core_strengths        jsonb,  -- [{area, evidence, confidence_pct}]
  areas_to_improve      jsonb,  -- [{area, current_rate, target_rate, recommendation}]
  ideal_project_profile jsonb,  -- {trade_categories, project_types, size_range, owner_types, margin_target}

  -- Pricing intelligence
  avg_margin_by_trade   jsonb,  -- {electrical:18.2, concrete:12.5, ...}
  market_position       text    check (market_position in ('low_bidder','competitive','premium','unknown')),

  -- Actionable recommendations (rebuilt fresh each time)
  bid_strategy_text     text,   -- "Focus on healthcare and education — 73% win rate vs 42% for commercial"
  pricing_strategy_text text,   -- "You consistently win at 12-16% margin for electrical < $500k"
  scope_strategy_text   text,   -- "Avoid projects > 18 months — 8% win rate vs 48% for <12 months"
  top_recommendations   jsonb,  -- [{priority:1, action, rationale, expected_impact}] top 5

  -- Profile health
  profile_summary       text,   -- human-readable 3-4 paragraph intelligence brief
  data_quality          text    check (data_quality in ('insufficient','developing','solid','strong')),
  -- insufficient = <5 outcomes, developing = 5-20, solid = 21-50, strong = >50

  outcomes_analyzed     integer not null default 0,
  last_analyzed_at      timestamptz,
  next_analysis_due     timestamptz,  -- scheduled next rebuild

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- BID OPPORTUNITY SCORES  (incoming opps evaluated by AI)
-- ────────────────────────────────────────────────────────────
create table if not exists public.bid_opportunity_scores (
  id               uuid    primary key default gen_random_uuid(),
  tenant_id        uuid    not null,

  -- Opportunity details (input)
  opportunity_title       text    not null,
  opportunity_description text,
  trade_category          text,
  project_type            text,
  location                text,
  estimated_value         numeric(14,2),
  bid_due_date            date,
  project_start_date      date,
  project_duration_days   integer,
  owner_name              text,
  gc_name                 text,
  source                  text,   -- 'manual','email','construction_connect','dodge','government','referral'
  source_url              text,

  -- AI Scoring output
  fit_score               integer,        -- 0-100 overall fit to company profile
  win_probability         integer,        -- 0-100 estimated win probability
  recommended_action      text
    check (recommended_action in ('bid','pass','partner','investigate','bid_with_partner')),

  -- Score breakdown
  scope_alignment_score   integer,   -- 0-100 how well scope matches our strengths
  capacity_score          integer,   -- 0-100 do we have bandwidth/resources
  relationship_score      integer,   -- 0-100 strength of relationship with owner/GC
  competition_score       integer,   -- 0-100 lower competition = higher score
  margin_potential_score  integer,   -- 0-100 margin opportunity vs our average

  -- Pricing recommendation
  suggested_bid_low       numeric(14,2),
  suggested_bid_high      numeric(14,2),
  suggested_margin_pct    numeric(5,2),

  -- AI Analysis text
  bid_recommendation_text text,  -- full analysis and recommendation
  why_we_win              jsonb, -- [{reason, confidence:'high'|'medium'|'low'}]
  key_risks               jsonb, -- [{risk, mitigation, severity}]
  similar_past_wins       jsonb, -- [{outcome_id, similarity_pct, what_worked}]
  similar_past_losses     jsonb, -- [{outcome_id, similarity_pct, lesson}]

  -- Tracking
  status                  text not null default 'new'
    check (status in ('new','reviewing','bidding','won','lost','passed','no_bid')),
  linked_bid_package_id   uuid    references public.bid_packages(id) on delete set null,
  linked_outcome_id       uuid    references public.bid_outcomes(id) on delete set null,

  ai_model                text,
  ai_analyzed_at          timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_bid_opportunity_scores_tenant
  on public.bid_opportunity_scores (tenant_id, fit_score desc, status);
create index if not exists idx_bid_opportunity_scores_due
  on public.bid_opportunity_scores (tenant_id, bid_due_date asc)
  where status in ('new','reviewing','bidding');

-- ────────────────────────────────────────────────────────────
-- AUTO CREATED PROJECTS  (audit of what AI built per project)
-- ────────────────────────────────────────────────────────────
create table if not exists public.auto_created_projects (
  id                      uuid    primary key default gen_random_uuid(),
  tenant_id               uuid    not null,
  project_id              uuid    not null,
  bid_submission_id       uuid    references public.bid_submissions(id) on delete set null,
  contract_id             uuid    references public.contracts(id)       on delete set null,

  -- Counts of what was auto-created
  schedule_tasks_created  integer not null default 0,
  budget_lines_created    integer not null default 0,
  contacts_created        integer not null default 0,
  subpackages_created     integer not null default 0,  -- sub bid packages created

  -- Flags for what was initialized
  rfi_log_initialized     boolean not null default false,
  safety_plan_created     boolean not null default false,
  qc_checklist_created    boolean not null default false,
  document_structure_created boolean not null default false,

  -- AI metadata
  ai_model                text,
  ai_prompt_tokens        integer,
  ai_output_tokens        integer,
  creation_summary        text,   -- brief of what was created
  creation_warnings       jsonb,  -- any items that couldn't be auto-created

  created_at  timestamptz not null default now()
);

create index if not exists idx_auto_created_projects_project
  on public.auto_created_projects (tenant_id, project_id);

-- ────────────────────────────────────────────────────────────
-- TRIGGERS
-- ────────────────────────────────────────────────────────────

do $$ begin
  create trigger trg_bid_outcomes_updated_at
    before update on public.bid_outcomes
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_bid_intelligence_profiles_updated_at
    before update on public.bid_intelligence_profiles
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_bid_opportunity_scores_updated_at
    before update on public.bid_opportunity_scores
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- ────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

alter table public.bid_outcomes               enable row level security;
alter table public.bid_intelligence_profiles  enable row level security;
alter table public.bid_opportunity_scores     enable row level security;
alter table public.auto_created_projects      enable row level security;

create policy if not exists "tenant members manage bid outcomes"
  on public.bid_outcomes for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy if not exists "tenant members manage bid intelligence profile"
  on public.bid_intelligence_profiles for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy if not exists "tenant members manage bid opportunity scores"
  on public.bid_opportunity_scores for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy if not exists "tenant members view auto created projects"
  on public.auto_created_projects for select
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ────────────────────────────────────────────────────────────
-- VIEWS
-- ────────────────────────────────────────────────────────────

-- Win/loss dashboard by trade
create or replace view public.bid_win_rate_by_trade as
select
  tenant_id,
  trade_category,
  count(*)                                              as total_bids,
  count(*) filter (where outcome = 'won')              as wins,
  count(*) filter (where outcome = 'lost')             as losses,
  round(
    100.0 * count(*) filter (where outcome = 'won')
    / nullif(count(*) filter (where outcome in ('won','lost')), 0),
    1
  )                                                     as win_rate_pct,
  round(avg(estimated_margin_percent) filter (where outcome = 'won'), 1) as avg_winning_margin,
  round(avg(bid_amount), 0)                            as avg_bid_amount
from public.bid_outcomes
where outcome in ('won','lost')
group by 1, 2
order by 1, win_rate_pct desc;

-- Top opportunity pipeline
create or replace view public.bid_opportunity_pipeline as
select
  tenant_id,
  opportunity_title,
  trade_category,
  estimated_value,
  bid_due_date,
  fit_score,
  win_probability,
  recommended_action,
  status,
  created_at
from public.bid_opportunity_scores
where status in ('new','reviewing','bidding')
order by fit_score desc, bid_due_date asc;



-- ============================================================
-- MIGRATION: 20260308_takeoff.sql
-- ============================================================

-- ============================================================
-- Saguaro CRM — AI Takeoff Module & Sandbox Engine
-- Migration: 20260308_takeoff.sql
-- Run AFTER: 20260308_bid_intelligence.sql
-- ============================================================
-- Adds:
--   takeoff_projects      — one per blueprint set uploaded
--   takeoff_material_lines — every material item AI calculated
--   takeoff_labor_lines   — labor hours by trade
--   takeoff_blueprints    — individual blueprint files per takeoff
--   sandbox_tenants       — free sandbox accounts
--   sandbox_events        — behavioral tracking for smart upsell
--   upsell_prompts        — configurable upsell trigger definitions
-- ============================================================

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ────────────────────────────────────────────────────────────
-- TAKEOFF PROJECTS  (one per blueprint set / estimation job)
-- ────────────────────────────────────────────────────────────
create table if not exists public.takeoff_projects (
  id            uuid    primary key default gen_random_uuid(),
  tenant_id     uuid    not null,
  project_id    uuid,   -- links to projects table after conversion
  name          text    not null,
  description   text,
  address       text,
  project_type  text    not null default 'residential'
    check (project_type in ('residential','commercial','industrial','addition','remodel','multifamily','mixed_use')),
  is_sandbox    boolean not null default false,

  -- Processing state
  status        text    not null default 'pending'
    check (status in ('pending','uploading','processing','complete','failed')),
  error_message text,

  -- AI metadata
  ai_model            text,
  ai_prompt_tokens    integer,
  ai_output_tokens    integer,
  ai_analyzed_at      timestamptz,
  ai_confidence       text check (ai_confidence in ('high','medium','low')),
  ai_processing_secs  integer,

  -- Summary metrics extracted by AI
  total_sf              numeric(12,2),   -- gross square footage
  conditioned_sf        numeric(12,2),   -- heated/cooled SF
  garage_sf             numeric(12,2),
  porch_sf              numeric(12,2),
  stories               integer,
  bedrooms              integer,
  bathrooms             numeric(4,1),
  total_lf_exterior_walls numeric(10,2),
  roof_area_squares     numeric(8,2),    -- 1 square = 100 SF
  roof_pitch            text,
  foundation_type       text,

  -- Cost estimates (from AI)
  total_material_cost_estimate  numeric(14,2),
  total_labor_cost_estimate     numeric(14,2),
  total_cost_estimate           numeric(14,2),
  cost_per_sf                   numeric(8,2),
  estimated_duration_days       integer,

  -- Structured AI output stored as JSONB for fast access
  rooms             jsonb not null default '[]',  -- room list with dims
  assumptions       jsonb not null default '[]',
  limitations       jsonb not null default '[]',
  recommended_verifications jsonb not null default '[]',
  critical_path_items       jsonb not null default '[]',

  -- Time tracking (for upsell comparison)
  user_started_at   timestamptz,
  ai_completed_at   timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_takeoff_projects_tenant
  on public.takeoff_projects (tenant_id, status, created_at desc);
create index if not exists idx_takeoff_projects_sandbox
  on public.takeoff_projects (is_sandbox, tenant_id);

-- ────────────────────────────────────────────────────────────
-- TAKEOFF BLUEPRINTS  (individual files within a takeoff project)
-- ────────────────────────────────────────────────────────────
create table if not exists public.takeoff_blueprints (
  id                  uuid    primary key default gen_random_uuid(),
  takeoff_project_id  uuid    not null references public.takeoff_projects(id) on delete cascade,
  tenant_id           uuid    not null,
  file_name           text    not null,
  file_size           bigint,
  content_type        text    not null default 'application/pdf',
  storage_bucket      text    not null default 'blueprints',
  storage_path        text    not null,
  anthropic_file_id   text,   -- Anthropic Files API ID (for PDFs)
  sheet_type          text
    check (sheet_type in ('floor_plan','site_plan','elevation','section','detail','schedule','electrical','plumbing','mechanical','structural','other')),
  sheet_number        text,   -- e.g. A1.0, S2.1
  scale               text,   -- e.g. '1/4"=1\'0"'
  page_number         integer not null default 1,
  processed           boolean not null default false,
  ai_page_summary     text,   -- brief of what Claude found on this sheet
  created_at          timestamptz not null default now()
);

create index if not exists idx_takeoff_blueprints_project
  on public.takeoff_blueprints (takeoff_project_id, page_number);

-- ────────────────────────────────────────────────────────────
-- TAKEOFF MATERIAL LINES  (every single material item)
-- ────────────────────────────────────────────────────────────
create table if not exists public.takeoff_material_lines (
  id                  uuid    primary key default gen_random_uuid(),
  takeoff_project_id  uuid    not null references public.takeoff_projects(id) on delete cascade,
  tenant_id           uuid    not null,

  -- Categorization
  csi_code      text,         -- e.g. '06-1000' Rough Carpentry
  csi_division  text,         -- e.g. '06 – Wood, Plastics, Composites'
  category      text    not null, -- Sitework, Concrete, Framing, Sheathing, Roofing, etc.
  subcategory   text,

  -- Item details
  item          text    not null, -- "2x4 Stud, 8ft", "OSB 7/16\" 4x8 Sheet"
  spec          text,             -- Detailed spec: "KD-19 Doug Fir #2, 92-5/8\" precut"
  source_room   text,             -- Which room/area this came from

  -- Quantities
  quantity              numeric(12,2) not null,
  unit                  text    not null,   -- LF, SF, EA, CY, SQ, LBS, BX, SHT, GAL, etc.
  waste_factor_pct      numeric(5,2)  not null default 10,
  adjusted_quantity     numeric(12,2) not null,   -- quantity × (1 + waste/100)

  -- Cost
  unit_cost_estimate    numeric(10,2),
  total_cost_estimate   numeric(14,2),

  -- Supplier integration (future)
  supplier_sku          text,
  supplier_name         text,   -- HD Pro, Lowe's Pro, custom
  last_quoted_price     numeric(10,2),
  last_quoted_at        timestamptz,

  notes     text,
  sort_order integer not null default 0,

  created_at  timestamptz not null default now()
);

create index if not exists idx_takeoff_material_lines_project
  on public.takeoff_material_lines (takeoff_project_id, category, sort_order);

-- ────────────────────────────────────────────────────────────
-- TAKEOFF LABOR LINES  (labor hours by trade)
-- ────────────────────────────────────────────────────────────
create table if not exists public.takeoff_labor_lines (
  id                  uuid    primary key default gen_random_uuid(),
  takeoff_project_id  uuid    not null references public.takeoff_projects(id) on delete cascade,
  tenant_id           uuid    not null,

  trade             text    not null,  -- Framing, Concrete, Roofing, Electrical, etc.
  task_description  text    not null,
  hours             numeric(8,1) not null,
  crew_size         integer not null default 1,
  crew_days         numeric(6,1),      -- hours / (crew_size × 8)

  -- Cost
  hourly_rate_estimate  numeric(10,2),
  total_cost_estimate   numeric(14,2),

  phase         text,     -- Which project phase
  sort_order    integer   not null default 0,

  created_at  timestamptz not null default now()
);

create index if not exists idx_takeoff_labor_lines_project
  on public.takeoff_labor_lines (takeoff_project_id, sort_order);

-- ────────────────────────────────────────────────────────────
-- SANDBOX TENANTS  (free accounts for the Saguaro.com demo)
-- ────────────────────────────────────────────────────────────
create table if not exists public.sandbox_tenants (
  id          uuid    primary key default gen_random_uuid(),
  tenant_id   uuid    not null unique,

  -- Signup info
  email             text    not null,
  first_name        text,
  last_name         text,
  company_name      text,
  phone             text,
  company_size      text    check (company_size in ('solo','2-10','11-50','51-200','200+')),
  annual_revenue    text,
  primary_trade     text,   -- what they do
  referral_source   text,   -- how they found Saguaro

  -- Sandbox limits
  ai_runs_limit           integer not null default 5,
  ai_runs_used            integer not null default 0,
  takeoffs_run            integer not null default 0,
  bids_created            integer not null default 0,
  projects_created        integer not null default 0,

  -- Time tracking (for upsell ROI calculation)
  total_time_saved_minutes integer not null default 0,  -- cumulative AI time savings
  ai_tokens_used           integer not null default 0,

  -- Demo flow tracking
  demo_completed          boolean not null default false,
  saw_takeoff_demo        boolean not null default false,
  saw_bid_automation      boolean not null default false,
  saw_autopilot           boolean not null default false,
  saw_project_creation    boolean not null default false,
  uploaded_own_blueprint  boolean not null default false,
  invited_team_member     boolean not null default false,

  -- Upsell/conversion
  upsell_shown_count      integer not null default 0,
  upsell_last_shown_at    timestamptz,
  upsell_clicked_at       timestamptz,
  upsell_action           text,  -- 'upgrade_clicked','booked_demo','dismissed','contacted_sales'
  converted_to_paid_at    timestamptz,
  plan_selected           text,  -- 'starter','pro','enterprise'
  monthly_value           numeric(10,2),

  -- Lifecycle
  sandbox_expires_at   timestamptz not null default (now() + interval '14 days'),
  last_active_at       timestamptz,
  day7_email_sent_at   timestamptz,
  day12_email_sent_at  timestamptz,
  expiry_email_sent_at timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_sandbox_tenants_email
  on public.sandbox_tenants (email);
create index if not exists idx_sandbox_tenants_expiry
  on public.sandbox_tenants (sandbox_expires_at)
  where converted_to_paid_at is null;

-- ────────────────────────────────────────────────────────────
-- SANDBOX EVENTS  (behavioral tracking for smart upsell)
-- ────────────────────────────────────────────────────────────
create table if not exists public.sandbox_events (
  id                  uuid    primary key default gen_random_uuid(),
  sandbox_tenant_id   uuid    not null references public.sandbox_tenants(id) on delete cascade,
  tenant_id           uuid    not null,

  -- What happened
  event_type    text    not null,
  -- Values: 'signup','blueprint_uploaded','takeoff_started','takeoff_completed',
  --         'bid_created','bid_sent','project_created','autopilot_viewed',
  --         'comparison_viewed','upsell_shown','upsell_clicked','demo_booked',
  --         'ai_limit_hit','sandbox_expired'

  event_data    jsonb   not null default '{}',

  -- Upsell that was triggered by this event
  upsell_triggered    boolean not null default false,
  upsell_variant      text,   -- which upsell message/CTA was shown
  upsell_converted    boolean not null default false,

  -- Time saved context (shown in upsell)
  time_saved_minutes  integer,
  traditional_hours   numeric(4,1),

  created_at  timestamptz not null default now()
);

create index if not exists idx_sandbox_events_tenant
  on public.sandbox_events (sandbox_tenant_id, event_type, created_at desc);

-- ────────────────────────────────────────────────────────────
-- UPSELL PROMPTS  (configurable upsell triggers)
-- ────────────────────────────────────────────────────────────
create table if not exists public.upsell_prompts (
  id              uuid    primary key default gen_random_uuid(),
  trigger_event   text    not null unique, -- event_type that triggers this
  headline        text    not null,
  subheadline     text,
  body            text    not null,
  cta_primary     text    not null,  -- 'Start Free Trial', 'Book a Demo', etc.
  cta_secondary   text,              -- 'See Pricing', 'Learn More', etc.
  cta_primary_url text,
  cta_secondary_url text,
  comparison_data jsonb   not null default '{}',
  -- {procore: {time:'4 hours',cost:'$449/user'}, buildertrend: {...}, saguaro: {...}}
  is_active       boolean not null default true,
  sort_priority   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- TRIGGERS
-- ────────────────────────────────────────────────────────────

do $$ begin
  create trigger trg_takeoff_projects_updated_at
    before update on public.takeoff_projects
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_sandbox_tenants_updated_at
    before update on public.sandbox_tenants
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- ────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

alter table public.takeoff_projects       enable row level security;
alter table public.takeoff_blueprints     enable row level security;
alter table public.takeoff_material_lines enable row level security;
alter table public.takeoff_labor_lines    enable row level security;
alter table public.sandbox_tenants        enable row level security;
alter table public.sandbox_events         enable row level security;

create policy if not exists "tenant members manage takeoff projects"
  on public.takeoff_projects for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy if not exists "tenant members manage takeoff blueprints"
  on public.takeoff_blueprints for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy if not exists "tenant members manage takeoff material lines"
  on public.takeoff_material_lines for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy if not exists "tenant members manage takeoff labor lines"
  on public.takeoff_labor_lines for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Sandbox: user can only see their own sandbox record
create policy if not exists "sandbox users manage own sandbox"
  on public.sandbox_tenants for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy if not exists "sandbox users manage own events"
  on public.sandbox_events for all
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Upsell prompts are publicly readable
create policy if not exists "upsell prompts are public"
  on public.upsell_prompts for select using (true);

-- ────────────────────────────────────────────────────────────
-- SEED UPSELL PROMPTS
-- ────────────────────────────────────────────────────────────

insert into public.upsell_prompts (trigger_event, headline, subheadline, body, cta_primary, cta_secondary, comparison_data, sort_priority) values

('takeoff_completed',
  'You just saved 4+ hours in under 60 seconds.',
  'That takeoff would take a traditional estimator half a day.',
  'Saguaro AI just read your blueprints, calculated every material and labor hour, and built a complete estimate. No spreadsheets. No manual takeoff. Unlimited takeoffs with a Pro account — plus automatic supplier ordering, bid package distribution, and project creation from every won bid.',
  'Start 14-Day Free Trial',
  'Book a Live Demo',
  '{"traditional":{"time":"4-8 hours","tool":"Spreadsheet/manual","cost":"$75-150/hr estimator"},"procore":{"time":"2-3 hours","tool":"Manual + Procore Estimating","cost":"$449/user/month"},"buildertrend":{"time":"2-4 hours","tool":"Manual entry","cost":"$299/month"},"saguaro":{"time":"< 60 seconds","tool":"Claude AI","cost":"$149/month unlimited"}}',
  1),

('ai_limit_hit',
  'You''ve used your 5 free AI credits.',
  'Upgrade for unlimited AI — takeoffs, bid jackets, project creation.',
  'You''ve seen what Saguaro can do. Pro users run unlimited AI takeoffs, automatically send bid invitations to qualified subcontractors, get AI-generated project schedules on every won bid, and receive real-time risk alerts that prevent costly delays.',
  'Upgrade to Pro — $149/mo',
  'See All Features',
  '{"pro":{"price":"$149/month","ai_runs":"Unlimited","users":"Up to 10"},"enterprise":{"price":"Custom","ai_runs":"Unlimited","users":"Unlimited"}}',
  2),

('bid_created',
  'Want Saguaro to send this to your entire sub network automatically?',
  'Pro users reach 200+ qualified subcontractors in minutes.',
  'You just created a bid package. In Pro, Saguaro automatically emails the AI-generated invitation letter to all matching subcontractors in your vendor database, tracks opens and submissions in real time, and scores each bid when it comes in.',
  'Upgrade to Send Bids Automatically',
  'Learn More',
  '{"manual":{"time":"2-3 hours of phone/email","reach":"20-30 subs if you''re lucky"},"saguaro_pro":{"time":"< 30 seconds","reach":"Your entire sub database + AI matching"}}',
  3),

('project_created',
  'Your full project was just built in seconds.',
  'Schedule, budget, contacts, safety plan, QC checklist — all populated by AI.',
  'Pro users get this on every single won bid. No setup time. No manual data entry. The moment a bid is awarded, Saguaro auto-creates the complete project structure, emails the winning sub their award notice, and rejects all other bidders automatically.',
  'Get This on Every Project',
  'Book a Demo to See More',
  '{"traditional":{"setup_time":"4-8 hours manual project setup"},"saguaro_pro":{"setup_time":"Automatic on bid award"}}',
  4),

('sandbox_expiring',
  'Your sandbox expires in 2 days.',
  'Don''t lose your data — upgrade and keep everything.',
  'All your takeoffs, bid packages, and projects are saved. Upgrade to Pro and keep all your work, add your team, and run unlimited AI on your real projects.',
  'Upgrade Now — Keep All My Work',
  'Export My Data',
  '{}',
  5)

on conflict (trigger_event) do nothing;

-- ────────────────────────────────────────────────────────────
-- VIEWS
-- ────────────────────────────────────────────────────────────

-- Takeoff cost summary by category
create or replace view public.takeoff_cost_summary as
select
  t.id                              as takeoff_project_id,
  t.tenant_id,
  t.name,
  t.total_sf,
  m.category,
  count(m.id)                       as line_items,
  sum(m.adjusted_quantity)          as total_quantity,
  sum(m.total_cost_estimate)        as material_cost,
  (select sum(l.total_cost_estimate) from public.takeoff_labor_lines l
   where l.takeoff_project_id = t.id and l.trade ilike '%' || m.category || '%') as labor_cost
from public.takeoff_projects t
join public.takeoff_material_lines m on m.takeoff_project_id = t.id
group by t.id, t.tenant_id, t.name, t.total_sf, m.category;

-- Sandbox conversion funnel
create or replace view public.sandbox_funnel as
select
  count(*)                                               as total_signups,
  count(*) filter (where uploaded_own_blueprint)        as uploaded_blueprint,
  count(*) filter (where takeoffs_run > 0)              as ran_takeoff,
  count(*) filter (where bids_created > 0)              as created_bid,
  count(*) filter (where upsell_clicked_at is not null) as clicked_upsell,
  count(*) filter (where converted_to_paid_at is not null) as converted,
  round(100.0 * count(*) filter (where converted_to_paid_at is not null)
    / nullif(count(*), 0), 1)                           as conversion_rate_pct
from public.sandbox_tenants;



-- ============================================================
-- MIGRATION: 20260308_billing.sql
-- ============================================================

-- ============================================================
-- Saguaro CRM — Billing, Subscriptions & White-Label
-- Migration: 20260308_billing.sql
-- Run AFTER all other migrations
-- ============================================================

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ────────────────────────────────────────────────────────────
-- PLANS  (source of truth for pricing — update here, not code)
-- ────────────────────────────────────────────────────────────
create table if not exists public.plans (
  id                text    primary key,   -- 'starter','professional','enterprise','white_label_growth','white_label_agency'
  name              text    not null,
  description       text,
  -- Stripe price IDs (monthly and annual)
  stripe_price_monthly  text,              -- e.g. price_xxx from Stripe dashboard
  stripe_price_annual   text,
  -- Pricing
  monthly_price_cents   integer not null,  -- $449 = 44900
  annual_price_cents    integer not null,  -- $4,488 = 448800
  -- Limits
  ai_takeoffs_per_month   integer,         -- null = unlimited
  active_projects_limit   integer,         -- null = unlimited
  users_limit             integer,         -- null = unlimited
  storage_gb_limit        integer,         -- null = unlimited
  -- Features (booleans)
  feature_bid_intelligence  boolean not null default false,
  feature_white_label       boolean not null default false,
  feature_api_access        boolean not null default false,
  feature_custom_ai         boolean not null default false,
  feature_sso               boolean not null default false,
  feature_unlimited_ai      boolean not null default false,
  -- Meta
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

insert into public.plans (
  id, name, description,
  monthly_price_cents, annual_price_cents,
  ai_takeoffs_per_month, active_projects_limit, users_limit, storage_gb_limit,
  feature_bid_intelligence, feature_white_label, feature_api_access,
  feature_custom_ai, feature_sso, feature_unlimited_ai, sort_order
) values
  ('starter',
   'Starter',
   'All core features, 3 portals, AI Autopilot. Perfect for solo operators and small GC teams.',
   44900, 448800,
   10, null, null, 50,
   false, false, false, false, false, false, 1),

  ('professional',
   'Professional',
   'Unlimited AI takeoffs, Bid Intelligence, AI Bid Jackets, advanced scheduling. Built for growing GCs.',
   74900, 748800,
   null, null, null, 200,
   true, false, false, false, false, true, 2),

  ('enterprise',
   'Enterprise',
   'Full white-label ready, API access, SSO, custom AI training. Multi-office GC and enterprise.',
   149900, 1498800,
   null, null, null, null,
   true, true, true, true, true, true, 3),

  ('white_label_growth',
   'White-Label Growth',
   'Launch your own branded CRM. 1 branded instance, up to 50 contractor clients.',
   249900, 2498800,
   null, 50, null, 500,
   true, true, true, false, false, true, 4),

  ('white_label_agency',
   'White-Label Agency',
   'Launch your own branded CRM at scale. 5 branded instances, unlimited contractor clients.',
   499900, 4998800,
   null, null, null, null,
   true, true, true, true, true, true, 5)

on conflict (id) do nothing;

-- ────────────────────────────────────────────────────────────
-- LEADS  (all form submissions before becoming paying customers)
-- ────────────────────────────────────────────────────────────
create table if not exists public.leads (
  id            uuid    primary key default gen_random_uuid(),
  email         text    not null,
  first_name    text,
  last_name     text,
  company_name  text,
  phone         text,
  state         text,
  message       text,
  source        text    not null default 'website',
  -- source values: website | sandbox | whitelabel_inquiry | demo_request | contact_form | referral | api
  status        text    not null default 'new'
    check (status in ('new','contacted','demo_scheduled','trial','converted','lost')),
  metadata      jsonb   not null default '{}',
  -- marketing attribution
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  referral_code text,
  -- conversion tracking
  converted_at        timestamptz,
  converted_plan_id   text references public.plans(id) on delete set null,
  converted_tenant_id uuid,
  -- internal
  notes         text,
  assigned_to   text,   -- sales rep name/email
  next_action   text,
  next_action_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_leads_email on public.leads (email);
create index if not exists idx_leads_status on public.leads (status, created_at desc);
create index if not exists idx_leads_source on public.leads (source, created_at desc);

-- ────────────────────────────────────────────────────────────
-- REFERRALS  (contractor referral program)
-- ────────────────────────────────────────────────────────────
create table if not exists public.referrals (
  id              uuid    primary key default gen_random_uuid(),
  referrer_email  text    not null,
  referrer_tenant_id uuid,
  referral_code   text    not null unique,
  -- Conversion tracking
  clicks          integer not null default 0,
  signups         integer not null default 0,
  conversions     integer not null default 0,
  -- Discount earned
  discount_pct    integer not null default 0,   -- 10, 25, or 40
  discount_applied_at timestamptz,
  -- Status
  status          text    not null default 'active'
    check (status in ('active','used','expired')),
  expires_at      timestamptz default (now() + interval '1 year'),
  created_at      timestamptz not null default now()
);

create index if not exists idx_referrals_code on public.referrals (referral_code);
create index if not exists idx_referrals_referrer on public.referrals (referrer_email);

-- ────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS  (one per tenant — the active billing record)
-- ────────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id                    uuid    primary key default gen_random_uuid(),
  tenant_id             uuid    not null unique,
  plan_id               text    not null references public.plans(id),
  billing_interval      text    not null default 'monthly'
    check (billing_interval in ('monthly','annual')),
  status                text    not null default 'trialing'
    check (status in ('trialing','active','past_due','canceled','paused','incomplete')),
  -- Stripe integration
  stripe_customer_id    text,
  stripe_subscription_id text,
  stripe_payment_method text,   -- last 4 / card brand for display
  -- Pricing (snapshot at purchase time)
  price_cents           integer not null,
  -- Trial
  trial_ends_at         timestamptz,
  -- Billing dates
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  canceled_at           timestamptz,
  cancel_at             timestamptz,   -- scheduled cancellation
  -- Discounts
  referral_discount_pct integer not null default 0,
  coupon_code           text,
  coupon_discount_pct   integer not null default 0,
  -- Lead linkage
  lead_id               uuid    references public.leads(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_subscriptions_tenant on public.subscriptions (tenant_id);
create index if not exists idx_subscriptions_stripe on public.subscriptions (stripe_subscription_id);
create index if not exists idx_subscriptions_status on public.subscriptions (status);

-- ────────────────────────────────────────────────────────────
-- SUBSCRIPTION INVOICES  (every payment record)
-- ────────────────────────────────────────────────────────────
create table if not exists public.subscription_invoices (
  id                  uuid    primary key default gen_random_uuid(),
  subscription_id     uuid    not null references public.subscriptions(id) on delete cascade,
  tenant_id           uuid    not null,
  stripe_invoice_id   text,
  stripe_charge_id    text,
  amount_cents        integer not null,
  status              text    not null
    check (status in ('draft','open','paid','void','uncollectible')),
  paid_at             timestamptz,
  period_start        timestamptz,
  period_end          timestamptz,
  invoice_pdf_url     text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_sub_invoices_tenant on public.subscription_invoices (tenant_id, created_at desc);

-- ────────────────────────────────────────────────────────────
-- USAGE TRACKING  (AI takeoffs, storage, API calls per billing period)
-- ────────────────────────────────────────────────────────────
create table if not exists public.usage_tracking (
  id                    uuid    primary key default gen_random_uuid(),
  tenant_id             uuid    not null,
  subscription_id       uuid    references public.subscriptions(id) on delete set null,
  period_start          date    not null,
  period_end            date    not null,
  -- AI usage
  ai_takeoffs_used      integer not null default 0,
  ai_takeoffs_limit     integer,                    -- null = unlimited
  ai_bid_jackets_used   integer not null default 0,
  ai_project_creates    integer not null default 0,
  ai_chat_messages      integer not null default 0,
  -- Storage
  storage_used_gb       numeric(10,3) not null default 0,
  storage_limit_gb      integer,
  -- API
  api_calls_used        integer not null default 0,
  -- Overages billed
  overages_billed_cents integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (tenant_id, period_start)
);

create index if not exists idx_usage_tenant_period on public.usage_tracking (tenant_id, period_start desc);

-- ────────────────────────────────────────────────────────────
-- WHITE-LABEL RESELLER ACCOUNTS
-- ────────────────────────────────────────────────────────────
create table if not exists public.reseller_accounts (
  id                    uuid    primary key default gen_random_uuid(),
  tenant_id             uuid    not null unique,    -- the reseller's own tenant
  subscription_id       uuid    references public.subscriptions(id) on delete set null,
  -- Branding
  brand_name            text    not null,
  brand_slug            text    not null unique,    -- URL-safe, e.g. 'abc-construction'
  logo_url              text,
  primary_color         text    not null default '#1b3a5c',
  accent_color          text    not null default '#e07b39',
  font_family           text    not null default 'system-ui',
  -- Domain
  custom_domain         text,                       -- e.g. 'app.abcconstruction.com'
  domain_verified       boolean not null default false,
  domain_verified_at    timestamptz,
  ssl_provisioned       boolean not null default false,
  ssl_provisioned_at    timestamptz,
  -- DNS instructions (generated at signup)
  cname_target          text,                       -- e.g. 'tenants.saguarocrm.com'
  dns_verification_token text,
  -- Their billing to their own customers (not our problem, but track it)
  reseller_plan_name    text,                       -- what THEY call their plan
  reseller_monthly_price_cents integer,             -- what THEY charge their clients
  -- Limits from their plan
  max_contractor_tenants integer,
  active_contractor_tenants integer not null default 0,
  -- Feature flags (inherited from plan + overrides)
  features_enabled      jsonb   not null default '{}',
  -- Status
  status                text    not null default 'pending_payment'
    check (status in ('pending_payment','onboarding','dns_pending','active','suspended','canceled')),
  onboarded_at          timestamptz,
  -- Support
  support_email         text,
  support_phone         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_reseller_accounts_status on public.reseller_accounts (status);
create index if not exists idx_reseller_accounts_domain on public.reseller_accounts (custom_domain)
  where custom_domain is not null;

-- ────────────────────────────────────────────────────────────
-- WHITE-LABEL CONTRACTOR TENANTS  (clients of the reseller)
-- ────────────────────────────────────────────────────────────
create table if not exists public.reseller_tenants (
  id                  uuid    primary key default gen_random_uuid(),
  reseller_account_id uuid    not null references public.reseller_accounts(id) on delete cascade,
  tenant_id           uuid    not null unique,    -- the contractor's tenant
  email               text    not null,
  company_name        text,
  -- The reseller's own billing to this customer
  reseller_plan       text,
  reseller_price_cents integer,
  reseller_billing_interval text default 'monthly',
  -- Status
  status              text    not null default 'active'
    check (status in ('active','suspended','canceled')),
  activated_at        timestamptz not null default now(),
  canceled_at         timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists idx_reseller_tenants_reseller on public.reseller_tenants (reseller_account_id, status);

-- ────────────────────────────────────────────────────────────
-- ADD-ON PURCHASES  (one-off and recurring add-ons)
-- ────────────────────────────────────────────────────────────
create table if not exists public.addon_purchases (
  id              uuid    primary key default gen_random_uuid(),
  tenant_id       uuid    not null,
  addon_type      text    not null
    check (addon_type in ('extra_ai_takeoffs','priority_support','data_migration','custom_ai_training','extra_storage','api_boost')),
  quantity        integer not null default 1,
  price_cents     integer not null,
  stripe_charge_id text,
  notes           text,
  created_at      timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- TRIGGERS
-- ────────────────────────────────────────────────────────────

do $$ begin
  create trigger trg_leads_updated_at
    before update on public.leads
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_subscriptions_updated_at
    before update on public.subscriptions
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_usage_tracking_updated_at
    before update on public.usage_tracking
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_reseller_accounts_updated_at
    before update on public.reseller_accounts
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- ────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

alter table public.subscriptions       enable row level security;
alter table public.subscription_invoices enable row level security;
alter table public.usage_tracking      enable row level security;
alter table public.reseller_accounts   enable row level security;
alter table public.reseller_tenants    enable row level security;
alter table public.addon_purchases     enable row level security;

-- Tenants see only their own billing data
create policy if not exists "tenant sees own subscription"
  on public.subscriptions for select
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy if not exists "tenant sees own invoices"
  on public.subscription_invoices for select
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy if not exists "tenant sees own usage"
  on public.usage_tracking for select
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy if not exists "tenant sees own reseller account"
  on public.reseller_accounts for select
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy if not exists "reseller sees own contractor tenants"
  on public.reseller_tenants for select
  using (
    reseller_account_id in (
      select id from public.reseller_accounts
      where tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    )
  );

create policy if not exists "tenant sees own addons"
  on public.addon_purchases for select
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Plans are publicly readable
alter table public.plans enable row level security;
create policy if not exists "plans are public" on public.plans for select using (true);

-- ────────────────────────────────────────────────────────────
-- MRR DASHBOARD VIEW
-- ────────────────────────────────────────────────────────────

create or replace view public.mrr_summary as
select
  count(*) filter (where status = 'active')           as active_subscribers,
  count(*) filter (where status = 'trialing')         as trialing,
  count(*) filter (where status = 'past_due')         as past_due,
  count(*) filter (where status = 'canceled')         as churned_this_month,
  -- MRR calculation: normalize all billing to monthly
  sum(case
    when status = 'active' and billing_interval = 'monthly' then price_cents
    when status = 'active' and billing_interval = 'annual'  then price_cents / 12
    else 0
  end)                                                 as mrr_cents,
  -- ARR
  sum(case
    when status = 'active' and billing_interval = 'monthly' then price_cents * 12
    when status = 'active' and billing_interval = 'annual'  then price_cents
    else 0
  end)                                                 as arr_cents
from public.subscriptions;

-- MRR by plan
create or replace view public.mrr_by_plan as
select
  p.name                                              as plan_name,
  count(*) filter (where s.status = 'active')         as subscribers,
  sum(case
    when s.status = 'active' and s.billing_interval = 'monthly' then s.price_cents
    when s.status = 'active' and s.billing_interval = 'annual'  then s.price_cents / 12
    else 0
  end)                                                 as mrr_cents
from public.subscriptions s
join public.plans p on p.id = s.plan_id
group by p.name, p.sort_order
order by p.sort_order;



-- ============================================================
-- MIGRATION: 20260308_documents.sql
-- ============================================================

-- ============================================================
-- Saguaro CRM — Official Construction Document System
-- Migration: 20260308_documents.sql
-- Run AFTER: 20260308_foundation.sql, 20260308_core_modules.sql
-- ============================================================
-- Every real legal document generated by the AI bot.
-- AIA forms, lien waivers, pay applications, bid documents,
-- closeout packages — all auto-generated, tracked, and signed.
-- ============================================================

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ────────────────────────────────────────────────────────────
-- DOCUMENT TEMPLATES  (master library of form templates)
-- ────────────────────────────────────────────────────────────
create table if not exists public.document_templates (
  id            uuid    primary key default gen_random_uuid(),
  template_code text    not null unique,
  -- e.g. 'AIA_G702', 'AIA_G703', 'AIA_G704', 'AIA_G706',
  --      'AIA_A310_BID_BOND', 'AIA_A312_PERF_BOND', 'AIA_A312_PAY_BOND',
  --      'LIEN_WAIVER_COND_PARTIAL', 'LIEN_WAIVER_UNCOND_FINAL',
  --      'PRELIMINARY_NOTICE', 'WH347_CERTIFIED_PAYROLL',
  --      'NON_COLLUSION_AFFIDAVIT', 'W9', 'ACORD_25', 'CLOSEOUT_CHECKLIST'
  name          text    not null,
  category      text    not null
    check (category in ('pay_application','lien_waiver','bond','insurance','bid_document',
                        'closeout','payroll','government','subcontract','general')),
  description   text,
  -- Template content (HTML with {{placeholder}} fields)
  template_html text    not null,
  -- JSON schema of fields this template requires
  fields_schema jsonb   not null default '[]',
  -- Which states this applies to (null = federal/all states)
  applicable_states text[],
  -- Which project types require this document
  required_for  jsonb   not null default '[]',
  -- Is this legally required or recommended
  is_mandatory  boolean not null default false,
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists idx_doc_templates_category on public.document_templates (category, is_active);
create index if not exists idx_doc_templates_code     on public.document_templates (template_code);

-- ────────────────────────────────────────────────────────────
-- PROJECT DOCUMENTS  (every generated document per project)
-- ────────────────────────────────────────────────────────────
create table if not exists public.project_documents (
  id              uuid    primary key default gen_random_uuid(),
  tenant_id       uuid    not null,
  project_id      uuid    not null references public.projects(id) on delete cascade,
  template_code   text    references public.document_templates(template_code) on delete set null,
  -- What entity this document is attached to
  entity_type     text    check (entity_type in ('project','contract','invoice','rfi','change_order','bid_package','safety_incident','inspection','punch_list','subcontractor')),
  entity_id       uuid,
  -- Document metadata
  document_type   text    not null,  -- e.g. 'AIA G702', 'Conditional Lien Waiver'
  document_number text,              -- sequential: PAY-001, LW-2026-004
  title           text    not null,
  description     text,
  -- Content
  content_html    text,              -- AI-generated HTML document
  content_pdf_url text,              -- Supabase Storage path to PDF version
  -- Field values (JSON map of all filled fields)
  field_values    jsonb   not null default '{}',
  -- AI generation metadata
  ai_generated    boolean not null default false,
  ai_model        text,
  ai_generated_at timestamptz,
  ai_confidence   text    check (ai_confidence in ('high','medium','low')),
  ai_flags        jsonb   not null default '[]',  -- issues flagged by AI during generation
  -- Status workflow
  status          text    not null default 'draft'
    check (status in ('draft','ai_review','ready','sent','signed','voided','superseded')),
  -- Signature tracking
  requires_signature    boolean not null default false,
  signatory_name        text,
  signatory_email       text,
  signature_requested_at timestamptz,
  signed_at             timestamptz,
  signature_url         text,   -- DocuSign / HelloSign envelope URL
  -- Period
  period_start    date,
  period_end      date,
  -- Financial (for pay apps, lien waivers)
  gross_amount    numeric(14,2),
  retainage_amount numeric(14,2),
  net_amount      numeric(14,2),
  -- Misc
  notes           text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_project_documents_project  on public.project_documents (tenant_id, project_id, document_type, created_at desc);
create index if not exists idx_project_documents_entity   on public.project_documents (entity_type, entity_id);
create index if not exists idx_project_documents_status   on public.project_documents (status, requires_signature);

-- ────────────────────────────────────────────────────────────
-- PAY APPLICATIONS  (AIA G702/G703 data model)
-- ────────────────────────────────────────────────────────────
create table if not exists public.pay_applications (
  id                  uuid    primary key default gen_random_uuid(),
  tenant_id           uuid    not null,
  project_id          uuid    not null references public.projects(id) on delete cascade,
  contract_id         uuid    references public.contracts(id) on delete set null,
  document_id         uuid    references public.project_documents(id) on delete set null,
  -- AIA G702 fields
  application_number  integer not null,  -- sequential: 1, 2, 3...
  period_from         date    not null,
  period_to           date    not null,
  -- Contract summary
  contract_sum        numeric(14,2) not null default 0,
  net_change_orders   numeric(14,2) not null default 0,
  contract_sum_to_date numeric(14,2) generated always as (contract_sum + net_change_orders) stored,
  -- Work complete
  total_completed_and_stored numeric(14,2) not null default 0,
  pct_complete        numeric(5,2)  generated always as
    (case when contract_sum + net_change_orders > 0
          then 100.0 * total_completed_and_stored / (contract_sum + net_change_orders)
          else 0 end) stored,
  -- Retainage
  retainage_pct       numeric(5,2) not null default 10,
  retainage_held      numeric(14,2) not null default 0,
  -- Previous payments
  total_previous_payments numeric(14,2) not null default 0,
  -- Current application
  current_payment_due numeric(14,2) generated always as
    (total_completed_and_stored - retainage_held - total_previous_payments) stored,
  -- Balance
  balance_to_finish   numeric(14,2) generated always as
    (contract_sum + net_change_orders - total_completed_and_stored) stored,
  -- Status
  status              text    not null default 'draft'
    check (status in ('draft','submitted','certified','approved','paid','rejected','void')),
  submitted_at        timestamptz,
  certified_at        timestamptz,
  certified_by        text,
  paid_at             timestamptz,
  -- Lien waiver
  conditional_lien_waiver_id   uuid references public.project_documents(id) on delete set null,
  unconditional_lien_waiver_id uuid references public.project_documents(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_pay_apps_project  on public.pay_applications (project_id, application_number desc);
create index if not exists idx_pay_apps_contract on public.pay_applications (contract_id, status);

-- ────────────────────────────────────────────────────────────
-- SCHEDULE OF VALUES  (AIA G703 — line items for each pay app)
-- ────────────────────────────────────────────────────────────
create table if not exists public.schedule_of_values (
  id                  uuid    primary key default gen_random_uuid(),
  pay_application_id  uuid    not null references public.pay_applications(id) on delete cascade,
  contract_id         uuid    not null,
  -- AIA G703 columns
  item_number         text    not null,   -- A, B, C or 01, 02, 03
  description         text    not null,
  scheduled_value     numeric(14,2) not null default 0,
  -- From previous applications
  pct_complete_prev   numeric(5,2)  not null default 0,
  work_complete_prev  numeric(14,2) not null default 0,
  -- This period
  pct_complete_this   numeric(5,2)  not null default 0,
  work_complete_this  numeric(14,2) not null default 0,
  -- Materials stored
  materials_stored    numeric(14,2) not null default 0,
  -- Totals (computed)
  total_complete_and_stored numeric(14,2) generated always as
    (work_complete_prev + work_complete_this + materials_stored) stored,
  pct_complete_total  numeric(5,2)  generated always as
    (case when scheduled_value > 0
          then 100.0 * (work_complete_prev + work_complete_this + materials_stored) / scheduled_value
          else 0 end) stored,
  balance_to_finish   numeric(14,2) generated always as
    (scheduled_value - work_complete_prev - work_complete_this - materials_stored) stored,
  retainage           numeric(14,2) not null default 0,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists idx_sov_pay_app on public.schedule_of_values (pay_application_id, sort_order);

-- ────────────────────────────────────────────────────────────
-- LIEN WAIVERS  (conditional + unconditional, partial + final)
-- ────────────────────────────────────────────────────────────
create table if not exists public.lien_waivers (
  id                  uuid    primary key default gen_random_uuid(),
  tenant_id           uuid    not null,
  project_id          uuid    not null references public.projects(id) on delete cascade,
  contract_id         uuid    references public.contracts(id) on delete set null,
  pay_application_id  uuid    references public.pay_applications(id) on delete set null,
  document_id         uuid    references public.project_documents(id) on delete set null,
  -- Waiver classification
  waiver_type         text    not null
    check (waiver_type in (
      'conditional_partial',    -- Claimant received payment contingent on clearing
      'unconditional_partial',  -- Claimant received and cleared payment (partial)
      'conditional_final',      -- Final payment pending
      'unconditional_final'     -- All amounts received, final waiver
    )),
  -- State (determines statutory form)
  state               text    not null,   -- 'AZ', 'CA', 'TX', 'NV', 'NM', 'FL', etc.
  -- Parties
  claimant_name       text    not null,   -- Sub or supplier giving the waiver
  claimant_address    text,
  claimant_license    text,
  owner_name          text,
  gc_name             text,
  -- Project
  project_address     text,
  -- Amounts
  through_date        date,               -- "through [date]" — the period covered
  amount              numeric(14,2) not null,   -- amount being waived
  exceptions          text,               -- "EXCEPT: unpaid invoices for..."
  -- Status
  status              text    not null default 'draft'
    check (status in ('draft','sent','signed','voided')),
  sent_at             timestamptz,
  signed_at           timestamptz,
  signer_name         text,
  signer_title        text,
  notarized           boolean not null default false,
  notarized_at        timestamptz,
  -- Notary (some states require)
  notary_name         text,
  notary_commission   text,
  -- AI generation
  ai_generated        boolean not null default false,
  statutory_compliant boolean not null default true,  -- using the correct statutory form
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_lien_waivers_project  on public.lien_waivers (project_id, waiver_type, status);
create index if not exists idx_lien_waivers_contract on public.lien_waivers (contract_id, signed_at desc);

-- ────────────────────────────────────────────────────────────
-- BID DOCUMENTS  (all documents in the bid folder per package)
-- ────────────────────────────────────────────────────────────
create table if not exists public.bid_documents (
  id              uuid    primary key default gen_random_uuid(),
  tenant_id       uuid    not null,
  bid_package_id  uuid    not null references public.bid_packages(id) on delete cascade,
  document_type   text    not null
    check (document_type in (
      'instructions_to_bidders',
      'bid_form',
      'bid_bond',
      'non_collusion_affidavit',
      'subcontractor_list',
      'insurance_requirements',
      'prevailing_wage_determination',
      'eeo_requirements',
      'mwbe_requirements',
      'project_schedule',
      'reference_requirements',
      'general_conditions_summary',
      'addendum',
      'other'
    )),
  document_number text,   -- e.g. 'ADD-001' for addenda
  title           text    not null,
  content_html    text,   -- AI-generated content
  file_url        text,   -- Supabase Storage URL if uploaded
  version         text    not null default '1',
  ai_generated    boolean not null default false,
  status          text    not null default 'draft'
    check (status in ('draft','issued','superseded')),
  issued_at       timestamptz,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_bid_documents_package on public.bid_documents (bid_package_id, document_type, status);

-- ────────────────────────────────────────────────────────────
-- CLOSEOUT PACKAGES  (final project completion documentation)
-- ────────────────────────────────────────────────────────────
create table if not exists public.closeout_packages (
  id              uuid    primary key default gen_random_uuid(),
  tenant_id       uuid    not null,
  project_id      uuid    not null references public.projects(id) on delete cascade,
  -- Required documents checklist (AI auto-generates this from project type)
  checklist       jsonb   not null default '[]',
  -- [{item, document_type, required, received, document_id, notes}]
  status          text    not null default 'not_started'
    check (status in ('not_started','in_progress','ready_for_submission','submitted','accepted')),
  pct_complete    integer not null default 0,
  -- Key dates
  target_date     date,
  submitted_at    timestamptz,
  accepted_at     timestamptz,
  -- Assembled document package URL (ZIP in Supabase Storage)
  package_url     text,
  package_built_at timestamptz,
  -- AI generation
  ai_generated    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_closeout_packages_project on public.closeout_packages (project_id);

-- ────────────────────────────────────────────────────────────
-- VENDOR COMPLIANCE  (W-9, insurance tracking per vendor)
-- ────────────────────────────────────────────────────────────
create table if not exists public.vendor_compliance (
  id                    uuid    primary key default gen_random_uuid(),
  tenant_id             uuid    not null,
  subcontractor_company_id uuid references public.subcontractor_companies(id) on delete cascade,
  -- W-9 tracking (required for 1099 filing if payments >$600/yr)
  w9_on_file            boolean not null default false,
  w9_received_at        timestamptz,
  w9_document_id        uuid    references public.project_documents(id) on delete set null,
  tax_id_last4          text,   -- last 4 of EIN/SSN for verification
  -- Insurance certificate (ACORD 25)
  insurance_cert_on_file boolean not null default false,
  insurance_expires_at  timestamptz,
  insurance_document_id uuid    references public.project_documents(id) on delete set null,
  -- GL limit verified
  gl_limit_verified     numeric(14,2),
  -- License verification
  license_number        text,
  license_state         text,
  license_expires_at    date,
  license_verified_at   timestamptz,
  -- Performance bond
  bond_on_file          boolean not null default false,
  bond_amount           numeric(14,2),
  bond_surety           text,
  bond_expires_at       date,
  -- Overall compliance status
  is_compliant          boolean not null default false,
  compliance_notes      text,
  last_verified_at      timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_vendor_compliance_sub on public.vendor_compliance (tenant_id, subcontractor_company_id);
create index if not exists idx_vendor_compliance_insurance on public.vendor_compliance (insurance_expires_at)
  where insurance_cert_on_file = true;

-- ────────────────────────────────────────────────────────────
-- FORM AUTO-FILL LOG  (track every AI auto-population)
-- ────────────────────────────────────────────────────────────
create table if not exists public.form_autofill_log (
  id              uuid    primary key default gen_random_uuid(),
  tenant_id       uuid    not null,
  project_id      uuid,
  form_type       text    not null,  -- 'rfi', 'change_order', 'pay_app', 'lien_waiver', etc.
  entity_id       uuid,
  -- What AI filled
  fields_available integer not null default 0,   -- total fields in form
  fields_filled    integer not null default 0,   -- fields AI could fill
  fill_pct         integer generated always as
    (case when fields_available > 0 then 100 * fields_filled / fields_available else 0 end) stored,
  -- AI metadata
  ai_model         text,
  context_sources  jsonb not null default '[]',  -- ['project', 'contract', 'bid_jacket', ...]
  created_at       timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- TRIGGERS
-- ────────────────────────────────────────────────────────────

do $$ begin create trigger trg_project_documents_updated_at before update on public.project_documents for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_pay_applications_updated_at before update on public.pay_applications for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_lien_waivers_updated_at before update on public.lien_waivers for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_bid_documents_updated_at before update on public.bid_documents for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_closeout_packages_updated_at before update on public.closeout_packages for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger trg_vendor_compliance_updated_at before update on public.vendor_compliance for each row execute function public.set_updated_at(); exception when duplicate_object then null; end $$;

-- ────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

alter table public.document_templates    enable row level security;
alter table public.project_documents     enable row level security;
alter table public.pay_applications      enable row level security;
alter table public.schedule_of_values    enable row level security;
alter table public.lien_waivers          enable row level security;
alter table public.bid_documents         enable row level security;
alter table public.closeout_packages     enable row level security;
alter table public.vendor_compliance     enable row level security;
alter table public.form_autofill_log     enable row level security;

create policy if not exists "document_templates are public read"
  on public.document_templates for select using (is_active = true);

create policy if not exists "tenant isolation on project_documents"
  on public.project_documents for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy if not exists "tenant isolation on pay_applications"
  on public.pay_applications for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy if not exists "tenant isolation on schedule_of_values"
  on public.schedule_of_values for all
  using (pay_application_id in (
    select id from public.pay_applications where tenant_id = public.my_tenant_id()
  ));

create policy if not exists "tenant isolation on lien_waivers"
  on public.lien_waivers for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy if not exists "tenant isolation on bid_documents"
  on public.bid_documents for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy if not exists "tenant isolation on closeout_packages"
  on public.closeout_packages for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy if not exists "tenant isolation on vendor_compliance"
  on public.vendor_compliance for all
  using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy if not exists "tenant isolation on form_autofill_log"
  on public.form_autofill_log for select
  using (tenant_id = public.my_tenant_id());

-- ────────────────────────────────────────────────────────────
-- VIEWS
-- ────────────────────────────────────────────────────────────

-- Project document completeness dashboard
create or replace view public.project_document_status as
select
  p.id                                              as project_id,
  p.tenant_id,
  p.name                                            as project_name,
  count(d.id)                                       as total_documents,
  count(d.id) filter (where d.status = 'signed')   as signed_documents,
  count(d.id) filter (where d.status = 'draft')    as draft_documents,
  count(d.id) filter (where d.requires_signature and d.signed_at is null) as awaiting_signature,
  count(lw.id)                                      as lien_waivers_total,
  count(lw.id) filter (where lw.status = 'signed') as lien_waivers_signed,
  max(pa.application_number)                        as latest_pay_app_number,
  sum(pa.current_payment_due) filter (where pa.status = 'approved') as approved_payment_due
from public.projects p
left join public.project_documents d   on d.project_id = p.id
left join public.lien_waivers lw       on lw.project_id = p.id
left join public.pay_applications pa   on pa.project_id = p.id
group by p.id, p.tenant_id, p.name;

-- Vendor compliance dashboard
create or replace view public.vendor_compliance_summary as
select
  vc.*,
  sc.name                       as company_name,
  sc.primary_email              as company_email,
  (vc.w9_on_file and vc.insurance_cert_on_file
   and (vc.insurance_expires_at is null or vc.insurance_expires_at > now())
   and (vc.license_expires_at is null or vc.license_expires_at > current_date))
                                as fully_compliant,
  case
    when vc.insurance_expires_at < now() + interval '30 days' then 'expiring_soon'
    when vc.insurance_expires_at < now()                       then 'expired'
    else 'current'
  end                           as insurance_status
from public.vendor_compliance vc
join public.subcontractor_companies sc on sc.id = vc.subcontractor_company_id;



-- ============================================================
-- MIGRATION: 20260308_documents_v2.sql
-- ============================================================

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


