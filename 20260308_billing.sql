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
