-- Sub portal links expire.
--
-- portal_sub_sessions had no expiry: a link emailed to a subcontractor worked
-- forever unless the GC revoked it by hand. A link now lasts 90 days from the
-- day it was issued, and the clock restarts whenever the GC (or the sub, from
-- their own inbox) has it emailed again. Every token lookup in app/api/portal/sub
-- checks expires_at > now(); an expired link gets a "this link has expired"
-- page and the GC reissues it from Portals.
--
-- Existing active links get 90 days from today, so nobody using the portal
-- now is locked out by this change.
ALTER TABLE public.portal_sub_sessions
  ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT (now() + interval '90 days');
UPDATE public.portal_sub_sessions SET expires_at = now() + interval '90 days' WHERE expires_at IS NULL;
ALTER TABLE public.portal_sub_sessions ALTER COLUMN expires_at SET NOT NULL;
