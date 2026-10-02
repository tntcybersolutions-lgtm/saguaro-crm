-- Customer reviews / reputation (sales workspace).
-- The one sales feature the competitor gap audit found fully missing.
-- RLS mirrors the tenant tables exactly: authenticated rows are gated on
-- get_tenant_id(); the service_role has full access (the app's API routes use
-- the service client and tenant-scope every query themselves).
-- Applied to project jddfvugsaosvgllbkzch on 2026-10-02.

create table if not exists public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid,
  project_id uuid,
  reviewer_name text,
  rating int not null check (rating between 1 and 5),
  body text,
  source text default 'internal',
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.customer_reviews enable row level security;

create policy customer_reviews_sel on public.customer_reviews for select to authenticated using (tenant_id = get_tenant_id());
create policy customer_reviews_ins on public.customer_reviews for insert to authenticated with check (tenant_id = get_tenant_id());
create policy customer_reviews_upd on public.customer_reviews for update to authenticated using (tenant_id = get_tenant_id());
create policy customer_reviews_del on public.customer_reviews for delete to authenticated using (tenant_id = get_tenant_id());
create policy customer_reviews_svc on public.customer_reviews for all to service_role using (true) with check (true);

create index if not exists customer_reviews_tenant_created_idx on public.customer_reviews (tenant_id, created_at desc);
