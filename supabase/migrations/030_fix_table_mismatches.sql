-- ============================================================================
-- Migration 030: Fix Table Name Mismatches & Create Missing Tables
-- ============================================================================
-- Problem: Multiple API routes reference table names that don't match
-- the actual migration-created tables. This breaks photos, clock,
-- punch list, safety, and takeoff features silently.
--
-- Strategy: Use PostgreSQL VIEWS for simple name mappings (fully
-- insertable/updatable through PostgREST on single-table views).
-- Create new tables where no equivalent exists.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. PHOTOS: API calls `photos`, actual table is `project_photos`
--    Also add columns the API inserts that don't exist on project_photos.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS project_photos
  ADD COLUMN IF NOT EXISTS filename      TEXT,
  ADD COLUMN IF NOT EXISTS category      TEXT DEFAULT 'Progress',
  ADD COLUMN IF NOT EXISTS latitude      NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude     NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS file_size     BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type     TEXT,
  ADD COLUMN IF NOT EXISTS title         TEXT,
  ADD COLUMN IF NOT EXISTS description   TEXT,
  ADD COLUMN IF NOT EXISTS album         TEXT DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS tags          JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS taken_by      TEXT,
  ADD COLUMN IF NOT EXISTS phase         TEXT DEFAULT 'General';

-- Create the view that API routes reference
CREATE OR REPLACE VIEW photos AS SELECT * FROM project_photos;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. PUNCH LIST: API calls `punch_list`, actual table is `punch_list_items`
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW punch_list AS SELECT * FROM punch_list_items;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. TAKEOFFS: API calls `takeoff_projects`, actual table is `takeoffs`
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW takeoff_projects AS SELECT * FROM takeoffs;


-- ────────────────────────────────────────────────────────────────────────────
-- 4. SAFETY INCIDENTS: No table exists. Create it.
--    Columns match what safety/create and safety/incidents/create routes INSERT.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS safety_incidents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  project_id       UUID REFERENCES projects(id) ON DELETE CASCADE,
  incident_number  TEXT,
  title            TEXT,
  incident_type    TEXT DEFAULT 'near_miss',
  incident_date    DATE DEFAULT CURRENT_DATE,
  incident_time    TIME,
  location         TEXT,
  description      TEXT,
  severity         TEXT DEFAULT 'minor',
  injury_type      TEXT,
  injured_person   TEXT,
  injured_company  TEXT,
  body_part        TEXT,
  treatment        TEXT,
  days_away        INTEGER DEFAULT 0,
  days_restricted  INTEGER DEFAULT 0,
  recordable       BOOLEAN DEFAULT false,
  osha_reportable  BOOLEAN DEFAULT false,
  witnesses        JSONB DEFAULT '[]',
  root_cause       TEXT,
  corrective_actions JSONB DEFAULT '[]',
  preventive_measures TEXT,
  investigation_by TEXT,
  investigation_date DATE,
  investigation_notes TEXT,
  photos           JSONB DEFAULT '[]',
  photo_urls       JSONB DEFAULT '[]',
  status           TEXT DEFAULT 'open',
  reported_by      TEXT,
  reported_to      TEXT,
  supervisor_name  TEXT,
  gps_lat          NUMERIC(10,7),
  gps_lng          NUMERIC(10,7),
  file_url         TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 5. SAFETY INSPECTIONS: No table exists. Create it.
--    Columns match what safety/inspections/create route INSERTs.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS safety_inspections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  project_id       UUID REFERENCES projects(id) ON DELETE CASCADE,
  inspection_type  TEXT DEFAULT 'general',
  inspection_date  DATE DEFAULT CURRENT_DATE,
  inspector        TEXT,
  location         TEXT,
  status           TEXT DEFAULT 'draft',
  checklist        JSONB DEFAULT '[]',
  score            INTEGER,
  overall_result   TEXT DEFAULT 'pending',
  notes            TEXT,
  photo_urls       JSONB DEFAULT '[]',
  gps_lat          NUMERIC(10,7),
  gps_lng          NUMERIC(10,7),
  weather          TEXT,
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_date   DATE,
  file_url         TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 6. SAFETY CORRECTIVE ACTIONS: No table exists. Create it.
--    Columns match what corrective-actions route INSERTs.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS safety_corrective_actions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  project_id       UUID REFERENCES projects(id) ON DELETE CASCADE,
  incident_id      UUID REFERENCES safety_incidents(id) ON DELETE SET NULL,
  inspection_id    UUID REFERENCES safety_inspections(id) ON DELETE SET NULL,
  description      TEXT NOT NULL,
  assigned_to      TEXT,
  due_date         DATE,
  status           TEXT DEFAULT 'open',
  priority         TEXT DEFAULT 'normal',
  completed_at     TIMESTAMPTZ,
  verified_by      TEXT,
  verified_at      TIMESTAMPTZ,
  notes            TEXT,
  photos           JSONB DEFAULT '[]',
  created_by       UUID,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 7. SAFETY TALKS (Toolbox Talks): No table exists. Create it.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS safety_talks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  project_id       UUID REFERENCES projects(id) ON DELETE CASCADE,
  topic            TEXT NOT NULL,
  content          TEXT,
  presenter        TEXT,
  talk_date        DATE DEFAULT CURRENT_DATE,
  attendees        JSONB DEFAULT '[]',
  sign_off         JSONB DEFAULT '[]',
  status           TEXT DEFAULT 'draft',
  duration_minutes INTEGER,
  file_url         TEXT,
  notes            TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 8. SUBMITTALS: Table exists but missing columns that API inserts.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS submittals
  ADD COLUMN IF NOT EXISTS submitted_by   TEXT,
  ADD COLUMN IF NOT EXISTS submitted_to   TEXT,
  ADD COLUMN IF NOT EXISTS subcontractor  TEXT,
  ADD COLUMN IF NOT EXISTS description    TEXT,
  ADD COLUMN IF NOT EXISTS priority       TEXT DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS due_date       DATE,
  ADD COLUMN IF NOT EXISTS created_by     UUID,
  ADD COLUMN IF NOT EXISTS revision       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ball_in_court  TEXT,
  ADD COLUMN IF NOT EXISTS response_date  DATE,
  ADD COLUMN IF NOT EXISTS response_notes TEXT,
  ADD COLUMN IF NOT EXISTS distribution   JSONB DEFAULT '[]';


-- ────────────────────────────────────────────────────────────────────────────
-- 9. INDEXES for common query patterns
-- ────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_safety_incidents_project   ON safety_incidents(project_id);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_tenant    ON safety_incidents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_status    ON safety_incidents(status);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_date      ON safety_incidents(incident_date);

CREATE INDEX IF NOT EXISTS idx_safety_inspections_project ON safety_inspections(project_id);
CREATE INDEX IF NOT EXISTS idx_safety_inspections_tenant  ON safety_inspections(tenant_id);

CREATE INDEX IF NOT EXISTS idx_safety_ca_project          ON safety_corrective_actions(project_id);
CREATE INDEX IF NOT EXISTS idx_safety_ca_incident         ON safety_corrective_actions(incident_id);
CREATE INDEX IF NOT EXISTS idx_safety_ca_status           ON safety_corrective_actions(status);

CREATE INDEX IF NOT EXISTS idx_safety_talks_project       ON safety_talks(project_id);

CREATE INDEX IF NOT EXISTS idx_project_photos_category    ON project_photos(category);
CREATE INDEX IF NOT EXISTS idx_project_photos_phase       ON project_photos(phase);


-- ────────────────────────────────────────────────────────────────────────────
-- 10. Refresh PostgREST schema cache
-- ────────────────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
