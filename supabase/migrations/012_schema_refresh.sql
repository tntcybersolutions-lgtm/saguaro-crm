-- Migration 012: Schema refresh + ensure all project columns exist
-- Fixes PostgREST schema cache "table in schema" error on project creation

-- Ensure all columns used by /api/projects/create exist (idempotent)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS original_contract          numeric(14,2) DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS original_contract_amount   numeric(14,2) DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS retainage_pct              numeric DEFAULT 10;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_public_project          boolean DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS prevailing_wage            boolean DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_entity               jsonb DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS architect_entity           jsonb DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS architect_name             text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS architect_email            text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_name                 text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_email                text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ntp_date                   date;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS substantial_date           date;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS final_completion_date      date;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS state_jurisdiction         text DEFAULT 'AZ';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type               text DEFAULT 'commercial';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description                text DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS metadata                   jsonb DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by                 uuid REFERENCES auth.users(id);

-- Reload PostgREST schema cache so all columns become visible immediately
NOTIFY pgrst, 'reload schema';
