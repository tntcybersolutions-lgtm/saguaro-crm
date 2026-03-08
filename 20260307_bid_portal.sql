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

alter table public.bid_packages add column if not exists awarded_submission_id uuid;
alter table public.bid_packages add column if not exists code text not null default '';
alter table public.bid_packages add column if not exists updated_at timestamptz not null default now();

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
  updated_at timestamptz not null default now(),
  unique (bid_package_id, subcontractor_company_id)
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
