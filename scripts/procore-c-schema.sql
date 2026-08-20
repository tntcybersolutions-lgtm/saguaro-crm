-- SPRINT PROCORE-C — DATABASE SCHEMA
-- QuickBooks connection, spec sections, inspection templates, photo pins, QR punch

-- QuickBooks connection per tenant
CREATE TABLE IF NOT EXISTS qbo_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE,
  realm_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  company_name TEXT,
  connected_at TIMESTAMPTZ DEFAULT now(),
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'idle'
);

ALTER TABLE qbo_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qbo_tenant" ON qbo_connections
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- QBO sync log
CREATE TABLE IF NOT EXISTS qbo_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('invoices','vendors','employees','chart_of_accounts','projects','timesheets')),
  direction TEXT NOT NULL CHECK (direction IN ('push','pull')),
  records_synced INT DEFAULT 0,
  errors INT DEFAULT 0,
  error_details JSONB DEFAULT '[]',
  synced_at TIMESTAMPTZ DEFAULT now()
);

-- Specification sections library
CREATE TABLE IF NOT EXISTS spec_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id),
  section_number TEXT NOT NULL,
  section_title TEXT NOT NULL,
  division TEXT NOT NULL,
  division_title TEXT,
  doc_url TEXT,
  part_1_general TEXT,
  part_2_products TEXT,
  part_3_execution TEXT,
  revision TEXT DEFAULT '0',
  issued_date DATE,
  related_submittals UUID[] DEFAULT '{}',
  related_rfis UUID[] DEFAULT '{}',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spec_project
  ON spec_sections(project_id, tenant_id, division);

ALTER TABLE spec_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spec_tenant" ON spec_sections
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- AHJ Inspection checklists
CREATE TABLE IF NOT EXISTS inspection_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  ahj TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  is_system_template BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE inspection_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_tenant_or_system" ON inspection_templates
  USING (tenant_id IS NULL OR tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- Photo drawing pins
ALTER TABLE project_photos
  ADD COLUMN IF NOT EXISTS drawing_sheet_id UUID REFERENCES drawing_sheets(id),
  ADD COLUMN IF NOT EXISTS drawing_x_pct NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS drawing_y_pct NUMERIC(6,4);

-- QR codes for punch items
ALTER TABLE punch_list
  ADD COLUMN IF NOT EXISTS qr_code TEXT,
  ADD COLUMN IF NOT EXISTS room_number TEXT,
  ADD COLUMN IF NOT EXISTS floor_level TEXT;

-- QBO sync columns on existing tables
ALTER TABLE employees ADD COLUMN IF NOT EXISTS qbo_employee_id TEXT;
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS qbo_vendor_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS qbo_id TEXT;

-- Seed AHJ inspection templates
INSERT INTO inspection_templates (name, type, ahj, is_system_template, items) VALUES
('Framing Inspection', 'framing', null, true, '[
  {"id":"fr1","category":"Structural","item":"Framing lumber species and grade stamps visible","notes_required":false,"photo_required":false},
  {"id":"fr2","category":"Structural","item":"All structural members properly sized per plans","notes_required":false,"photo_required":true},
  {"id":"fr3","category":"Structural","item":"Double top plates lapped and nailed per code","notes_required":false,"photo_required":false},
  {"id":"fr4","category":"Structural","item":"Headers properly sized over all openings","notes_required":false,"photo_required":true},
  {"id":"fr5","category":"Structural","item":"King studs and jack studs at all openings","notes_required":false,"photo_required":false},
  {"id":"fr6","category":"Structural","item":"Hurricane ties or rafter straps installed","notes_required":false,"photo_required":true},
  {"id":"fr7","category":"Fasteners","item":"Nailing schedule per plans at all shear walls","notes_required":false,"photo_required":true},
  {"id":"fr8","category":"Fasteners","item":"Anchor bolts installed and embedded correctly","notes_required":false,"photo_required":false},
  {"id":"fr9","category":"Fire Blocking","item":"Fire blocking at all floor-ceiling assemblies","notes_required":false,"photo_required":true},
  {"id":"fr10","category":"Fire Blocking","item":"Fire blocking at all concealed draft openings","notes_required":false,"photo_required":false},
  {"id":"fr11","category":"Access","item":"Attic access openings per code size","notes_required":false,"photo_required":false},
  {"id":"fr12","category":"General","item":"Bracing installed at all corners and per plan","notes_required":false,"photo_required":true}
]'),
('Rough MEP Inspection', 'rough_mep', null, true, '[
  {"id":"mep1","category":"Plumbing","item":"DWV rough-in complete and pressure tested","notes_required":true,"photo_required":true},
  {"id":"mep2","category":"Plumbing","item":"Water supply rough-in complete and pressure tested (100 PSI / 30 min)","notes_required":true,"photo_required":false},
  {"id":"mep3","category":"Plumbing","item":"Pipe supports per code spacing","notes_required":false,"photo_required":false},
  {"id":"mep4","category":"Plumbing","item":"Cleanouts installed at all required locations","notes_required":false,"photo_required":false},
  {"id":"mep5","category":"Electrical","item":"Rough wiring complete per plans","notes_required":false,"photo_required":false},
  {"id":"mep6","category":"Electrical","item":"Circuit labels on panel board complete","notes_required":false,"photo_required":true},
  {"id":"mep7","category":"Electrical","item":"Grounding and bonding per NEC","notes_required":false,"photo_required":false},
  {"id":"mep8","category":"Electrical","item":"AFCI/GFCI locations per code","notes_required":false,"photo_required":false},
  {"id":"mep9","category":"HVAC","item":"Duct rough-in complete and sealed","notes_required":false,"photo_required":true},
  {"id":"mep10","category":"HVAC","item":"Equipment clearances per manufacturer specs","notes_required":false,"photo_required":false},
  {"id":"mep11","category":"HVAC","item":"Combustion air per code","notes_required":false,"photo_required":false},
  {"id":"mep12","category":"Gas","item":"Gas piping pressure test complete","notes_required":true,"photo_required":false}
]'),
('Insulation Inspection', 'insulation', null, true, '[
  {"id":"ins1","category":"Walls","item":"Insulation type and R-value per energy code","notes_required":true,"photo_required":true},
  {"id":"ins2","category":"Walls","item":"All stud cavities filled — no voids","notes_required":false,"photo_required":false},
  {"id":"ins3","category":"Ceiling","item":"Ceiling insulation depth meets code minimum","notes_required":true,"photo_required":true},
  {"id":"ins4","category":"Ceiling","item":"Baffles at eaves to maintain ventilation","notes_required":false,"photo_required":false},
  {"id":"ins5","category":"Vapor Barrier","item":"Vapor barrier installed and sealed where required","notes_required":false,"photo_required":false},
  {"id":"ins6","category":"Air Sealing","item":"All penetrations and gaps sealed","notes_required":false,"photo_required":false},
  {"id":"ins7","category":"Air Sealing","item":"Top plate penetrations caulked or foamed","notes_required":false,"photo_required":true}
]'),
('Final Building Inspection', 'final_building', null, true, '[
  {"id":"fin1","category":"Structural","item":"All framing, masonry, and structural elements complete","notes_required":false,"photo_required":false},
  {"id":"fin2","category":"Exterior","item":"All exterior openings weatherproofed","notes_required":false,"photo_required":false},
  {"id":"fin3","category":"Exterior","item":"Site drainage positive away from foundation","notes_required":false,"photo_required":false},
  {"id":"fin4","category":"Life Safety","item":"All smoke detectors installed and functional","notes_required":false,"photo_required":true},
  {"id":"fin5","category":"Life Safety","item":"All CO detectors installed and functional","notes_required":false,"photo_required":false},
  {"id":"fin6","category":"Life Safety","item":"Emergency egress windows per code","notes_required":false,"photo_required":false},
  {"id":"fin7","category":"Life Safety","item":"All fire separations complete and sealed","notes_required":false,"photo_required":true},
  {"id":"fin8","category":"Electrical","item":"All panels labeled and energized","notes_required":false,"photo_required":false},
  {"id":"fin9","category":"Electrical","item":"All receptacles and switches complete and operational","notes_required":false,"photo_required":false},
  {"id":"fin10","category":"Plumbing","item":"All fixtures installed and operational","notes_required":false,"photo_required":false},
  {"id":"fin11","category":"Plumbing","item":"Water heater installed per code and permitted","notes_required":false,"photo_required":true},
  {"id":"fin12","category":"HVAC","item":"HVAC system operational and balanced","notes_required":false,"photo_required":false},
  {"id":"fin13","category":"HVAC","item":"All vents and diffusers installed","notes_required":false,"photo_required":false},
  {"id":"fin14","category":"Accessibility","item":"ADA compliant features per approved plans","notes_required":false,"photo_required":false},
  {"id":"fin15","category":"General","item":"Certificate of Occupancy documentation ready","notes_required":false,"photo_required":false}
]')
ON CONFLICT DO NOTHING;
