-- Every email Saguaro sends (and every message it carries) about a job or a
-- bid package, recorded where it happens so a bid jacket holds the whole
-- conversation — invites, reminders, addenda, award notices — not just the
-- documents. Append-only; written by the server (service role), read through
-- tenant-scoped API routes. Additive: nothing existing changes.
create table if not exists public.communication_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  bid_package_id uuid references public.bid_packages(id) on delete cascade,
  sub_id uuid references public.subcontractors(id) on delete set null,
  channel text not null default 'email',          -- email | portal_message | sms
  direction text not null default 'out',          -- out | in
  to_address text,
  to_name text,
  from_name text,
  subject text,
  body text,
  status text not null default 'sent',            -- sent | failed | not_sent
  error text,
  related_type text,                              -- bid_invite | bid_reminder | addendum | bid_award | bid_not_awarded | bid_received | ...
  related_id uuid,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists communication_log_tenant_package_idx on public.communication_log (tenant_id, bid_package_id, created_at desc);
create index if not exists communication_log_tenant_project_idx on public.communication_log (tenant_id, project_id, created_at desc);

alter table public.communication_log enable row level security;
-- No policies: only the server (service role) reads and writes it.
