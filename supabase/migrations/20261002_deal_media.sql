-- Deal media / documents (sales workspace media hub).
-- Files, photos, docs and videos attached to a deal (lead). Bytes live in the
-- existing private 'project-files' bucket under deals/<leadId>/; this table is
-- the index, listed + signed for download on read ("up = down"). RLS mirrors
-- the tenant tables (authenticated gated on get_tenant_id(); service_role full).
-- Applied to project jddfvugsaosvgllbkzch on 2026-10-02.

create table if not exists public.deal_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  lead_id uuid not null,
  name text not null,
  path text not null,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz default now()
);

alter table public.deal_media enable row level security;

create policy deal_media_sel on public.deal_media for select to authenticated using (tenant_id = get_tenant_id());
create policy deal_media_ins on public.deal_media for insert to authenticated with check (tenant_id = get_tenant_id());
create policy deal_media_upd on public.deal_media for update to authenticated using (tenant_id = get_tenant_id());
create policy deal_media_del on public.deal_media for delete to authenticated using (tenant_id = get_tenant_id());
create policy deal_media_svc on public.deal_media for all to service_role using (true) with check (true);

create index if not exists deal_media_lead_idx on public.deal_media (tenant_id, lead_id, created_at desc);
