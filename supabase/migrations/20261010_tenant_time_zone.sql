-- Each company works in its own time zone (an IANA name such as America/Chicago):
-- "today", deadlines, COI expiry, clock windows and reminders are computed in it.
-- Null until the company's first signed-in owner/admin session records the
-- zone its device reports (they can change it in Settings). Additive.
alter table public.tenants add column if not exists time_zone text;
comment on column public.tenants.time_zone is 'IANA time zone the company works in (e.g. America/Chicago). Set from the owner''s device on first use; editable in Settings.';
