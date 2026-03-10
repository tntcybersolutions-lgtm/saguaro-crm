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
