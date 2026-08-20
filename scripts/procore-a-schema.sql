-- SPRINT PROCORE-A: Drawing Markup + RFI Pins + Revision History
-- Run against Supabase project jddfvugsaosvgllbkzch

-- Drawing markup annotations stored as JSON
CREATE TABLE IF NOT EXISTS drawing_markups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  drawing_sheet_id UUID NOT NULL REFERENCES drawing_sheets(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id),
  page_number INT NOT NULL DEFAULT 1,
  markup_data JSONB NOT NULL DEFAULT '[]', -- Fabric.js canvas JSON
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RFI pins on drawings
CREATE TABLE IF NOT EXISTS rfi_drawing_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  rfi_id UUID NOT NULL REFERENCES rfis(id) ON DELETE CASCADE,
  drawing_sheet_id UUID NOT NULL REFERENCES drawing_sheets(id),
  page_number INT NOT NULL DEFAULT 1,
  x_pct NUMERIC(6,4) NOT NULL, -- 0-1 percentage of page width
  y_pct NUMERIC(6,4) NOT NULL, -- 0-1 percentage of page height
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Drawing revision sets (when architect issues Rev 3)
CREATE TABLE IF NOT EXISTS drawing_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  drawing_sheet_id UUID NOT NULL REFERENCES drawing_sheets(id),
  revision_number TEXT NOT NULL, -- '0', '1', '2', 'A', 'B', etc.
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  issued_date DATE,
  issued_by TEXT,
  change_description TEXT,
  is_current BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_current_revision
  ON drawing_revisions(drawing_sheet_id) WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_markup_sheet
  ON drawing_markups(drawing_sheet_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_rfi_pins_sheet
  ON rfi_drawing_pins(drawing_sheet_id, tenant_id);

ALTER TABLE drawing_markups ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfi_drawing_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawing_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "markup_tenant" ON drawing_markups
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "rfi_pins_tenant" ON rfi_drawing_pins
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "revisions_tenant" ON drawing_revisions
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
