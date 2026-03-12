-- ─── Migration 011: Field App Enhancement Tables ─────────────────────────────
-- Adds: equipment_logs, drawing_pins, project_messages (if not exists)

-- ─── Equipment Logs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  equipment_name TEXT NOT NULL DEFAULT '',
  operator       TEXT NOT NULL DEFAULT '',
  hours_used     DECIMAL(6,2) NOT NULL DEFAULT 0,
  condition      TEXT NOT NULL DEFAULT 'Good' CHECK (condition IN ('Good','Fair','Needs Service','Down')),
  notes          TEXT NOT NULL DEFAULT '',
  work_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS equipment_logs_tenant_id_idx   ON equipment_logs(tenant_id);
CREATE INDEX IF NOT EXISTS equipment_logs_project_id_idx  ON equipment_logs(project_id);
CREATE INDEX IF NOT EXISTS equipment_logs_work_date_idx   ON equipment_logs(work_date);

ALTER TABLE equipment_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "equipment_logs_tenant_isolation"
  ON equipment_logs FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ─── Drawing Pins ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drawing_pins (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id       UUID REFERENCES projects(id) ON DELETE CASCADE,
  drawing_id       UUID REFERENCES drawings(id) ON DELETE CASCADE,
  x_pct            DECIMAL(6,4) NOT NULL DEFAULT 0,   -- 0.0 to 1.0
  y_pct            DECIMAL(6,4) NOT NULL DEFAULT 0,   -- 0.0 to 1.0
  title            TEXT NOT NULL DEFAULT '',
  note             TEXT NOT NULL DEFAULT '',
  category         TEXT NOT NULL DEFAULT 'Other' CHECK (category IN ('RFI','Punch','Safety','Other')),
  created_by_email TEXT NOT NULL DEFAULT '',
  resolved         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS drawing_pins_tenant_id_idx   ON drawing_pins(tenant_id);
CREATE INDEX IF NOT EXISTS drawing_pins_drawing_id_idx  ON drawing_pins(drawing_id);
CREATE INDEX IF NOT EXISTS drawing_pins_project_id_idx  ON drawing_pins(project_id);

ALTER TABLE drawing_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "drawing_pins_tenant_isolation"
  ON drawing_pins FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ─── Project Messages (ensure exists with correct columns) ───────────────────
CREATE TABLE IF NOT EXISTS project_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL DEFAULT 'Field User',
  content     TEXT NOT NULL DEFAULT '',
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_messages_tenant_id_idx   ON project_messages(tenant_id);
CREATE INDEX IF NOT EXISTS project_messages_project_id_idx  ON project_messages(project_id);
CREATE INDEX IF NOT EXISTS project_messages_created_at_idx  ON project_messages(created_at);

ALTER TABLE project_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "project_messages_tenant_isolation"
  ON project_messages FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ─── Enable Realtime for key tables ──────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE project_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE rfis;
ALTER PUBLICATION supabase_realtime ADD TABLE punch_list_items;

-- ─── Drawings table — ensure thumbnail_url column exists ─────────────────────
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS description   TEXT NOT NULL DEFAULT '';
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE;
