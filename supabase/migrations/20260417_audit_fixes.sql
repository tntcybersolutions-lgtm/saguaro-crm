-- Audit fixes sprint — 2026-04-17
-- BUG 1/4: Convert bid_packages.jacket_sections from TEXT[] to JSONB
-- BUG 3: Seed inspection_templates with the 4 baseline AHJ templates

-- =========================================================================
-- 1. bid_packages.jacket_sections TEXT[] -> JSONB
-- =========================================================================
ALTER TABLE bid_packages
  ALTER COLUMN jacket_sections TYPE JSONB
  USING CASE
    WHEN jacket_sections IS NULL THEN NULL
    ELSE '{}'::jsonb
  END;

-- Verify (run manually after migration):
--   SELECT column_name, data_type, udt_name
--   FROM information_schema.columns
--   WHERE table_name = 'bid_packages' AND column_name = 'jacket_sections';
--   -- expect: data_type = 'jsonb', udt_name = 'jsonb'

-- =========================================================================
-- 2. Seed inspection_templates (4 baseline templates, 24 total checklist items)
-- =========================================================================
INSERT INTO inspection_templates (name, category, type, ahj, is_global, is_active, fields) VALUES
('Framing Inspection', 'Framing', 'framing', 'Local Building Dept', true, true,
'[
  {"name":"f1","label":"Studs plumb and at correct spacing","category":"Structural","required":true,"photo_required":true,"notes_required":false},
  {"name":"f2","label":"Top and bottom plates continuous and fastened","category":"Structural","required":true,"photo_required":false,"notes_required":false},
  {"name":"f3","label":"Headers properly sized over all openings","category":"Structural","required":true,"photo_required":true,"notes_required":false},
  {"name":"f4","label":"Shear wall nailing pattern correct per plans","category":"Structural","required":true,"photo_required":true,"notes_required":true},
  {"name":"f5","label":"Hold-downs and straps installed per plans","category":"Connections","required":true,"photo_required":true,"notes_required":false},
  {"name":"f6","label":"Fire blocking at all floor-ceiling assemblies","category":"Fire Blocking","required":true,"photo_required":false,"notes_required":false}
]'::jsonb),

('Rough MEP Inspection', 'MEP', 'rough_mep', 'Local Building Dept', true, true,
'[
  {"name":"m1","label":"Rough wiring secured, protected and labeled","category":"Electrical","required":true,"photo_required":true,"notes_required":false},
  {"name":"m2","label":"GFCI and AFCI locations correct per NEC","category":"Electrical","required":true,"photo_required":false,"notes_required":false},
  {"name":"m3","label":"Panel schedule complete and circuits labeled","category":"Electrical","required":true,"photo_required":true,"notes_required":false},
  {"name":"m4","label":"DWV rough-in slope correct and pressure tested","category":"Plumbing","required":true,"photo_required":true,"notes_required":true},
  {"name":"m5","label":"Water supply lines tested at 100 PSI for 30 min","category":"Plumbing","required":true,"photo_required":false,"notes_required":true},
  {"name":"m6","label":"Ductwork sealed, supported and complete","category":"Mechanical","required":true,"photo_required":true,"notes_required":false}
]'::jsonb),

('Insulation Inspection', 'Insulation', 'insulation', 'Local Building Dept', true, true,
'[
  {"name":"i1","label":"R-value meets energy code requirements","category":"Insulation","required":true,"photo_required":true,"notes_required":true},
  {"name":"i2","label":"No gaps, voids or compression in insulation","category":"Insulation","required":true,"photo_required":true,"notes_required":false},
  {"name":"i3","label":"All penetrations caulked or foamed airtight","category":"Air Sealing","required":true,"photo_required":false,"notes_required":false},
  {"name":"i4","label":"Vapor barrier on correct side of assembly","category":"Vapor Barrier","required":true,"photo_required":false,"notes_required":false}
]'::jsonb),

('Final Building Inspection', 'Final', 'final', 'Local Building Dept', true, true,
'[
  {"name":"fin1","label":"All smoke detectors installed and operational","category":"Life Safety","required":true,"photo_required":true,"notes_required":false},
  {"name":"fin2","label":"CO detectors installed per code locations","category":"Life Safety","required":true,"photo_required":false,"notes_required":false},
  {"name":"fin3","label":"Egress windows meet minimum size requirements","category":"Life Safety","required":true,"photo_required":false,"notes_required":false},
  {"name":"fin4","label":"All electrical devices installed and trimmed","category":"Electrical","required":true,"photo_required":false,"notes_required":false},
  {"name":"fin5","label":"All plumbing fixtures installed and operational","category":"Plumbing","required":true,"photo_required":false,"notes_required":false},
  {"name":"fin6","label":"HVAC system operational and balanced","category":"Mechanical","required":true,"photo_required":false,"notes_required":true},
  {"name":"fin7","label":"All finishes complete per approved scope","category":"Finishes","required":true,"photo_required":true,"notes_required":false},
  {"name":"fin8","label":"Address numbers visible from street","category":"Life Safety","required":true,"photo_required":false,"notes_required":false}
]'::jsonb);

-- Verify (run manually after migration):
--   SELECT name, type, jsonb_array_length(fields) AS items
--   FROM inspection_templates
--   WHERE is_global = true;
--   -- expect: 4 rows with 6, 6, 4, 8 items respectively
