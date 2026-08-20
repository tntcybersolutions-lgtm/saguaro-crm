-- ─── FIELD-COMPLETE SPRINT DB ADDITIONS ──────────────────────────────
-- 2026-04-16

-- ─── DAILY LOG ENHANCEMENTS ─────────────────────────────────────────
ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS manpower_by_trade JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS materials_received TEXT,
  ADD COLUMN IF NOT EXISTS visitors TEXT,
  ADD COLUMN IF NOT EXISTS equipment_on_site TEXT,
  ADD COLUMN IF NOT EXISTS weather_delay_hours NUMERIC(4,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subcontractors_on_site TEXT[];

-- ─── PHOTO DRAWING PIN ──────────────────────────────────────────────
ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS drawing_sheet_id UUID,
  ADD COLUMN IF NOT EXISTS drawing_x_pct NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS drawing_y_pct NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS drawing_sheet_number TEXT,
  ADD COLUMN IF NOT EXISTS photo_type TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS punch_list_item_id UUID,
  ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_reason TEXT;

-- ─── PUNCH LIST QR + ROOM FIELDS ────────────────────────────────────
ALTER TABLE punch_list
  ADD COLUMN IF NOT EXISTS room_number TEXT,
  ADD COLUMN IF NOT EXISTS floor_level TEXT,
  ADD COLUMN IF NOT EXISTS qr_url TEXT,
  ADD COLUMN IF NOT EXISTS section TEXT;

-- ─── SAFETY INCIDENTS FULL FIELDS ───────────────────────────────────
ALTER TABLE safety_incidents
  ADD COLUMN IF NOT EXISTS osha_recordable BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'near_miss',
  ADD COLUMN IF NOT EXISTS body_part TEXT,
  ADD COLUMN IF NOT EXISTS injury_nature TEXT,
  ADD COLUMN IF NOT EXISTS days_away INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS days_restricted INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employee_name TEXT,
  ADD COLUMN IF NOT EXISTS employee_id UUID,
  ADD COLUMN IF NOT EXISTS incident_date DATE,
  ADD COLUMN IF NOT EXISTS time_of_incident TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS witnesses TEXT,
  ADD COLUMN IF NOT EXISTS root_cause TEXT,
  ADD COLUMN IF NOT EXISTS corrective_actions TEXT,
  ADD COLUMN IF NOT EXISTS reported_to_osha BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS osha_case_number TEXT,
  ADD COLUMN IF NOT EXISTS first_aid_only BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS medical_treatment BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_safety_osha
  ON safety_incidents(project_id, tenant_id, incident_date, osha_recordable);

-- ─── INSPECTIONS FULL SCHEMA ────────────────────────────────────────
ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS template_id UUID,
  ADD COLUMN IF NOT EXISTS inspection_type TEXT,
  ADD COLUMN IF NOT EXISTS ahj_name TEXT,
  ADD COLUMN IF NOT EXISTS permit_number TEXT,
  ADD COLUMN IF NOT EXISTS inspector_name TEXT,
  ADD COLUMN IF NOT EXISTS inspector_agency TEXT,
  ADD COLUMN IF NOT EXISTS result TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS deficiency_notes TEXT,
  ADD COLUMN IF NOT EXISTS re_inspection_date DATE,
  ADD COLUMN IF NOT EXISTS signed_off_by TEXT,
  ADD COLUMN IF NOT EXISTS signed_off_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS weather TEXT,
  ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}';

-- ─── FIELD ISSUES FULL SCHEMA ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  issue_number TEXT,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'open',
  location TEXT,
  reported_by UUID,
  assigned_to UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE field_issues
  ADD COLUMN IF NOT EXISTS assigned_to_name TEXT,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_notes TEXT,
  ADD COLUMN IF NOT EXISTS cost_impact NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS schedule_impact_days INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS converted_to_rfi_id UUID,
  ADD COLUMN IF NOT EXISTS converted_to_punch_id UUID;

CREATE INDEX IF NOT EXISTS idx_field_issues_project
  ON field_issues(project_id, tenant_id, status, created_at DESC);

ALTER TABLE field_issues ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='field_issues' AND policyname='field_issues_tenant') THEN
    CREATE POLICY "field_issues_tenant" ON field_issues
      USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
  END IF;
END$$;

-- ─── TIMECARD ENHANCEMENTS ──────────────────────────────────────────
ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS meal_break_mins INT DEFAULT 30,
  ADD COLUMN IF NOT EXISTS per_diem BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS certification_required TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ─── TOOLBOX TALKS TABLE ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS toolbox_talks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  topic TEXT NOT NULL,
  presenter TEXT,
  talk_date DATE NOT NULL,
  duration_minutes INT DEFAULT 15,
  attendees TEXT[],
  attendee_count INT DEFAULT 0,
  content TEXT,
  ai_generated_content TEXT,
  signatures JSONB DEFAULT '[]',
  photos TEXT[] DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_toolbox_project
  ON toolbox_talks(project_id, tenant_id, talk_date DESC);

ALTER TABLE toolbox_talks ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='toolbox_talks' AND policyname='toolbox_tenant') THEN
    CREATE POLICY "toolbox_tenant" ON toolbox_talks
      USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
  END IF;
END$$;

-- ─── INSPECTION TEMPLATES TABLE (if not present) ────────────────────
CREATE TABLE IF NOT EXISTS inspection_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  name TEXT NOT NULL,
  type TEXT,
  ahj TEXT,
  items JSONB DEFAULT '[]',
  is_global BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed AHJ templates (only if table is empty of globals)
INSERT INTO inspection_templates (name, type, ahj, items, is_global)
SELECT 'Framing Inspection', 'framing', 'Local Building Dept',
  '[
    {"id":"f1","category":"Structural","item":"Studs plumb, straight, and at proper spacing","notes_required":false,"photo_required":true},
    {"id":"f2","category":"Structural","item":"Top and bottom plates continuous and fastened","notes_required":false,"photo_required":false},
    {"id":"f3","category":"Structural","item":"Headers sized per plans","notes_required":false,"photo_required":true},
    {"id":"f4","category":"Structural","item":"Shear wall nailing pattern correct","notes_required":true,"photo_required":true},
    {"id":"f5","category":"Connections","item":"Hold-downs and straps installed per plans","notes_required":false,"photo_required":true},
    {"id":"f6","category":"Fire Blocking","item":"All penetrations and cavities fire-blocked","notes_required":false,"photo_required":false}
  ]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM inspection_templates WHERE is_global = true AND type='framing');

INSERT INTO inspection_templates (name, type, ahj, items, is_global)
SELECT 'Rough MEP Inspection', 'rough_mep', 'Local Building Dept',
  '[
    {"id":"m1","category":"Electrical","item":"Rough wiring secured and protected","notes_required":false,"photo_required":true},
    {"id":"m2","category":"Electrical","item":"Box fill calculations met","notes_required":false,"photo_required":false},
    {"id":"m3","category":"Electrical","item":"GFCI/AFCI locations correct","notes_required":false,"photo_required":false},
    {"id":"m4","category":"Plumbing","item":"DWV slope and sizing correct","notes_required":false,"photo_required":true},
    {"id":"m5","category":"Plumbing","item":"Water supply lines tested","notes_required":true,"photo_required":false},
    {"id":"m6","category":"Mechanical","item":"Ductwork sealed and supported","notes_required":false,"photo_required":true}
  ]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM inspection_templates WHERE is_global = true AND type='rough_mep');

INSERT INTO inspection_templates (name, type, ahj, items, is_global)
SELECT 'Insulation Inspection', 'insulation', 'Local Building Dept',
  '[
    {"id":"i1","category":"Insulation","item":"R-value meets plans","notes_required":false,"photo_required":true},
    {"id":"i2","category":"Insulation","item":"No gaps, voids, or compression","notes_required":false,"photo_required":true},
    {"id":"i3","category":"Air Sealing","item":"All penetrations sealed","notes_required":false,"photo_required":false},
    {"id":"i4","category":"Vapor Barrier","item":"Installed on warm side of wall","notes_required":false,"photo_required":false}
  ]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM inspection_templates WHERE is_global = true AND type='insulation');

INSERT INTO inspection_templates (name, type, ahj, items, is_global)
SELECT 'Final Inspection', 'final', 'Local Building Dept',
  '[
    {"id":"fin1","category":"Life Safety","item":"Smoke detectors operable","notes_required":false,"photo_required":true},
    {"id":"fin2","category":"Life Safety","item":"CO detectors operable","notes_required":false,"photo_required":true},
    {"id":"fin3","category":"Life Safety","item":"Egress windows meet code","notes_required":false,"photo_required":false},
    {"id":"fin4","category":"Life Safety","item":"Address numbers visible from street","notes_required":false,"photo_required":false},
    {"id":"fin5","category":"Plumbing","item":"All fixtures installed and operable","notes_required":false,"photo_required":false},
    {"id":"fin6","category":"Electrical","item":"All devices installed and trimmed","notes_required":false,"photo_required":false},
    {"id":"fin7","category":"Mechanical","item":"HVAC operating correctly","notes_required":true,"photo_required":false},
    {"id":"fin8","category":"Finish","item":"All finishes per scope","notes_required":false,"photo_required":true}
  ]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM inspection_templates WHERE is_global = true AND type='final');
