-- Online payments (Stripe Connect, Express): an owner pays the GC's invoice by
-- card or bank. Each company connects its own Stripe account; see lib/online-payments.ts.
alter table public.tenants add column if not exists stripe_connect_account_id text;
alter table public.tenants add column if not exists online_payments_ready boolean not null default false;
alter table public.portal_payments add column if not exists invoice_id uuid;
alter table public.portal_payments add column if not exists stripe_session_id text;
alter table public.portal_payments add column if not exists method text;
-- One row per Stripe Checkout session: a re-delivered webhook can't record a payment twice.
create unique index if not exists portal_payments_stripe_session_uidx on public.portal_payments (stripe_session_id) where stripe_session_id is not null;
