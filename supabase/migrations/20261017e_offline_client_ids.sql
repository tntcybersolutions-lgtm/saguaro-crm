-- Offline field work: a record written on a phone with no signal is sent later,
-- and may be sent more than once (the first send reached the server but the
-- answer never came back). Each one carries the id the phone gave it, so the
-- server can say "already have it" instead of writing a second row.
--
-- Additive only: new nullable columns + partial unique indexes. Rows written
-- without a client id (every row before this) are untouched.
--
--   daily_logs.client_id     — the phone's id for a daily log it created
--   photos.client_id         — the phone's id for a photo it kept and uploaded
--   time_entries.client_id   — the phone's id for the clock-in that opened the shift
--   time_entries.client_out_id — the phone's id for the clock-out that closed it

ALTER TABLE public.daily_logs   ADD COLUMN IF NOT EXISTS client_id text;
ALTER TABLE public.photos       ADD COLUMN IF NOT EXISTS client_id text;
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS client_id text;
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS client_out_id text;

CREATE UNIQUE INDEX IF NOT EXISTS daily_logs_tenant_client_id_key
  ON public.daily_logs (tenant_id, client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS photos_tenant_client_id_key
  ON public.photos (tenant_id, client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_tenant_client_id_key
  ON public.time_entries (tenant_id, client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_tenant_client_out_id_key
  ON public.time_entries (tenant_id, client_out_id) WHERE client_out_id IS NOT NULL;
