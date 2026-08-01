-- takeoffs.created_by — audit trail for who created a takeoff.
--
-- This column already exists on the production project (jddfvugsaosvgllbkzch);
-- the prod "Could not find the 'created_by' column ... in the schema cache"
-- error (PGRST204) was a STALE PostgREST schema cache, not a missing column —
-- resolved by `notify pgrst, 'reload schema'`. This migration exists so fresh
-- environments (and the repo history) stay in parity. Idempotent.

alter table public.takeoffs
  add column if not exists created_by uuid references auth.users(id);

comment on column public.takeoffs.created_by is 'auth.users id of the creator (audit trail; nullable for service-context inserts).';

-- Make sure PostgREST picks up the column immediately.
notify pgrst, 'reload schema';
