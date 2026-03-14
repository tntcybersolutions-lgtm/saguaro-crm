-- ════════════════════════════════════════════════════════════════
-- 020 — Fix portal session schemas to match API expectations
-- ════════════════════════════════════════════════════════════════

-- ─── portal_client_sessions ─────────────────────────────────────
-- Add missing columns the API inserts
ALTER TABLE portal_client_sessions
  ADD COLUMN IF NOT EXISTS expires_at   timestamptz,
  ADD COLUMN IF NOT EXISTS created_by   uuid;

-- Remove the default token so API supplies its own
ALTER TABLE portal_client_sessions
  ALTER COLUMN token DROP DEFAULT;

-- ─── portal_sub_sessions ────────────────────────────────────────
-- Add sub_id FK and created_by
ALTER TABLE portal_sub_sessions
  ADD COLUMN IF NOT EXISTS sub_id       uuid,
  ADD COLUMN IF NOT EXISTS created_by   uuid;

-- Remove the default token so API supplies its own
ALTER TABLE portal_sub_sessions
  ALTER COLUMN token DROP DEFAULT;

-- Make the old required columns nullable (API doesn't fill them)
ALTER TABLE portal_sub_sessions
  ALTER COLUMN sub_company       DROP NOT NULL,
  ALTER COLUMN sub_contact_name  DROP NOT NULL,
  ALTER COLUMN sub_email         DROP NOT NULL;
