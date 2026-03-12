-- ============================================================
-- Saguaro CRM — Takeoffs & Takeoff Materials
-- Migration: 010_takeoffs.sql
-- Creates the takeoffs and takeoff_materials tables used by
-- the AI Blueprint Takeoff system (claude-sonnet-4-6 vision).
-- ============================================================

-- ── takeoffs ─────────────────────────────────────────────────
-- One record per AI takeoff run. Stores the blueprint file
-- reference and summary data returned by the AI.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.takeoffs (
  id                    uuid        primary key default gen_random_uuid(),
  project_id            uuid        not null,
  name                  text        not null default 'New Takeoff',

  -- File info (populated after upload)
  file_url              text,
  file_name             text,
  file_type             text,
  file_size             bigint,
  storage_path          text,

  -- Processing state
  status                text        not null default 'pending'
    check (status in ('pending','uploaded','analyzing','complete','failed')),

  -- AI-detected project metadata
  project_name_detected text,
  building_type         text,
  summary               text,
  floor_count           integer,

  -- AI cost summary
  building_area         numeric(12,2) default 0,   -- total SF
  total_cost            numeric(14,2) default 0,
  material_cost         numeric(14,2) default 0,
  labor_cost            numeric(14,2) default 0,
  contingency_pct       numeric(5,2)  default 10,
  confidence            integer       default 0,   -- 0-100

  -- AI recommendations array
  recommendations       jsonb         default '[]',

  -- Timestamps
  analyzed_at           timestamptz,
  created_at            timestamptz   not null default now(),
  updated_at            timestamptz   not null default now()
);

-- Index for project lookups (most common query)
create index if not exists takeoffs_project_id_idx
  on public.takeoffs (project_id, status, created_at desc);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists takeoffs_updated_at on public.takeoffs;
create trigger takeoffs_updated_at
  before update on public.takeoffs
  for each row execute function public.set_updated_at();

-- ── takeoff_materials ─────────────────────────────────────────
-- Each row is one CSI line item from the AI takeoff result.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.takeoff_materials (
  id            uuid        primary key default gen_random_uuid(),
  takeoff_id    uuid        not null references public.takeoffs(id) on delete cascade,

  -- CSI MasterFormat fields
  csi_code      text        not null default '',   -- e.g. "03 30 00"
  csi_name      text        not null default '',   -- e.g. "Cast-in-Place Concrete"

  -- Item details
  description   text        not null default '',
  quantity      numeric(14,4) not null default 0,
  unit          text        not null default 'LS', -- CY, SF, LF, EA, LB, etc.

  -- Pricing
  unit_cost     numeric(14,4) not null default 0,
  total_cost    numeric(14,2) not null default 0,

  -- Labor
  labor_hours   numeric(10,2) not null default 0,

  -- Notes from AI
  notes         text          default '',

  -- Sort order preserves AI output order
  sort_order    integer       default 0,

  created_at    timestamptz   not null default now()
);

-- Index for fast lookup by takeoff
create index if not exists takeoff_materials_takeoff_id_idx
  on public.takeoff_materials (takeoff_id, csi_code, sort_order);

-- ── Row Level Security ────────────────────────────────────────
-- Using service-role key for all API calls, so RLS is not
-- strictly required. Enabling it with a permissive policy
-- keeps the door open for future per-user access control.
-- ─────────────────────────────────────────────────────────────
alter table public.takeoffs         enable row level security;
alter table public.takeoff_materials enable row level security;

-- Service role bypasses RLS automatically.
-- Allow service role full access (already the default, but explicit):
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'takeoffs' and policyname = 'service_role_all'
  ) then
    create policy service_role_all on public.takeoffs
      for all using (true) with check (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'takeoff_materials' and policyname = 'service_role_all'
  ) then
    create policy service_role_all on public.takeoff_materials
      for all using (true) with check (true);
  end if;
end $$;

-- ── Supabase Storage: blueprints bucket ──────────────────────
-- Create the storage bucket for blueprint files if it doesn't
-- exist. Run this separately in Supabase Storage dashboard if
-- the SQL insert fails due to permissions.
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'blueprints',
  'blueprints',
  false,   -- private bucket — use service role to access
  52428800, -- 50MB max file size
  array['application/pdf','image/png','image/jpeg','image/tiff','image/webp']
)
on conflict (id) do nothing;
