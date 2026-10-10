-- My Work snoozes: a person hides one item on their to-do list until a day.
-- item_key is lib/my-work's stable key for the thing to do (e.g.
-- 'bid-link:<package id>', 'rfi:<rfi id>'); the item shows again ON `until`.
-- One row per person per item: snoozing again moves the day. Written and read
-- by /api/my-work/snooze and /api/my-work (service role, tenant + user scoped);
-- RLS mirrors the neighbouring tables. Until this is applied the page hides
-- Snooze and the API answers 503 — nothing else depends on it.
-- Additive and idempotent.

create table if not exists public.my_work_snoozes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null,
  item_key text not null,
  until date not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, item_key)
);

create index if not exists my_work_snoozes_user_idx on public.my_work_snoozes (tenant_id, user_id, until);

alter table public.my_work_snoozes enable row level security;

drop policy if exists my_work_snoozes_sel on public.my_work_snoozes;
drop policy if exists my_work_snoozes_ins on public.my_work_snoozes;
drop policy if exists my_work_snoozes_upd on public.my_work_snoozes;
drop policy if exists my_work_snoozes_del on public.my_work_snoozes;
drop policy if exists my_work_snoozes_svc on public.my_work_snoozes;

-- A person's snoozes are their own: same tenant AND their own user id.
create policy my_work_snoozes_sel on public.my_work_snoozes for select to authenticated using (tenant_id = get_tenant_id() and user_id = auth.uid());
create policy my_work_snoozes_ins on public.my_work_snoozes for insert to authenticated with check (tenant_id = get_tenant_id() and user_id = auth.uid());
create policy my_work_snoozes_upd on public.my_work_snoozes for update to authenticated using (tenant_id = get_tenant_id() and user_id = auth.uid()) with check (tenant_id = get_tenant_id() and user_id = auth.uid());
create policy my_work_snoozes_del on public.my_work_snoozes for delete to authenticated using (tenant_id = get_tenant_id() and user_id = auth.uid());
create policy my_work_snoozes_svc on public.my_work_snoozes for all to service_role using (true) with check (true);
