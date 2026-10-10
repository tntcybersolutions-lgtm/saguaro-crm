-- A GC can revoke one bidder's link.
--
-- The bidder portal (app/api/bid-packages/portal/[token]) and the respond route
-- have always refused an invite whose status is 'revoked', but the CHECK
-- constraint only allowed suggested / invited / viewed / submitted / declined,
-- so nothing could ever write it and no link could be cut off.
-- POST /api/bid-packages/[id]/invites/[inviteId]/revoke writes it; until this
-- is applied that route answers 503 and changes nothing.
--
-- Additive: every value allowed before is still allowed.
alter table public.bid_package_invites
  drop constraint if exists bid_package_invites_status_check;
alter table public.bid_package_invites
  add constraint bid_package_invites_status_check
  check (status = any (array['suggested'::text, 'invited'::text, 'viewed'::text, 'submitted'::text, 'declined'::text, 'revoked'::text]));
