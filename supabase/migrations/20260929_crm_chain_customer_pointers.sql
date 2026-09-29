-- Phase 3: give the CRM chain real pointers.
--
-- Before this, Lead, Customer and Project were three islands. lead_pipeline had
-- no customer_id and no project_id, projects had no customer_id, and contacts
-- hung off project_id alone. The Customers page joined customers to projects by
-- matching owner_email, then owner_name, then the literal "<Name> Project"
-- naming its own button used — a string convention doing the job of a key.
--
-- Every statement here is additive and idempotent. No column is dropped,
-- renamed or retyped, every new column is nullable, and no existing row is
-- modified by this file. Queries that read these tables today are unaffected.
--
-- ON DELETE SET NULL throughout, deliberately: removing a customer must never
-- cascade into deleting a project, a lead or a contact. The pointer goes null
-- and the record survives.

ALTER TABLE projects      ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE lead_pipeline ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE lead_pipeline ADD COLUMN IF NOT EXISTS project_id  UUID;
ALTER TABLE contacts      ADD COLUMN IF NOT EXISTS customer_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_customer_id_fkey') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customer_profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_pipeline_customer_id_fkey') THEN
    ALTER TABLE lead_pipeline ADD CONSTRAINT lead_pipeline_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customer_profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_pipeline_project_id_fkey') THEN
    ALTER TABLE lead_pipeline ADD CONSTRAINT lead_pipeline_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_customer_id_fkey') THEN
    ALTER TABLE contacts ADD CONSTRAINT contacts_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customer_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Partial indexes: the overwhelming majority of rows will carry NULL for years,
-- and there is no query that wants them.
CREATE INDEX IF NOT EXISTS idx_projects_customer_id
  ON projects(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_pipeline_customer_id
  ON lead_pipeline(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_pipeline_project_id
  ON lead_pipeline(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_customer_id
  ON contacts(customer_id) WHERE customer_id IS NOT NULL;

-- Backfill, only where the match is unambiguous: exactly one candidate customer
-- in the same tenant, matched on an exact email. A row with two possible
-- customers is left NULL rather than guessed at — the fallback matching in
-- app/app/customers/page.tsx still covers it, and a wrong link is worse than
-- no link.

WITH m AS (
  SELECT p.id pid, MIN(c.id::text)::uuid cid, COUNT(*) n
  FROM projects p
  JOIN customer_profiles c
    ON c.tenant_id = p.tenant_id
   AND NULLIF(LOWER(TRIM(c.email)),'') = NULLIF(LOWER(TRIM(p.owner_email)),'')
  WHERE p.customer_id IS NULL
  GROUP BY p.id
)
UPDATE projects p SET customer_id = m.cid
FROM m WHERE m.pid = p.id AND m.n = 1;

WITH m AS (
  SELECT l.id lid, MIN(c.id::text)::uuid cid, COUNT(*) n
  FROM lead_pipeline l
  JOIN customer_profiles c
    ON c.tenant_id = l.tenant_id
   AND NULLIF(LOWER(TRIM(c.email)),'') = NULLIF(LOWER(TRIM(l.email)),'')
  WHERE l.customer_id IS NULL
  GROUP BY l.id
)
UPDATE lead_pipeline l SET customer_id = m.cid
FROM m WHERE m.lid = l.id AND m.n = 1;

-- A won lead points at the job it became, where that customer owns exactly one.
WITH m AS (
  SELECT l.id lid, MIN(p.id::text)::uuid pid, COUNT(*) n
  FROM lead_pipeline l
  JOIN projects p ON p.tenant_id = l.tenant_id AND p.customer_id = l.customer_id
  WHERE l.project_id IS NULL AND l.customer_id IS NOT NULL AND l.won_at IS NOT NULL
  GROUP BY l.id
)
UPDATE lead_pipeline l SET project_id = m.pid
FROM m WHERE m.lid = l.id AND m.n = 1;
