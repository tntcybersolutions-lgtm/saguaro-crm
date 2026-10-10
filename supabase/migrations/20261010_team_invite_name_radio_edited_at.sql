-- The invitee's name typed on an invite, and the "edited" stamp on a corrected
-- radio message. Both screens already send these through
-- lib/optional-column.ts, which drops a column only while it is missing.
alter table public.team_invites add column if not exists name text;
alter table public.radio_messages add column if not exists edited_at timestamptz;
