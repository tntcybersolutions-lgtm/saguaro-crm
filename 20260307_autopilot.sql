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
