-- Permit correspondence / transmittal log — track documents and messages sent
-- to and received from architects and city / AHJ officials for a project's
-- permits, so the whole back-and-forth is stored and auditable in one place.
-- Applied to the live "Saguaro CRM" project (jddfvugsaosvgllbkzch).

create table if not exists public.permit_correspondence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  permit_id uuid,
  direction text not null default 'outbound',           -- outbound | inbound
  party text,                                            -- Architect | City / AHJ | Engineer | Other
  party_name text,
  subject text not null,
  notes text,
  document_ids jsonb not null default '[]'::jsonb,        -- attached project_files ids
  status text not null default 'sent',                   -- sent | received | responded | closed
  sent_at timestamptz default now(),
  responded_at timestamptz,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_permit_corr_tenant_project
  on public.permit_correspondence (tenant_id, project_id, created_at desc);

alter table public.permit_correspondence enable row level security;

drop policy if exists permit_corr_tenant_rw on public.permit_correspondence;
create policy permit_corr_tenant_rw on public.permit_correspondence
  for all to authenticated
  using (tenant_id = public.get_tenant_id())
  with check (tenant_id = public.get_tenant_id());

drop policy if exists permit_corr_service on public.permit_correspondence;
create policy permit_corr_service on public.permit_correspondence
  for all to service_role
  using (true) with check (true);
