-- Calendar sync: each person's private subscribe link (Google / Outlook / iPhone
-- subscribe to /api/calendar/<token>). Service role only; the token is the auth
-- for the feed and can be reset from Settings → Calendar Sync.
create table if not exists public.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null unique,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
revoke all on public.calendar_feeds from anon, authenticated;
